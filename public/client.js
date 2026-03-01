const socket = io();

// ============================================================
// DOM Elements
// ============================================================
const $ = (sel) => document.querySelector(sel);
const body = document.body;
const messages = $('#messages');
const form = $('#form');
const input = $('#input');
const attachBtn = $('#attach-btn');
const imageInput = $('#image-input');
const copyBubble = $('#copy-bubble');
const themeToggle = $('#theme-toggle');
const sunIcon = $('#sun-icon');
const moonIcon = $('#moon-icon');
const imageModal = $('#image-modal');
const modalImageContent = $('#modal-image-content');
const closeModalBtn = $('.close-modal');
const userCountNumber = $('#user-count-number');
const onlineUsersWrapper = $('#online-users-wrapper');
const onlineUsersBtn = $('#online-users-btn');
const onlineUsersList = $('#online-users-list');
const dropdownCount = $('#dropdown-count');
const inviteBtn = $('#invite-btn');
const faqBtn = $('#faq-btn');
const newRoomBtn = $('#new-room-btn');
const faqModal = $('#faq-modal');
const faqContainer = $('#faq-container');
const e2eBadge = $('#e2e-badge');
const roomTimerEl = $('#room-timer');
const timerText = $('#timer-text');
const soundBtn = $('#sound-btn');
const notifBtn = $('#notif-btn');
const securityBtn = $('#security-btn');
const securityModal = $('#security-modal');
const securityClose = $('#security-close');
const securityCode = $('#security-code');
const scrollBottomBtn = $('#scroll-bottom-btn');
const typingIndicator = $('#typing-indicator');
const replyBar = $('#reply-bar');
const replyText = $('#reply-text');
const replyClose = $('#reply-close');
const ephemeralBtn = $('#ephemeral-btn');
const passwordModal = $('#password-modal');
const passwordInput = $('#password-input');
const passwordSubmit = $('#password-submit');
const passwordError = $('#password-error');
const qrModal = $('#qr-modal');
const qrClose = $('#qr-close');
const qrCanvas = $('#qr-canvas');
const myUsernameWrapper = $('#my-username-wrapper');
const myUsernameText = $('#my-username-text');
const myUsernameInput = $('#my-username-input');

// ============================================================
// Global State
// ============================================================
let roomKey = null;
let keyPair = null;
let currentLang = 'en';
let myUsername = null;
let soundEnabled = localStorage.getItem('sound') !== 'off';
let notifEnabled = localStorage.getItem('notif') !== 'off';
let ephemeralMode = false;
let replyingTo = null; // { messageId, username, text }
let typingTimeout = null;
let isTyping = false;
let roomExpiresAt = null;
let timerInterval = null;
let pendingPassword = null;
let lastMessageSender = null;
let lastMessageTime = 0;

// Session persistence
let sessionId = sessionStorage.getItem('confessorium-session-id');
if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem('confessorium-session-id', sessionId);
}

// ============================================================
// Translations
// ============================================================
const translations = {
    en: {
        pageTitle: "Confessorium",
        placeholder: "Type your message or paste an image",
        userJoined: "{username} joined the chat.",
        userLeft: "{username} left the chat.",
        userRenamed: "{oldName} is now {newName}.",
        renameTaken: "Name already in use in this room.",
        linkCopiedBubble: "Room link copied to clipboard!",
        rateLimited: "Slow down! You're sending messages too fast.",
        imageTooLarge: "Image is too large. Max 5MB allowed.",
        roomExpired: "This room has expired and been destroyed.",
        ephemeralHint: "Ephemeral mode ON — messages disappear after 10s",
        ephemeralOff: "Ephemeral mode OFF",
        typing: "{users} typing",
        faqTitle: "Security & Privacy",
        faqSubtitle: "Everything you need to know about how we protect your conversations.",
        learnMore: "Technical details",
        eli5Label: "Explain like I'm 5",
        faq: [
            {
                icon: "user",
                title: "Do I need an account?",
                answer: "No. Confessorium is 100% anonymous. We don't ask for your name, email, or any personal information. You're simply \"User 1\", \"User 2\", and so on.",
                eli5: "Imagine a playground where nobody wears name tags. You just show up, play, and when you leave, nobody knows you were there. That's how this chat works!",
                technical: "No cookies, no tracking pixels, no analytics. Your session ID is generated locally using <strong>crypto.randomUUID()</strong> and stored only in sessionStorage (cleared when the tab closes). The server never associates your connection with any persistent identity."
            },
            {
                icon: "lock",
                title: "Are my conversations really private?",
                answer: "Yes. Every message is locked inside your browser before it ever leaves your device. Only the people in this room can read it. Not even our server can see what you write.",
                eli5: "It's like writing a secret letter, putting it in a magic box that only your friend has the key to, and then sending it through the mail. The mailman carries the box but can never open it or read what's inside!",
                technical: "We use the <strong>Web Crypto API</strong> (native to your browser) for all cryptography. Messages are encrypted with <strong>AES-GCM 256-bit</strong> symmetric encryption. The room key is exchanged between participants using <strong>RSA-OAEP 2048-bit</strong> asymmetric encryption. The server only relays encrypted payloads — it never has access to the plaintext or the keys."
            },
            {
                icon: "trash",
                title: "What happens when everyone leaves?",
                answer: "The room, the chat history, and all encryption keys are permanently destroyed. There's no way to recover them — not even by us.",
                eli5: "Think of a sandcastle on the beach. While you and your friends are there, it's your secret fort. But when everyone goes home, the waves come and wash it away completely. Nobody can ever find that same sandcastle again!",
                technical: "The room state (user map, session references) is stored only in <strong>server memory (RAM)</strong> — never written to disk or database. The AES room key exists only in <strong>browser memory (CryptoKey object)</strong>. When the last socket disconnects, the server deletes the room state. On the client side, closing the tab clears the sessionStorage and garbage-collects the CryptoKey. There is no persistence layer."
            },
            {
                icon: "eye",
                title: "Do you keep logs?",
                answer: "We log basic connection data (like when someone connects) for security. But we never — and technically cannot — log the content of your conversations.",
                eli5: "We know someone knocked on the door, but we have no idea what they whispered inside the room. It's like a teacher who sees kids enter the treehouse but can't hear what they're talking about up there!",
                technical: "Server logs may include connection timestamps and IP addresses (for abuse prevention), but <strong>message content is never logged</strong> because the server only sees encrypted binary payloads (AES-GCM ciphertext + IV). Without the AES key — which never touches the server — decryption is computationally infeasible."
            },
            {
                icon: "share",
                title: "How do I invite someone?",
                answer: "Click the share icon in the header to copy the room link. Send it to someone you trust through any channel — only people with the link can join.",
                eli5: "It's like a secret clubhouse with a super long, impossible-to-guess password on the door. You tell the password only to the friends you want inside. Nobody else can find or guess it!",
                technical: "The room ID is a <strong>128-bit random hex string</strong> generated by <strong>crypto.randomBytes(16)</strong>. This gives 3.4 &times; 10<sup>38</sup> possible combinations, making it virtually impossible to guess. The link is the only way to access the room."
            }
        ]
    },
    pt: {
        pageTitle: "Confessorium",
        placeholder: "Digite sua mensagem ou cole uma imagem",
        userJoined: "{username} entrou no chat.",
        userLeft: "{username} saiu do chat.",
        userRenamed: "{oldName} agora é {newName}.",
        renameTaken: "Nome já em uso nesta sala.",
        linkCopiedBubble: "Link da sala copiado!",
        rateLimited: "Devagar! Você está enviando mensagens rápido demais.",
        imageTooLarge: "Imagem muito grande. Máximo de 5MB permitido.",
        roomExpired: "Esta sala expirou e foi destruída.",
        ephemeralHint: "Modo efêmero ATIVADO — mensagens desaparecem em 10s",
        ephemeralOff: "Modo efêmero DESATIVADO",
        typing: "{users} digitando",
        faqTitle: "Segurança & Privacidade",
        faqSubtitle: "Tudo o que precisa saber sobre como protegemos as suas conversas.",
        learnMore: "Detalhes técnicos",
        eli5Label: "Me explique como se eu tivesse 5 anos",
        faq: [
            {
                icon: "user",
                title: "Preciso de me registar?",
                answer: "Não. O Confessorium é 100% anônimo. Não pedimos o seu nome, e-mail ou qualquer informação pessoal. Você é apenas \"Utilizador 1\", \"Utilizador 2\", e assim por diante.",
                eli5: "Imagina um parquinho onde ninguém usa crachá. Você chega, brinca, e quando vai embora, ninguém sabe que você esteve lá. É assim que este chat funciona!",
                technical: "Sem cookies, sem pixels de rastreamento, sem analytics. O seu ID de sessão é gerado localmente usando <strong>crypto.randomUUID()</strong> e armazenado apenas no sessionStorage (apagado ao fechar o separador). O servidor nunca associa a sua conexão a nenhuma identidade persistente."
            },
            {
                icon: "lock",
                title: "As minhas conversas são mesmo privadas?",
                answer: "Sim. Cada mensagem é trancada dentro do seu navegador antes de sair do seu dispositivo. Apenas as pessoas nesta sala conseguem lê-la. Nem mesmo o nosso servidor consegue ver o que escreve.",
                eli5: "É como escrever um bilhete secreto, colocar numa caixinha mágica que só o seu amigo tem a chave, e enviar pelo correio. O carteiro carrega a caixinha mas nunca consegue abrir ou ler o que está dentro!",
                technical: "Usamos a <strong>Web Crypto API</strong> (nativa do navegador) para toda a criptografia. As mensagens são encriptadas com <strong>AES-GCM de 256 bits</strong> (encriptação simétrica). A chave da sala é trocada entre participantes usando <strong>RSA-OAEP de 2048 bits</strong> (encriptação assimétrica). O servidor apenas retransmite payloads encriptados — nunca tem acesso ao texto original nem às chaves."
            },
            {
                icon: "trash",
                title: "O que acontece quando todos saem?",
                answer: "A sala, o histórico da conversa e todas as chaves de encriptação são permanentemente destruídos. Não há forma de recuperá-los — nem por nós.",
                eli5: "Pensa num castelo de areia na praia. Enquanto você e seus amigos estão lá, é o forte secreto de vocês. Mas quando todo mundo vai embora, as ondas vêm e levam tudo. Ninguém nunca mais vai encontrar aquele mesmo castelo!",
                technical: "O estado da sala (mapa de utilizadores, referências de sessão) é armazenado apenas na <strong>memória do servidor (RAM)</strong> — nunca escrito em disco ou base de dados. A chave AES da sala existe apenas na <strong>memória do navegador (objeto CryptoKey)</strong>. Quando o último socket desconecta, o servidor apaga o estado da sala. No lado do cliente, fechar o separador limpa o sessionStorage e liberta o CryptoKey. Não existe camada de persistência."
            },
            {
                icon: "eye",
                title: "Guardam registos (logs)?",
                answer: "Registamos dados básicos de conexão (como quando alguém se conecta) por segurança. Mas nunca — e tecnicamente não conseguimos — registar o conteúdo das suas conversas.",
                eli5: "A gente sabe que alguém bateu na porta, mas não faz ideia do que sussurraram dentro do quarto. É como uma professora que vê as crianças subindo na casa da árvore, mas não consegue ouvir o que estão conversando lá em cima!",
                technical: "Os logs do servidor podem incluir timestamps de conexão e endereços IP (para prevenção de abusos), mas <strong>o conteúdo das mensagens nunca é registado</strong> porque o servidor apenas vê payloads encriptados (ciphertext AES-GCM + IV). Sem a chave AES — que nunca toca no servidor — a desencriptação é computacionalmente inviável."
            },
            {
                icon: "share",
                title: "Como posso convidar alguém?",
                answer: "Clique no ícone de partilha no cabeçalho para copiar o link da sala. Envie-o a alguém de confiança por qualquer canal — apenas quem tem o link pode entrar.",
                eli5: "É como um clubinho secreto com uma senha super longa e impossível de adivinhar na porta. Você conta a senha só pros amigos que quer lá dentro. Mais ninguém consegue encontrar ou adivinhar!",
                technical: "O ID da sala é uma <strong>string hexadecimal aleatória de 128 bits</strong> gerada por <strong>crypto.randomBytes(16)</strong>. Isto dá 3,4 &times; 10<sup>38</sup> combinações possíveis, tornando virtualmente impossível adivinhar. O link é a única forma de aceder à sala."
            }
        ]
    }
};

// ============================================================
// Crypto Utils
// ============================================================
const cryptoUtils = {
    async generateRoomKey() {
        return await window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    },
    async generateKeyPair() {
        return await window.crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["wrapKey", "unwrapKey"]);
    },
    async encrypt(key, data) {
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encodedData = new TextEncoder().encode(data);
        const encryptedContent = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encodedData);
        return { iv: Array.from(iv), encrypted: Array.from(new Uint8Array(encryptedContent)) };
    },
    async decrypt(key, payload) {
        try {
            const iv = new Uint8Array(payload.iv);
            const data = new Uint8Array(payload.encrypted);
            const decryptedContent = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
            return new TextDecoder().decode(decryptedContent);
        } catch (e) {
            console.error("Decryption error:", e);
            return null;
        }
    },
    async exportPublicKey(key) {
        return await window.crypto.subtle.exportKey("jwk", key);
    },
    async importPublicKey(jwk) {
        return await window.crypto.subtle.importKey("jwk", jwk, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["wrapKey"]);
    },
    async wrapKey(publicKey, keyToWrap) {
        const wrapped = await window.crypto.subtle.wrapKey("raw", keyToWrap, publicKey, { name: "RSA-OAEP", hash: "SHA-256" });
        return Array.from(new Uint8Array(wrapped));
    },
    async unwrapKey(privateKey, wrappedKey) {
        const keyData = new Uint8Array(wrappedKey);
        return await window.crypto.subtle.unwrapKey("raw", keyData, privateKey, { name: "RSA-OAEP", hash: "SHA-256" }, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    },
    async deriveSecurityCode(key) {
        const raw = await window.crypto.subtle.exportKey("raw", key);
        const hash = await window.crypto.subtle.digest("SHA-256", raw);
        const arr = new Uint8Array(hash);
        const blocks = [];
        for (let i = 0; i < 9; i++) {
            const val = ((arr[i * 3] << 16) | (arr[i * 3 + 1] << 8) | arr[i * 3 + 2]) % 1000;
            blocks.push(String(val).padStart(3, '0'));
        }
        return blocks;
    }
};

// ============================================================
// Sound (Web Audio API)
// ============================================================
let audioCtx = null;
function playNotificationSound() {
    if (!soundEnabled) return;
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        osc.frequency.setValueAtTime(660, audioCtx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.25);
    } catch (e) { /* audio not available */ }
}

function playBombBeep(beepNumber) {
    if (!soundEnabled) return;
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const t = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'square';
        // Pitch increases as countdown progresses (more urgent)
        const freq = 600 + (beepNumber * 150);
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.start(t);
        osc.stop(t + 0.12);
    } catch (e) { /* audio not available */ }
}

function playBombExplosion() {
    if (!soundEnabled) return;
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const t = audioCtx.currentTime;
        // Low rumble
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, t);
        osc.frequency.exponentialRampToValueAtTime(30, t + 0.4);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        osc.start(t);
        osc.stop(t + 0.5);
        // Noise burst
        const bufferSize = audioCtx.sampleRate * 0.3;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        const noise = audioCtx.createBufferSource();
        const noiseGain = audioCtx.createGain();
        noise.buffer = buffer;
        noise.connect(noiseGain);
        noiseGain.connect(audioCtx.destination);
        noiseGain.gain.setValueAtTime(0.15, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        noise.start(t);
    } catch (e) { /* audio not available */ }
}

// ============================================================
// Browser Notifications
// ============================================================
function sendBrowserNotification(title, body) {
    if (!notifEnabled || !document.hidden) return;
    if (Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/images/banner.png' });
    }
}

function requestNotificationPermission() {
    if (notifEnabled && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

// ============================================================
// Toast / Copy Bubble
// ============================================================
function showToast(text) {
    copyBubble.textContent = text;
    copyBubble.classList.add('show');
    setTimeout(() => copyBubble.classList.remove('show'), 3000);
}

// ============================================================
// UI Functions
// ============================================================
function activateChatInput() {
    input.disabled = false;
    input.placeholder = translations[currentLang].placeholder;
    input.focus();
}

function setLanguage() {
    const userLang = navigator.language.split('-')[0];
    currentLang = translations[userLang] ? userLang : 'en';
    document.documentElement.lang = currentLang;

    document.querySelectorAll('[data-translate-key]').forEach(el => {
        const key = el.getAttribute('data-translate-key');
        if (translations[currentLang][key]) {
            if (el.tagName === 'INPUT') el.placeholder = translations[currentLang][key];
            else el.innerHTML = translations[currentLang][key];
        }
    });

    const t = translations[currentLang];
    const iconMap = {
        user: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
        lock: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
        trash: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
        eye: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
        share: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>'
    };

    const faqItemsHtml = t.faq.map((item, i) => `
        <div class="faq-item">
            <div class="faq-item-header">
                <span class="faq-icon">${iconMap[item.icon]}</span>
                <h4>${item.title}</h4>
            </div>
            <p class="faq-answer">${item.answer}</p>
            <div class="faq-btn-row">
                <button class="faq-eli5-btn" data-index="${i}">
                    <span>&#x1F476; ${t.eli5Label}</span>
                </button>
                <button class="faq-expand-btn" data-index="${i}">
                    <span>${t.learnMore}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
            </div>
            <div class="faq-eli5">
                <p>${item.eli5}</p>
            </div>
            <div class="faq-technical">
                <p>${item.technical}</p>
            </div>
        </div>
    `).join('');

    faqContainer.innerHTML = `
        <span id="close-faq-btn" class="modal-close">&times;</span>
        <h3>${t.faqTitle}</h3>
        <p class="faq-subtitle">${t.faqSubtitle}</p>
        ${faqItemsHtml}`;

    $('#close-faq-btn').addEventListener('click', () => faqModal.classList.add('hidden'));

    faqContainer.querySelectorAll('.faq-expand-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const item = btn.closest('.faq-item');
            item.classList.toggle('expanded');
            item.classList.remove('eli5-open');
        });
    });

    faqContainer.querySelectorAll('.faq-eli5-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const item = btn.closest('.faq-item');
            item.classList.toggle('eli5-open');
            item.classList.remove('expanded');
        });
    });
}

function setTheme(theme) {
    if (theme === 'dark') {
        body.classList.remove('light-theme');
        themeToggle.classList.remove('active');
        sunIcon.classList.remove('active');
        moonIcon.classList.add('active');
    } else {
        body.classList.add('light-theme');
        themeToggle.classList.add('active');
        sunIcon.classList.add('active');
        moonIcon.classList.remove('active');
    }
    localStorage.setItem('theme', theme);
}

function openImageModal(src) {
    if (modalImageContent) modalImageContent.src = src;
    if (imageModal) imageModal.style.display = 'flex';
}

// ============================================================
// Online Users
// ============================================================
function renderOnlineUsers(users) {
    onlineUsersList.innerHTML = '';
    users.forEach(username => {
        const li = document.createElement('li');
        li.classList.add('online-user-item');
        const num = username.replace(/\D/g, '') || '?';
        const avatar = document.createElement('div');
        avatar.classList.add('user-avatar');
        avatar.textContent = `U${num}`;
        const info = document.createElement('div');
        info.classList.add('user-info');
        const name = document.createElement('span');
        name.classList.add('user-name');
        name.textContent = username;
        const status = document.createElement('span');
        status.classList.add('user-status');
        status.innerHTML = '<span class="status-dot"></span> online';
        info.appendChild(name);
        info.appendChild(status);
        li.appendChild(avatar);
        li.appendChild(info);
        onlineUsersList.appendChild(li);
    });
}

// ============================================================
// Typing Indicator
// ============================================================
const typingUsers = new Map();

function emitTyping() {
    if (!isTyping) {
        isTyping = true;
        socket.emit('typing', true);
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        isTyping = false;
        socket.emit('typing', false);
    }, 2000);
}

function renderTypingIndicator() {
    const names = Array.from(typingUsers.values());
    if (names.length === 0) {
        typingIndicator.innerHTML = '';
        return;
    }
    const text = translations[currentLang].typing.replace('{users}', names.join(', '));
    typingIndicator.innerHTML = `${text} <span class="typing-dots"><span></span><span></span><span></span></span>`;
}

// ============================================================
// Scroll to Bottom
// ============================================================
function checkScrollPosition() {
    const threshold = 150;
    const distFromBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight;
    if (distFromBottom > threshold) {
        scrollBottomBtn.classList.add('visible');
    } else {
        scrollBottomBtn.classList.remove('visible');
    }
}

function scrollToBottom() {
    messages.scrollTop = messages.scrollHeight;
}

function isNearBottom() {
    return messages.scrollHeight - messages.scrollTop - messages.clientHeight < 150;
}

// ============================================================
// Message Grouping Logic
// ============================================================
function shouldGroup(senderId, timestamp) {
    const sameUser = senderId === lastMessageSender;
    const withinTime = timestamp - lastMessageTime < 60000; // 1 minute
    return sameUser && withinTime;
}

// ============================================================
// Link Detection & Preview
// ============================================================
const URL_REGEX = /https?:\/\/[^\s<>"']+/gi;

function renderTextWithLinks(text) {
    const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return escaped.replace(URL_REGEX, (url) => {
        let displayUrl = url;
        try { displayUrl = new URL(url).hostname; } catch (e) { /* keep full */ }
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;word-break:break-all;">${url}</a>`;
    });
}

function extractLinks(text) {
    return text.match(URL_REGEX) || [];
}

function createLinkPreview(url) {
    let hostname = url;
    try { hostname = new URL(url).hostname; } catch (e) { /* fallback */ }
    const preview = document.createElement('a');
    preview.href = url;
    preview.target = '_blank';
    preview.rel = 'noopener noreferrer';
    preview.classList.add('link-preview');
    preview.innerHTML = `<div class="lp-domain">${hostname}</div><div class="lp-title">${url}</div>`;
    return preview;
}

// ============================================================
// Message Bubble Creation
// ============================================================
function createMessageBubble(data, opts = {}) {
    const item = document.createElement('li');
    const isMine = data.senderId === socket.id;
    item.classList.add(isMine ? 'my-message' : 'other-message');
    item.dataset.messageId = data.messageId || '';
    item.dataset.username = data.username || '';

    // Grouping
    const grouped = shouldGroup(data.senderId, data.timestamp || Date.now());
    if (grouped) item.classList.add('grouped');

    // Ephemeral
    if (opts.ephemeral) item.classList.add('ephemeral-msg');

    // Header (hidden if grouped)
    const header = document.createElement('div');
    header.classList.add('message-header');
    const sender = document.createElement('span');
    sender.classList.add('message-sender');
    sender.textContent = data.username;
    const timestamp = document.createElement('span');
    timestamp.classList.add('message-timestamp');
    const messageTime = data.timestamp ? new Date(data.timestamp) : new Date();
    timestamp.textContent = messageTime.toLocaleTimeString(navigator.language, { hour: '2-digit', minute: '2-digit' });
    header.appendChild(sender);
    header.appendChild(timestamp);
    item.appendChild(header);

    // Reply quote
    if (opts.replyTo) {
        const quote = document.createElement('div');
        quote.classList.add('reply-quote');
        quote.textContent = `${opts.replyTo.username}: ${opts.replyTo.text}`;
        item.appendChild(quote);
    }

    // Message actions (reply + react)
    const actions = document.createElement('div');
    actions.classList.add('msg-actions');

    const replyBtn = document.createElement('button');
    replyBtn.classList.add('msg-action-btn');
    replyBtn.title = 'Reply';
    replyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>';
    replyBtn.addEventListener('click', () => {
        const textContent = item.querySelector('.msg-text')?.textContent || '(image)';
        setReplyTo(data.messageId, data.username, textContent);
    });

    const reactBtn = document.createElement('button');
    reactBtn.classList.add('msg-action-btn');
    reactBtn.title = 'React';
    reactBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>';
    reactBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleReactionPicker(item, data.messageId);
    });

    actions.appendChild(replyBtn);
    actions.appendChild(reactBtn);
    item.appendChild(actions);

    // Reactions row
    const reactionsRow = document.createElement('div');
    reactionsRow.classList.add('reactions-row');
    item.appendChild(reactionsRow);

    messages.appendChild(item);

    // Update grouping tracker
    lastMessageSender = data.senderId;
    lastMessageTime = data.timestamp || Date.now();

    return item;
}

// ============================================================
// Reactions
// ============================================================
const REACTION_EMOJIS = ['\u{1F44D}', '\u{2764}\u{FE0F}', '\u{1F602}', '\u{1F62E}', '\u{1F622}', '\u{1F525}'];
const messageReactions = new Map(); // messageId -> Map<emoji, Set<username>>

function toggleReactionPicker(msgElement, messageId) {
    // Remove any existing picker
    document.querySelectorAll('.reaction-picker').forEach(p => p.remove());

    const picker = document.createElement('div');
    picker.classList.add('reaction-picker');
    REACTION_EMOJIS.forEach(emoji => {
        const span = document.createElement('span');
        span.textContent = emoji;
        span.addEventListener('click', (e) => {
            e.stopPropagation();
            socket.emit('reaction', { messageId, emoji });
            picker.remove();
        });
        picker.appendChild(span);
    });
    msgElement.appendChild(picker);

    // Close picker on outside click
    const closeHandler = (e) => {
        if (!picker.contains(e.target)) {
            picker.remove();
            document.removeEventListener('click', closeHandler);
        }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
}

function renderReaction(messageId, emoji, username) {
    if (!messageReactions.has(messageId)) messageReactions.set(messageId, new Map());
    const emojiMap = messageReactions.get(messageId);
    if (!emojiMap.has(emoji)) emojiMap.set(emoji, new Set());
    const users = emojiMap.get(emoji);

    // Toggle: if user already reacted, remove
    if (users.has(username)) {
        users.delete(username);
        if (users.size === 0) emojiMap.delete(emoji);
    } else {
        users.add(username);
    }

    // Find the message element and update
    const msgEl = messages.querySelector(`li[data-message-id="${messageId}"]`);
    if (!msgEl) return;
    const row = msgEl.querySelector('.reactions-row');
    if (!row) return;

    row.innerHTML = '';
    for (const [em, userSet] of emojiMap.entries()) {
        if (userSet.size === 0) continue;
        const chip = document.createElement('span');
        chip.classList.add('reaction-chip');
        chip.innerHTML = `${em} <span class="r-count">${userSet.size}</span>`;
        chip.title = Array.from(userSet).join(', ');
        chip.addEventListener('click', () => {
            socket.emit('reaction', { messageId, emoji: em });
        });
        row.appendChild(chip);
    }
}

// ============================================================
// Reply System
// ============================================================
function setReplyTo(messageId, username, text) {
    replyingTo = { messageId, username, text: text.substring(0, 80) };
    replyText.textContent = `${username}: ${replyingTo.text}`;
    replyBar.classList.add('active');
    input.focus();
}

function clearReply() {
    replyingTo = null;
    replyBar.classList.remove('active');
    replyText.textContent = '';
}

// ============================================================
// Ephemeral Messages
// ============================================================
const EPHEMERAL_DURATION = 10000; // 10 seconds

function startEphemeralTimer(msgElement) {
    const bar = document.createElement('div');
    bar.classList.add('ephemeral-bar');
    bar.style.width = '100%';
    msgElement.appendChild(bar);

    const label = document.createElement('div');
    label.classList.add('ephemeral-label');
    label.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> auto-destruct';
    msgElement.appendChild(label);

    const startTime = Date.now();
    let lastBeepSecond = -1;
    const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = EPHEMERAL_DURATION - elapsed;
        const pct = Math.max(0, 1 - elapsed / EPHEMERAL_DURATION) * 100;
        bar.style.width = pct + '%';

        // Bomb beep countdown in the last 4 seconds
        if (remaining <= 4000 && remaining > 0) {
            const secondsLeft = Math.ceil(remaining / 1000);
            if (secondsLeft !== lastBeepSecond) {
                lastBeepSecond = secondsLeft;
                playBombBeep(5 - secondsLeft); // 1,2,3,4 → increasing urgency
                msgElement.classList.add('ephemeral-shake');
                setTimeout(() => msgElement.classList.remove('ephemeral-shake'), 150);
            }
        }

        if (elapsed >= EPHEMERAL_DURATION) {
            clearInterval(interval);
            playBombExplosion();
            msgElement.style.transition = 'opacity 0.5s, max-height 0.5s';
            msgElement.style.opacity = '0';
            msgElement.style.maxHeight = '0';
            msgElement.style.padding = '0';
            msgElement.style.margin = '0';
            msgElement.style.overflow = 'hidden';
            setTimeout(() => msgElement.remove(), 500);
        }
    }, 50);
}

// ============================================================
// Room Timer Countdown
// ============================================================
function startRoomTimer(expiresAt) {
    roomExpiresAt = expiresAt;
    if (timerInterval) clearInterval(timerInterval);
    roomTimerEl.classList.add('active');

    function update() {
        const remaining = roomExpiresAt - Date.now();
        if (remaining <= 0) {
            timerText.textContent = '00:00';
            roomTimerEl.classList.add('urgent');
            clearInterval(timerInterval);
            return;
        }
        const totalSec = Math.floor(remaining / 1000);
        const min = Math.floor(totalSec / 60);
        const sec = totalSec % 60;
        timerText.textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        if (remaining < 60000) {
            roomTimerEl.classList.add('urgent');
        }
    }
    update();
    timerInterval = setInterval(update, 1000);
}

// ============================================================
// Security Verification Code
// ============================================================
async function showSecurityCode() {
    if (!roomKey) return;
    const blocks = await cryptoUtils.deriveSecurityCode(roomKey);
    securityCode.innerHTML = blocks.map(b => `<span>${b}</span>`).join('');
    securityModal.classList.remove('hidden');
}

// ============================================================
// QR Code (Canvas-based, minimal implementation)
// ============================================================
function generateQRCode(url) {
    const ctx = qrCanvas.getContext('2d');
    const size = 200;
    qrCanvas.width = size;
    qrCanvas.height = size;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    // Simple visual representation (not a real QR code scanner-compatible)
    // We'll use a hash-based pattern to create a unique visual
    const data = url;
    const cellSize = 8;
    const gridSize = Math.floor(size / cellSize);
    const margin = 2;

    ctx.fillStyle = '#000000';

    // Position detection patterns (corners)
    function drawFinderPattern(x, y) {
        ctx.fillRect(x * cellSize, y * cellSize, 7 * cellSize, 7 * cellSize);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect((x + 1) * cellSize, (y + 1) * cellSize, 5 * cellSize, 5 * cellSize);
        ctx.fillStyle = '#000000';
        ctx.fillRect((x + 2) * cellSize, (y + 2) * cellSize, 3 * cellSize, 3 * cellSize);
    }

    drawFinderPattern(margin, margin);
    drawFinderPattern(gridSize - 9, margin);
    drawFinderPattern(margin, gridSize - 9);

    // Data area: hash-based pattern
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
        hash = ((hash << 5) - hash + data.charCodeAt(i)) | 0;
    }

    for (let y = margin; y < gridSize - margin; y++) {
        for (let x = margin; x < gridSize - margin; x++) {
            // Skip finder patterns
            if ((x < margin + 8 && y < margin + 8) ||
                (x > gridSize - margin - 9 && y < margin + 8) ||
                (x < margin + 8 && y > gridSize - margin - 9)) continue;

            hash = ((hash << 5) - hash + x * 31 + y * 17) | 0;
            if (Math.abs(hash) % 3 < 1) {
                ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
            }
        }
    }

    // Note: for a real QR code, use a library. This is a visual placeholder.
    // Add text below
    const label = document.createElement('p');
    label.style.cssText = 'font-size:.72rem; color:var(--text-muted); margin-top:8px;';
    label.textContent = url;
    const existing = qrModal.querySelector('.qr-url-label');
    if (existing) existing.remove();
    label.classList.add('qr-url-label');
    qrCanvas.parentNode.appendChild(label);
}

// ============================================================
// Password Flow
// ============================================================
function showPasswordModal() {
    passwordModal.classList.remove('hidden');
    passwordInput.focus();
    passwordError.style.display = 'none';
}

function hidePasswordModal() {
    passwordModal.classList.add('hidden');
    passwordInput.value = '';
    passwordError.style.display = 'none';
}

function joinRoom(password, roomConfig) {
    const roomId = window.location.pathname.substring(1);
    if (!roomId) return;
    socket.emit('join room', { roomId, sessionId, password, roomConfig });
}

// ============================================================
// Event Listeners: UI
// ============================================================

// Form submit (send message)
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (input.value.trim() && roomKey) {
        const payload = await cryptoUtils.encrypt(roomKey, input.value);
        payload.ephemeral = ephemeralMode;
        if (replyingTo) {
            payload.replyTo = replyingTo;
        }
        socket.emit('chat message', payload);
        input.value = '';
        clearReply();

        // Stop typing
        if (isTyping) {
            isTyping = false;
            clearTimeout(typingTimeout);
            socket.emit('typing', false);
        }
    }
});

// Typing indicator on input
input.addEventListener('input', () => {
    if (input.value.length > 0) emitTyping();
});

// Paste image
input.addEventListener('paste', (e) => {
    if (!roomKey) return;
    const items = e.clipboardData.items;
    for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
            e.preventDefault();
            const file = item.getAsFile();
            processImageFile(file);
            return;
        }
    }
});

// Attach button
attachBtn.addEventListener('click', () => imageInput.click());

imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file || !roomKey) return;
    processImageFile(file);
    imageInput.value = '';
});

function processImageFile(file) {
    // Check file size before reading (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
        showToast(translations[currentLang].imageTooLarge);
        return;
    }
    const reader = new FileReader();
    reader.onload = async (event) => {
        const payload = await cryptoUtils.encrypt(roomKey, event.target.result);
        payload.ephemeral = ephemeralMode;
        socket.emit('chat image', payload);
    };
    reader.readAsDataURL(file);
}

// Online users dropdown
onlineUsersBtn.addEventListener('click', () => {
    onlineUsersWrapper.classList.toggle('open');
});

document.addEventListener('click', (e) => {
    if (!onlineUsersWrapper.contains(e.target)) {
        onlineUsersWrapper.classList.remove('open');
    }
});

// Invite (copy link)
inviteBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
        showToast(translations[currentLang].linkCopiedBubble);
    });
});

// Invite long-press or right-click -> QR code
inviteBtn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    generateQRCode(window.location.href);
    qrModal.classList.remove('hidden');
});

// FAQ
faqBtn.addEventListener('click', () => faqModal.classList.remove('hidden'));
faqModal.addEventListener('click', (e) => { if (e.target === faqModal) faqModal.classList.add('hidden'); });

// New Room
newRoomBtn.addEventListener('click', () => {
    const confirmCreate = confirm('Você tem certeza? Você será redirecionado para uma nova sala.');
    if (confirmCreate) {
        window.location.href = '/new';
    }
});

// Theme
themeToggle.addEventListener('click', () => {
    body.classList.toggle('light-theme');
    themeToggle.classList.toggle('active');
    sunIcon.classList.toggle('active');
    moonIcon.classList.toggle('active');

    const newTheme = body.classList.contains('light-theme') ? 'light' : 'dark';
    localStorage.setItem('theme', newTheme);
});

// Image modal
closeModalBtn?.addEventListener('click', () => imageModal.style.display = 'none');
imageModal?.addEventListener('click', (e) => { if (e.target === imageModal) imageModal.style.display = 'none'; });

// Scroll to bottom
messages.addEventListener('scroll', checkScrollPosition);
scrollBottomBtn.addEventListener('click', scrollToBottom);

// Sound toggle
soundBtn.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    localStorage.setItem('sound', soundEnabled ? 'on' : 'off');
    soundBtn.classList.toggle('off', !soundEnabled);
    // Initialize AudioContext on user gesture
    if (soundEnabled && !audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
});

// Notification toggle
notifBtn.addEventListener('click', () => {
    notifEnabled = !notifEnabled;
    localStorage.setItem('notif', notifEnabled ? 'on' : 'off');
    notifBtn.classList.toggle('off', !notifEnabled);
    if (notifEnabled) requestNotificationPermission();
});

// E2E badge -> show security modal
e2eBadge.addEventListener('click', showSecurityCode);

// Security button -> show security modal
securityBtn.addEventListener('click', showSecurityCode);
securityClose.addEventListener('click', () => securityModal.classList.add('hidden'));
securityModal.addEventListener('click', (e) => { if (e.target === securityModal) securityModal.classList.add('hidden'); });

// QR modal
qrClose.addEventListener('click', () => qrModal.classList.add('hidden'));
qrModal.addEventListener('click', (e) => { if (e.target === qrModal) qrModal.classList.add('hidden'); });

// Ephemeral toggle
ephemeralBtn.addEventListener('click', () => {
    ephemeralMode = !ephemeralMode;
    ephemeralBtn.classList.toggle('active', ephemeralMode);
    showToast(ephemeralMode ? translations[currentLang].ephemeralHint : translations[currentLang].ephemeralOff);
});

// Username editing
myUsernameWrapper.addEventListener('click', () => {
    if (myUsernameWrapper.classList.contains('editing')) return;
    myUsernameWrapper.classList.add('editing');
    myUsernameInput.value = myUsername || '';
    myUsernameInput.focus();
    myUsernameInput.select();
});

function submitRename() {
    const val = myUsernameInput.value.trim();
    myUsernameWrapper.classList.remove('editing');
    if (val && val !== myUsername) {
        socket.emit('rename', val);
    }
}

myUsernameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submitRename(); }
    if (e.key === 'Escape') { myUsernameWrapper.classList.remove('editing'); }
});
myUsernameInput.addEventListener('blur', submitRename);

// Reply close
replyClose.addEventListener('click', clearReply);

// Password submit
passwordSubmit.addEventListener('click', () => {
    const pw = passwordInput.value;
    if (pw) {
        hidePasswordModal();
        joinRoom(pw);
    }
});
passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        passwordSubmit.click();
    }
});

// ============================================================
// Socket.IO: Connection & Join
// ============================================================
socket.on('connect', () => {
    // Try joining without password first (server will tell us if needed)
    joinRoom(null);
});

// ============================================================
// Socket.IO: Join Response
// ============================================================
socket.on('join-success', ({ username }) => {
    myUsername = username;
    myUsernameText.textContent = username;
});

socket.on('rename-success', ({ username }) => {
    myUsername = username;
    myUsernameText.textContent = username;
});

socket.on('rename-error', ({ error }) => {
    showToast(translations[currentLang].renameTaken || error);
});

socket.on('join-error', ({ code, message }) => {
    if (code === 'wrong-password') {
        if (passwordModal.classList.contains('hidden')) {
            // First attempt, show modal
            showPasswordModal();
        } else {
            // Already showing, show error
            passwordError.style.display = 'block';
            passwordInput.value = '';
            passwordInput.focus();
        }
    } else if (code === 'room-full') {
        showToast(currentLang === 'pt' ? 'Sala cheia. Não é possível entrar.' : 'Room is full. Cannot join.');
    } else if (code === 'room-blocked') {
        showToast(message || (currentLang === 'pt' ? 'Esta sala foi usada e está bloqueada.' : 'This room has been used and is blocked.'));
    }
});

// ============================================================
// Socket.IO: Key Exchange
// ============================================================
socket.on('existing-users', async (otherUsers) => {
    if (!keyPair) keyPair = await cryptoUtils.generateKeyPair();
    if (otherUsers.length === 0) {
        roomKey = await cryptoUtils.generateRoomKey();
        activateChatInput();
    } else {
        const publicKey = await cryptoUtils.exportPublicKey(keyPair.publicKey);
        socket.emit('key-request', { target: otherUsers[0], publicKey });
    }
});

socket.on('key-request', async (payload) => {
    if (roomKey) {
        const importedPublicKey = await cryptoUtils.importPublicKey(payload.publicKey);
        const encryptedKey = await cryptoUtils.wrapKey(importedPublicKey, roomKey);
        socket.emit('key-response', { target: payload.requesterId, encryptedKey });
    }
});

socket.on('key-response', async (payload) => {
    if (!roomKey) {
        roomKey = await cryptoUtils.unwrapKey(keyPair.privateKey, payload.encryptedKey);
        activateChatInput();
    }
});

// ============================================================
// Socket.IO: Room Updates
// ============================================================
socket.on('room-update', (data) => {
    if (userCountNumber) userCountNumber.textContent = data.count;
    if (dropdownCount) dropdownCount.textContent = data.count;
    if (data.users) renderOnlineUsers(data.users);
    if (data.expiresAt && !roomExpiresAt) {
        startRoomTimer(data.expiresAt);
    }
    // If room has password (for UI indication), we could show a lock icon
});

// ============================================================
// Socket.IO: Chat Messages
// ============================================================
socket.on('chat message', async (data) => {
    if (!roomKey) return;
    const decryptedText = await cryptoUtils.decrypt(roomKey, data);
    if (!decryptedText) return;

    const wasNearBottom = isNearBottom();
    const bubble = createMessageBubble(data, {
        ephemeral: data.ephemeral,
        replyTo: data.replyTo
    });

    const textEl = document.createElement('div');
    textEl.classList.add('msg-text');
    textEl.innerHTML = renderTextWithLinks(decryptedText);
    bubble.insertBefore(textEl, bubble.querySelector('.msg-actions'));

    // Link previews
    const links = extractLinks(decryptedText);
    if (links.length > 0) {
        const preview = createLinkPreview(links[0]);
        bubble.insertBefore(preview, bubble.querySelector('.msg-actions'));
    }

    // Ephemeral countdown
    if (data.ephemeral) startEphemeralTimer(bubble);

    if (wasNearBottom) scrollToBottom();

    // Sound & Notification (if not my message)
    if (data.senderId !== socket.id) {
        playNotificationSound();
        sendBrowserNotification(data.username, decryptedText.substring(0, 100));
    }
});

socket.on('chat image', async (data) => {
    if (!roomKey) return;
    const decryptedImage = await cryptoUtils.decrypt(roomKey, data);
    if (!decryptedImage) return;

    const wasNearBottom = isNearBottom();
    const bubble = createMessageBubble(data, { ephemeral: data.ephemeral });

    const imageElement = document.createElement('img');
    imageElement.src = decryptedImage;
    imageElement.classList.add('chat-image');
    imageElement.addEventListener('click', () => openImageModal(decryptedImage));
    bubble.insertBefore(imageElement, bubble.querySelector('.msg-actions'));

    if (data.ephemeral) startEphemeralTimer(bubble);
    if (wasNearBottom) scrollToBottom();

    if (data.senderId !== socket.id) {
        playNotificationSound();
        sendBrowserNotification(data.username, '\u{1F4F7} Image');
    }
});

// ============================================================
// Socket.IO: System Messages
// ============================================================
socket.on('system message', (data) => {
    const item = document.createElement('li');
    item.classList.add('system-message');
    const messageTemplate = translations[currentLang][data.key] || '';
    item.textContent = messageTemplate
        .replace('{username}', data.username || '')
        .replace('{oldName}', data.oldName || '')
        .replace('{newName}', data.newName || '');
    messages.appendChild(item);

    // Reset grouping on system message
    lastMessageSender = null;
    lastMessageTime = 0;

    if (isNearBottom()) scrollToBottom();
});

// ============================================================
// Socket.IO: Typing
// ============================================================
socket.on('typing', ({ username, isTyping: typing }) => {
    if (typing) {
        typingUsers.set(username, username);
    } else {
        typingUsers.delete(username);
    }
    renderTypingIndicator();
});

// ============================================================
// Socket.IO: Reactions
// ============================================================
socket.on('reaction', ({ messageId, emoji, username }) => {
    renderReaction(messageId, emoji, username);
});

// ============================================================
// Socket.IO: Rate Limit & Image Size
// ============================================================
socket.on('rate-limited', () => {
    showToast(translations[currentLang].rateLimited);
});

socket.on('image-too-large', () => {
    showToast(translations[currentLang].imageTooLarge);
});

// ============================================================
// Socket.IO: Room Expired
// ============================================================
socket.on('room-expired', () => {
    showToast(translations[currentLang].roomExpired);
    input.disabled = true;
    input.placeholder = translations[currentLang].roomExpired;
    if (timerInterval) clearInterval(timerInterval);
    timerText.textContent = '00:00';
    roomTimerEl.classList.add('urgent');
});

// ============================================================
// Initialization
// ============================================================
setLanguage();

// Dark mode detection (respects user preference if set)
const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const savedTheme = localStorage.getItem('theme') || (systemDark ? 'dark' : 'light');
setTheme(savedTheme);

// Listen for system theme changes (only if no user preference)
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) {
        setTheme(e.matches ? 'dark' : 'light');
    }
});

// Initialize toggle button states
soundBtn.classList.toggle('off', !soundEnabled);
notifBtn.classList.toggle('off', !notifEnabled);

// Fetch and update unique rooms count
const roomsCountEl = document.getElementById('chat-rooms-count');

function formatBigInt(str) {
    return str.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function updateRoomsCount() {
    fetch('/api/rooms-count')
        .then(res => res.json())
        .then(data => {
            if (roomsCountEl && data.count) {
                roomsCountEl.textContent = formatBigInt(data.count);
            }
        })
        .catch(err => console.log('Erro ao buscar salas:', err));
}
updateRoomsCount();
setInterval(updateRoomsCount, 30000);

// Request notification permission
requestNotificationPermission();
