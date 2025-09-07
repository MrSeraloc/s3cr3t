const socket = io();

// --- Elementos do DOM ---
const body = document.body;
const messages = document.getElementById('messages');
const form = document.getElementById('form');
const input = document.getElementById('input');
const attachBtn = document.getElementById('attach-btn');
const imageInput = document.getElementById('image-input');
const copyBubble = document.getElementById('copy-bubble');
const lightThemeBtn = document.getElementById('light-theme-btn');
const darkThemeBtn = document.getElementById('dark-theme-btn');
const imageModal = document.getElementById('image-modal');
const modalImageContent = document.getElementById('modal-image-content');
const closeModalBtn = document.querySelector('.close-modal');
const userCountNumber = document.getElementById('user-count-number');
const inviteBtn = document.getElementById('invite-btn');
const faqBtn = document.getElementById('faq-btn');
const faqModal = document.getElementById('faq-modal');
const faqContainer = document.getElementById('faq-container');

// --- Variáveis Globais ---
let roomKey = null;
let keyPair = null;
let currentLang = 'en';

// --- LÓGICA DE SESSÃO PERSISTENTE ---
// Pega um ID de sessão do sessionStorage ou cria um novo se não existir.
// Isso garante que a identidade do usuário sobreviva a um F5 (refresh).
let sessionId = sessionStorage.getItem('confessorium-session-id');
if (!sessionId) {
    sessionId = crypto.randomUUID(); // Gera um ID único universal
    sessionStorage.setItem('confessorium-session-id', sessionId);
}
// --- FIM DA LÓGICA DE SESSÃO ---

// --- Traduções ---
const translations = {
    en: {
        pageTitle: "Confessorium",
        placeholder: "Type your message or paste an image",
        userJoined: "{username} joined the chat.",
        userLeft: "{username} left the chat.",
        linkCopiedBubble: "Room link copied to clipboard!",
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

// --- Funções de Criptografia ---
const cryptoUtils = {
    async generateRoomKey() { return await window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]); },
    async generateKeyPair() { return await window.crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["wrapKey", "unwrapKey"]); },
    async encrypt(key, data) {
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encodedData = new TextEncoder().encode(data);
        const encryptedContent = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, encodedData);
        return { iv: Array.from(iv), encrypted: Array.from(new Uint8Array(encryptedContent)) };
    },
    async decrypt(key, payload) {
        try {
            const iv = new Uint8Array(payload.iv);
            const data = new Uint8Array(payload.encrypted);
            const decryptedContent = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, data);
            return new TextDecoder().decode(decryptedContent);
        } catch (e) { console.error("Erro ao desencriptar:", e); return null; }
    },
    async exportPublicKey(key) { return await window.crypto.subtle.exportKey("jwk", key); },
    async importPublicKey(jwk) { return await window.crypto.subtle.importKey("jwk", jwk, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["wrapKey"]); },
    async wrapKey(publicKey, keyToWrap) {
        const wrapped = await window.crypto.subtle.wrapKey("raw", keyToWrap, publicKey, { name: "RSA-OAEP", hash: "SHA-256" });
        return Array.from(new Uint8Array(wrapped));
    },
    async unwrapKey(privateKey, wrappedKey) {
        const keyData = new Uint8Array(wrappedKey);
        return await window.crypto.subtle.unwrapKey("raw", keyData, privateKey, { name: "RSA-OAEP", hash: "SHA-256" }, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    }
};

// --- Lógica Principal ---
socket.on('connect', () => {
    const roomId = window.location.pathname.substring(1);
    if (roomId) {
        // Envia o ID da sala e o ID da sessão para o servidor
        socket.emit('join room', { roomId, sessionId });
    }
});

// --- Funções de UI ---
const activateChatInput = () => {
    input.disabled = false;
    input.placeholder = translations[currentLang].placeholder;
    input.focus();
};

const setLanguage = () => {
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

    faqContainer.innerHTML = `
        <span id="close-faq-btn">&times;</span>
        <h3>${translations[currentLang].faqTitle}</h3>
        <div class="faq-item"><h4>${translations[currentLang].q1Title}</h4><p>${translations[currentLang].q1Answer}</p></div>
        <div class="faq-item"><h4>${translations[currentLang].q2Title}</h4><p>${translations[currentLang].q2Answer}</p></div>
        <div class="faq-item"><h4>${translations[currentLang].q3Title}</h4><p>${translations[currentLang].q3Answer}</p></div>
        <div class="faq-item"><h4>${translations[currentLang].q4Title}</h4><p>${translations[currentLang].q4Answer}</p></div>
        <div class="faq-item"><h4>${translations[currentLang].q5Title}</h4><p>${translations[currentLang].q5Answer}</p></div>`;
    
    document.getElementById('close-faq-btn').addEventListener('click', () => faqModal.classList.add('hidden'));
};

const setTheme = (theme) => {
    if (theme === 'dark') {
        body.classList.remove('light-theme');
        darkThemeBtn.classList.add('active');
        lightThemeBtn.classList.remove('active');
    } else {
        body.classList.add('light-theme');
        lightThemeBtn.classList.add('active');
        darkThemeBtn.classList.remove('active');
    }
    localStorage.setItem('theme', theme);
};

const openImageModal = (src) => {
    if (modalImageContent) modalImageContent.src = src;
    if (imageModal) imageModal.style.display = 'flex';
};

const createMessageBubble = (data) => {
    const item = document.createElement('li');
    item.classList.add(data.senderId === socket.id ? 'my-message' : 'other-message');
    const header = document.createElement('div');
    header.classList.add('message-header');
    const sender = document.createElement('span');
    sender.classList.add('message-sender');
    sender.textContent = data.username;
    const timestamp = document.createElement('span');
    timestamp.classList.add('message-timestamp');
    const messageTime = data.timestamp ? new Date(data.timestamp) : new Date();
    timestamp.textContent = messageTime.toLocaleTimeString(navigator.language, { hour: '2-digit', minute:'2-digit' });
    header.appendChild(sender);
    header.appendChild(timestamp);
    item.appendChild(header);
    messages.appendChild(item);
    return item;
};

// --- Event Listeners ---
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (input.value && roomKey) {
        const payload = await cryptoUtils.encrypt(roomKey, input.value);
        socket.emit('chat message', payload);
        input.value = '';
    }
});

input.addEventListener('paste', (e) => {
    if (!roomKey) return;
    const items = e.clipboardData.items;
    for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
            e.preventDefault();
            const file = item.getAsFile();
            const reader = new FileReader();
            reader.onload = async (event) => {
                const payload = await cryptoUtils.encrypt(roomKey, event.target.result);
                socket.emit('chat image', payload);
            };
            reader.readAsDataURL(file);
            return;
        }
    }
});

attachBtn.addEventListener('click', () => imageInput.click());

imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file || !roomKey) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
        const payload = await cryptoUtils.encrypt(roomKey, event.target.result);
        socket.emit('chat image', payload);
    };
    reader.readAsDataURL(file);
    imageInput.value = '';
});

inviteBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
        copyBubble.textContent = translations[currentLang].linkCopiedBubble;
        copyBubble.classList.add('show');
        setTimeout(() => copyBubble.classList.remove('show'), 3000);
    });
});

faqBtn.addEventListener('click', () => faqModal.classList.remove('hidden'));
faqModal.addEventListener('click', (e) => { if (e.target === faqModal) faqModal.classList.add('hidden'); });

lightThemeBtn.addEventListener('click', () => setTheme('light'));
darkThemeBtn.addEventListener('click', () => setTheme('dark'));
closeModalBtn?.addEventListener('click', () => imageModal.style.display = 'none');
imageModal?.addEventListener('click', (e) => { if (e.target === imageModal) imageModal.style.display = 'none'; });

// --- Socket.IO Listeners ---
socket.on('room-update', (data) => {
    if (userCountNumber) userCountNumber.textContent = data.count;
});

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

socket.on('chat image', async (data) => {
    if (!roomKey) return;
    const decryptedImage = await cryptoUtils.decrypt(roomKey, data);
    if (!decryptedImage) return;

    const bubble = createMessageBubble(data);
    const imageElement = document.createElement('img');
    imageElement.src = decryptedImage;
    imageElement.addEventListener('click', () => openImageModal(decryptedImage));
    bubble.appendChild(imageElement);

    messages.scrollTop = messages.scrollHeight;
});

socket.on('system message', (data) => {
    const item = document.createElement('li');
    item.classList.add('system-message');
    const messageTemplate = translations[currentLang][data.key] || '';
    item.textContent = messageTemplate.replace('{username}', data.username);
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
});

// --- Inicialização ---
setLanguage();
const savedTheme = localStorage.getItem('theme') || 'dark';
setTheme(savedTheme);