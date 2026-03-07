# Guia de Busca nos Logs de Acesso — Confessorium

## Estrutura dos Logs

Cada entrada no Firestore (collection `access_logs`, banco `confessorium`) contém:

| Campo         | Tipo              | Conteúdo                          | Visível no Firestore? |
|---------------|-------------------|-----------------------------------|-----------------------|
| `event`       | string            | `room_created` / `room_joined` / `invite_redeemed` | Sim |
| `roomIdShort` | string (8 chars)  | Primeiros 8 chars do room ID      | Sim |
| `timezone`    | string            | Sempre `"UTC"`                    | Sim |
| `timestamp`   | Timestamp (UTC)   | Data e hora da conexão            | Sim |
| `iv`          | string (hex)      | Vetor de inicialização AES-GCM    | Sim (cifrado) |
| `encrypted`   | string (hex)      | IP4 + IP6 + porta (cifrados)      | Sim (cifrado) |
| `tag`         | string (hex)      | Auth tag GCM                      | Sim (cifrado) |

**IP e porta só são legíveis pelo dashboard** (descriptografados pelo servidor com a LOG_ENCRYPTION_KEY).

---

## Método 1 — Dashboard (recomendado)

URL: `https://<project-id>.uc.r.appspot.com/dashboard`

### Filtros disponíveis na barra de filtros:

| Filtro        | Como usar                              | Comportamento               |
|---------------|----------------------------------------|-----------------------------|
| **Evento**    | Selecione no dropdown                  | Exato (`where event == x`)  |
| **Sala**      | Digite os primeiros chars do room ID   | Prefixo (`roomIdShort >= r`) |
| **De / Até**  | Selecione data e hora local            | Range no timestamp UTC      |

### Exemplos práticos:

**"Quero ver quem entrou na sala abc12345 ontem"**
- Sala: `abc12345`
- De: data de ontem 00:00
- Até: data de ontem 23:59
- Clicar em **filtrar**

**"Quero ver todos os convites usados esta semana"**
- Evento: `convite usado`
- De: segunda-feira 00:00
- Até: hoje 23:59

**"Quero ver as últimas 100 conexões (sem filtro)"**
- Clicar em **limpar** → os 100 mais recentes aparecem automaticamente

---

## Método 2 — API direta (autenticada)

Endpoint: `GET /api/access-logs`
Autenticação: Basic Auth (usuário `admin`, senha = `DASHBOARD_PASSWORD` do app.yaml)

### Parâmetros de query:

| Parâmetro | Tipo   | Descrição                               | Exemplo                        |
|-----------|--------|-----------------------------------------|--------------------------------|
| `event`   | string | Filtro exato por tipo de evento         | `?event=room_created`          |
| `room`    | string | Prefixo do roomIdShort (max 8 chars)    | `?room=abc12345`               |
| `from`    | string | Timestamp mínimo (ISO 8601)             | `?from=2026-03-01T00:00:00Z`   |
| `to`      | string | Timestamp máximo (ISO 8601)             | `?to=2026-03-01T23:59:59Z`     |
| `limit`   | number | Máximo de resultados (padrão 100, max 500) | `?limit=200`                |

Combinação de exemplo:
```
GET /api/access-logs?event=invite_redeemed&from=2026-03-01T00:00:00Z&to=2026-03-07T23:59:59Z
```

---

## Método 3 — Firestore Console (campos plaintext)

URL: https://console.cloud.google.com → Firestore → banco `confessorium` → collection `access_logs`

### O que você pode filtrar diretamente no console (sem descriptografar):
- `event` == "room_created" | "room_joined" | "invite_redeemed"
- `roomIdShort` == "abc12345"
- `timestamp` >= / <= (seletor de data no console)

### O que você NÃO pode buscar no console:
- IP (IPv4 / IPv6) — está cifrado nos campos `encrypted`/`iv`/`tag`
- Porta — também cifrada

Para buscar por IP, use o dashboard ou a API.

---

## Índices Compostos Necessários no Firestore

Quando você combina filtro por `event` ou `room` com ordenação por `timestamp`, o Firestore
exige um índice composto. Se a busca no dashboard retornar um erro, ele virá acompanhado de
uma URL para criar o índice com um clique.

Índices que podem ser necessários:

| Filtro usado         | Índice necessário                            |
|----------------------|----------------------------------------------|
| `event` + ordenação  | `event ASC, timestamp DESC`                  |
| `room` + ordenação   | `roomIdShort ASC, timestamp DESC`            |
| `event` + `room`     | `event ASC, roomIdShort ASC, timestamp DESC` |

**Como criar:**
1. Abrir Firestore Console → banco `confessorium` → Índices → Composto → Adicionar índice
2. Collection: `access_logs`
3. Adicionar os campos conforme a tabela acima
4. Aguardar build (alguns minutos)

Ou copiar a URL que aparece no erro da API — ela abre a tela de criação pré-preenchida.

---

## Busca por IP (investigação)

Se você tem um IP e quer saber quando ele acessou:
1. No dashboard, sem filtros, navegue pelos logs (IP aparece descriptografado)
2. Ou use `Ctrl+F` no navegador na página do dashboard (a tabela está no DOM)
3. Para datasets grandes: use a API com filtro de período + busca no terminal:

```bash
curl -u admin:SENHA "https://SEU-APP.appspot.com/api/access-logs?limit=500&from=DATA" \
  | jq '.logs[] | select(.ip4 == "1.2.3.4")'
```

---

## Dicas Rápidas

- O **room ID completo** aparece na URL da sala: `https://app.com/ROOM-ID-COMPLETO`
  Os primeiros 8 chars são o `roomIdShort` usado nos logs.
- Timestamps no Firestore são UTC. Converta horário de Brasília: subtraia 3h (horário padrão)
  ou 2h (horário de verão).
- O dashboard auto-atualiza a cada 30s. Use o botão **atualizar agora** para forçar.
- Resultado máximo por consulta: **500 entradas**. Para extrair tudo use intervalos de data.
