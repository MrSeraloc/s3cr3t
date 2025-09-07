const socket = io();

// --- Elementos do DOM ---
const messages = document.getElementById('messages');
const form = document.getElementById('form');
const input = document.getElementById('input');
const attachBtn = document.getElementById('attach-btn');
const imageInput = document.getElementById('image-input');
const copyBubble = document.getElementById('copy-bubble');
const lightThemeBtn = document.getElementById('light-theme-btn');
const darkThemeBtn = document.getElementById('dark-theme-btn');
const imageModal = document.getElementById('image-modal');

// --- NOVOS ELEMENTOS ---
const userCountNumber = document.getElementById('user-count-number');
const inviteBtn = document.getElementById('invite-btn');
const faqBtn = document.getElementById('faq-btn');
const faqModal = document.getElementById('faq-modal');
const closeFaqBtn = document.getElementById('close-faq-btn');
const faqContainer = document.getElementById('faq-container');

// --- Variáveis Globais ---
let roomKey = null;
let keyPair = null;
let currentLang = 'en';

// --- Traduções (ADICIONAR NOVOS TEXTOS AQUI) ---
const translations = {
    en: {
        pageTitle: "Confessorium",
        placeholder: "Type your message or paste an image",
        userJoined: "{username} joined the chat.",
        userLeft: "{username} left the chat.",
        linkCopiedBubble: "Room link copied to clipboard!",
        // --- TEXTOS DO FAQ ---
        faqTitle: "FAQ - Your Privacy",
        q1Title: "Do I need an account?",
        q1Answer: "No. Confessorium is 100% anonymous. We don't ask for your name, email, or any personal information.",
        q2Title: "Are my conversations private?",
        q2Answer: "Yes, we use End-to-End Encryption. When you send a message, it's locked with a secret key in your browser. Only people in this room have the key to unlock it. The server cannot read your messages.",
        q3Title: "What happens when I leave?",
        q3Answer: "When the last user leaves a room, the chat history and the secret key are permanently destroyed. Nothing is stored on our servers.",
        q4Title: "Do you keep logs?",
        q4Answer: "For security, our server logs connection metadata (like IP address and connection time), but NEVER the content of your conversations. The message content always remains unreadable to anyone outside the room.",
        q5Title: "How can I invite someone?",
        q5Answer: "Click the 'Invite' button (the share icon) in the header. This will copy the unique and private link of this room to your clipboard. Share it only with those you trust."
    },
    pt: {
        pageTitle: "Confessorium",
        placeholder: "Digite sua mensagem ou cole uma imagem",
        userJoined: "{username} entrou no chat.",
        userLeft: "{username} saiu do chat.",
        linkCopiedBubble: "Link da sala copiado!",
        // --- TEXTOS DO FAQ ---
        faqTitle: "FAQ - A Sua Privacidade",
        q1Title: "Preciso de me registar?",
        q1Answer: "Não. O Confessorium é 100% anónimo. Não pedimos o seu nome, e-mail ou qualquer informação pessoal.",
        q2Title: "As minhas conversas são privadas?",
        q2Answer: "Sim. Usamos Criptografia de Ponta a Ponta. Quando envia uma mensagem, ela é trancada com uma chave secreta no seu navegador. Apenas as pessoas na sala têm a chave para a destrancar. O nosso servidor não consegue ler as suas mensagens.",
        q3Title: "O que acontece quando saio?",
        q3Answer: "Quando o último utilizador sai de uma sala, o histórico da conversa e a chave secreta são permanentemente destruídos. Nada fica guardado nos nossos servidores.",
        q4Title: "Guardam registos (logs)?",
        q4Answer: "Por segurança, o nosso servidor guarda um registo de atividade (como endereço IP e hora de conexão), mas NUNCA o conteúdo das suas conversas. O conteúdo real da sua mensagem permanece sempre ilegível e secreto para qualquer pessoa fora da sala.",
        q5Title: "Como posso convidar alguém?",
        q5Answer: "Clique no botão 'Convidar' (o ícone de partilha) no cabeçalho. Isso irá copiar o link único e privado desta sala. Partilhe-o apenas com quem confia."
    }
};

// --- Funções de Criptografia (sem alterações) ---
const cryptoUtils = { /* ... seu código cryptoUtils existente ... */ };

// --- Lógica Principal ---
const roomId = window.location.pathname.substring(1);
if (roomId) socket.emit('join room', roomId);

// --- Funções de UI ---
const setLanguage = () => {
    const userLang = navigator.language.split('-')[0];
    currentLang = translations[userLang] ? userLang : 'en';
    document.documentElement.lang = currentLang;
    
    // Traduz elementos gerais
    document.querySelectorAll('[data-translate-key]').forEach(el => {
        const key = el.getAttribute('data-translate-key');
        if(translations[currentLang][key]) el.innerHTML = translations[currentLang][key];
    });

    // --- MONTA O CONTEÚDO DO FAQ DINAMICAMENTE ---
    faqContainer.innerHTML = `
        <span id="close-faq-btn">&times;</span>
        <h3 data-translate-key="faqTitle">${translations[currentLang].faqTitle}</h3>
        <div class="faq-item">
            <h4 data-translate-key="q1Title">${translations[currentLang].q1Title}</h4>
            <p data-translate-key="q1Answer">${translations[currentLang].q1Answer}</p>
        </div>
        <div class="faq-item">
            <h4 data-translate-key="q2Title">${translations[currentLang].q2Title}</h4>
            <p data-translate-key="q2Answer">${translations[currentLang].q2Answer}</p>
        </div>
        <div class="faq-item">
            <h4 data-translate-key="q3Title">${translations[currentLang].q3Title}</h4>
            <p data-translate-key="q3Answer">${translations[currentLang].q3Answer}</p>
        </div>
        <div class="faq-item">
            <h4 data-translate-key="q4Title">${translations[currentLang].q4Title}</h4>
            <p data-translate-key="q4Answer">${translations[currentLang].q4Answer}</p>
        </div>
        <div class="faq-item">
            <h4 data-translate-key="q5Title">${translations[currentLang].q5Title}</h4>
            <p data-translate-key="q5Answer">${translations[currentLang].q5Answer}</p>
        </div>
    `;
    // É preciso pegar o botão de fechar de novo, pois ele foi recriado
    document.getElementById('close-faq-btn').addEventListener('click', () => faqModal.classList.add('hidden'));
};

const createMessageBubble = (data) => {
    const item = document.createElement('li');
    item.classList.add(data.senderId === socket.id ? 'my-message' : 'other-message');

    const header = document.createElement('div');
    header.classList.add('message-header');
    
    const sender = document.createElement('span');
    sender.classList.add('message-sender');
    sender.textContent = data.username;

    // --- ADICIONA O TIMESTAMP ---
    const timestamp = document.createElement('span');
    timestamp.classList.add('message-timestamp');
    timestamp.textContent = new Date().toLocaleTimeString(navigator.language, { hour: '2-digit', minute:'2-digit' });
    
    header.appendChild(sender);
    header.appendChild(timestamp);
    item.appendChild(header);
    
    messages.appendChild(item);
    return item;
};

// --- Event Listeners ---
form.addEventListener('submit', async (e) => { /* ... código existente ... */ });
input.addEventListener('paste', (e) => { /* ... código existente ... */ });
attachBtn.addEventListener('click', () => imageInput.click());
imageInput.addEventListener('change', (e) => { /* ... código existente ... */ });

// --- NOVO: Listener do botão de convite ---
inviteBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
        copyBubble.textContent = translations[currentLang].linkCopiedBubble;
        copyBubble.classList.add('show');
        setTimeout(() => copyBubble.classList.remove('show'), 3000);
    });
});

// --- NOVO: Listeners do Modal de FAQ ---
faqBtn.addEventListener('click', () => faqModal.classList.remove('hidden'));
faqModal.addEventListener('click', (e) => { if (e.target === faqModal) faqModal.classList.add('hidden'); });

// --- Socket.IO Listeners ---
// --- NOVO: Listener para atualização da sala (contador) ---
socket.on('room-update', (data) => {
    if (userCountNumber) userCountNumber.textContent = data.count;
});

socket.on('chat message', async (data) => {
    if (!roomKey) return;
    const decryptedText = await cryptoUtils.decrypt(roomKey, data);
    if (!decryptedText) return;
    
    const bubble = createMessageBubble(data);
    const textElement = document.createElement('div');
    textElement.textContent = decryptedText;
    bubble.appendChild(textElement);

    messages.scrollTop = messages.scrollHeight;
});

socket.on('chat image', async (data) => { /* ... código existente, mas usando createMessageBubble ... */ });
socket.on('system message', (data) => { /* ... código existente ... */ });
// ... outros listeners de socket ...

// --- Inicialização ---
setLanguage();
// ... código de tema e outros ...