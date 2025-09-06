// 1. Conectar ao servidor Socket.IO
const socket = io();

// 2. Pegar os elementos do HTML
const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const lightThemeBtn = document.getElementById('light-theme-btn');
const darkThemeBtn = document.getElementById('dark-theme-btn');
const copyLinkFromText = document.getElementById('copy-link-from-text'); 
const copyBubble = document.getElementById('copy-bubble');
const imageModal = document.getElementById('image-modal');
const modalImageContent = document.getElementById('modal-image-content');
const closeModalBtn = document.querySelector('.close-modal');
const body = document.body;
const attachBtn = document.getElementById('attach-btn');
const imageInput = document.getElementById('image-input');

// Variáveis para guardar as chaves de encriptação
let roomKey = null;
let keyPair = null;

// MUDANÇA AQUI: Dicionário de traduções expandido com o FAQ
const translations = {
    en: {
        pageTitle: "Confessorium",
        placeholder: "Type your message or paste an image",
        userJoined: "{username} joined the chat.",
        userLeft: "{username} left the chat.",
        roomInstructions: "To join the conversation, ",
        clickToCopy: "click here to copy the room link.",
        linkCopiedBubble: "Link copied!",
        faqTitle: "FAQ - Your Privacy",
        q1Title: "Do I need to register?",
        q1Answer: "No. Confessorium is 100% anonymous. We do not ask for your name, email, or any personal information. Just connect to create a new room.",
        q2Title: "Are my conversations private?",
        q2Answer: "Yes. We use End-to-End Encryption. When you send a message, it is locked with a secret key in your browser. Only people in the room have the key to unlock it. Our server cannot read your messages.",
        q3Title: "What happens when I leave?",
        q3Answer: "Everything is deleted. When the last user leaves a room, the chat history and the secret key are permanently destroyed. Nothing is stored on our servers.",
        q4Title: "Do you keep logs?",
        q4Answer: "For security, our server keeps a record of activity (like IP address and connection time), but NEVER the content of your conversations. The actual content of your message always remains unreadable and secret to anyone outside the room.",
        q5Title: "How secure are the rooms?",
        q5Answer: "Each room is created with a unique, long, and random URL. THE ONLY WAY for someone to enter your conversation is if you share that exact link with them. There is no public list of rooms."
    },
    pt: {
        pageTitle: "Confessorium",
        placeholder: "Digite sua mensagem ou cole uma imagem",
        userJoined: "{username} entrou no chat.",
        userLeft: "{username} saiu do chat.",
        roomInstructions: "Para participar da conversa, ",
        clickToCopy: "clique aqui para copiar o link da sala.",
        linkCopiedBubble: "Link copiado!",
        faqTitle: "FAQ - A Sua Privacidade",
        q1Title: "Preciso de me registar?",
        q1Answer: "Não. O Confessorium é 100% anónimo. Não pedimos o seu nome, e-mail ou qualquer informação pessoal. Basta conectar-se para criar uma nova sala.",
        q2Title: "As minhas conversas são privadas?",
        q2Answer: "Sim. Usamos Criptografia de Ponta a Ponta. Quando envia uma mensagem, ela é trancada com uma chave secreta no seu navegador. Apenas as pessoas na sala têm a chave para a destrancar. O nosso servidor não consegue ler as suas mensagens.",
        q3Title: "O que acontece quando saio?",
        q3Answer: "Tudo é apagado. Quando o último utilizador sai de uma sala, o histórico da conversa e a chave secreta são permanentemente destruídos. Nada fica guardado nos nossos servidores.",
        q4Title: "Guardam registos (logs)?",
        q4Answer: "Por segurança, o nosso servidor guarda um registo de atividade (como endereço IP e hora de conexão), mas NUNCA o conteúdo das suas conversas. O conteúdo real da sua mensagem permanece SEMPRE ilegível e secreto para qualquer pessoa fora da sala.",
        q5Title: "Quão seguras são as salas?",
        q5Answer: "Cada sala é criada com um URL único, longo e aleatório. A ÚNICA FORMA de alguém entrar na sua conversa é se VOCÊ partilhar esse link exato com essa pessoa. Não existe uma lista pública de salas."
    }
};

let currentLang = 'en';
let lastSenderId = null;

// =================================================================
// Funções de Criptografia
// =================================================================
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
        const encryptedContent = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, encodedData);
        return { iv: Array.from(iv), encrypted: Array.from(new Uint8Array(encryptedContent)) };
    },
    async decrypt(key, payload) {
        try {
            const iv = new Uint8Array(payload.iv);
            const data = new Uint8Array(payload.encrypted);
            const decryptedContent = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, data);
            return new TextDecoder().decode(decryptedContent);
        } catch (e) {
            console.error("Erro ao desencriptar:", e);
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
    }
};

// =================================================================
// Lógica Principal
// =================================================================

const roomId = window.location.pathname.substring(1);
if (roomId) {
    socket.emit('join room', roomId);
}

const setLanguage = () => {
    const userLang = navigator.language.split('-')[0];
    currentLang = translations[userLang] ? userLang : 'en';
    document.documentElement.lang = currentLang;
    document.querySelectorAll('[data-translate-key]').forEach(element => {
        const key = element.getAttribute('data-translate-key');
        const translation = translations[currentLang][key];
        if (translation) {
            if (element.tagName === 'INPUT' && element.placeholder !== undefined) {
                element.placeholder = translation;
            } else {
                element.textContent = translation;
            }
        }
    });
};

const setTheme = (theme) => {
    if (theme === 'dark') {
        body.classList.remove('light-theme');
        darkThemeBtn.classList.add('active');
        lightThemeBtn.classList.remove('active');
        localStorage.setItem('theme', 'dark');
    } else {
        body.classList.add('light-theme');
        lightThemeBtn.classList.add('active');
        darkThemeBtn.classList.remove('active');
        localStorage.setItem('theme', 'light');
    }
};

const openImageModal = (src) => {
    modalImageContent.src = src;
    imageModal.classList.add('show');
};

if (lightThemeBtn) {
    lightThemeBtn.addEventListener('click', () => setTheme('light'));
}
if (darkThemeBtn) {
    darkThemeBtn.addEventListener('click', () => setTheme('dark'));
}
const savedTheme = localStorage.getItem('theme') || 'dark';
setTheme(savedTheme);

if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => imageModal.classList.remove('show'));
}
if (imageModal) {
    imageModal.addEventListener('click', (e) => { if (e.target === imageModal) imageModal.classList.remove('show'); });
}

if (copyLinkFromText && copyBubble) {
    copyLinkFromText.addEventListener('click', (e) => {
        e.preventDefault();
        const roomURL = window.location.href;
        navigator.clipboard.writeText(roomURL).then(() => {
            copyBubble.textContent = translations[currentLang].linkCopiedBubble;
            copyBubble.classList.add('show');
            setTimeout(() => {
                copyBubble.classList.remove('show');
            }, 5000);
        }).catch(err => {
            console.error('Error copying link: ', err);
        });
    });
}

if (form && input) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (input.value && roomKey) {
            const payload = await cryptoUtils.encrypt(roomKey, input.value);
            socket.emit('chat message', payload);
            input.value = '';
            input.focus();
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
}

// =================================================================
// Lógica de Envio de Arquivo de Imagem
// =================================================================

// 1. Acionar o input de arquivo (que está oculto) ao clicar no botão de anexo
if (attachBtn && imageInput) {
    attachBtn.addEventListener('click', () => {
        imageInput.click();
    });

    // 2. Processar o arquivo quando o usuário escolher um
    imageInput.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file || !roomKey) {
            return;
        }

        // Usamos o FileReader para converter o arquivo de imagem em uma string Base64 (Data URL)
        // Este é o mesmo formato que a função de colar imagem já utiliza!
        const reader = new FileReader();
        
        reader.onload = async (event) => {
            const base64Image = event.target.result;
            
            // Criptografa a imagem da mesma forma que as outras mensagens
            const payload = await cryptoUtils.encrypt(roomKey, base64Image);
            
            // Emite para o servidor no mesmo canal 'chat image'
            socket.emit('chat image', payload);
        };
        
        reader.readAsDataURL(file);

        // Limpa o valor do input para que o usuário possa selecionar o mesmo arquivo novamente
        imageInput.value = '';
    });
}

const createNewMessageBubble = (data) => {
    const item = document.createElement('li');
    item.setAttribute('data-sender-id', data.senderId);

    const sender = document.createElement('div');
    sender.classList.add('message-sender');
    sender.textContent = data.username;
    item.appendChild(sender);

    if (data.senderId === socket.id) {
        item.classList.add('my-message');
    } else {
        item.classList.add('other-message');
    }
    
    messages.appendChild(item);
    return item;
};

// =================================================================
// Lógica de troca de chaves
// =================================================================

socket.on('existing-users', async (otherUsers) => {
    if (!keyPair) keyPair = await cryptoUtils.generateKeyPair();

    if (otherUsers.length === 0) {
        roomKey = await cryptoUtils.generateRoomKey();
        console.log("Sala criada e chave gerada!");
    } else {
        const target = otherUsers[0];
        const publicKey = await cryptoUtils.exportPublicKey(keyPair.publicKey);
        socket.emit('key-request', { target, publicKey });
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
        console.log("Chave da sala recebida e configurada!");
    }
});

// =================================================================
// Lógica para receber e exibir mensagens
// =================================================================

// Debounce function for scroll updates
let scrollTimeout;
function debounceScrollMessages() {
    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
        messages.scrollTop = messages.scrollHeight;
    }, 100); // 100ms debounce
}

socket.on('chat message', async (data) => {
    if (!roomKey) return;
    const decryptedText = await cryptoUtils.decrypt(roomKey, data);
    if (!decryptedText) return;
    
    const lastMessageElement = messages.lastElementChild;
    const shouldGroup = lastMessageElement && !lastMessageElement.classList.contains('system-message') && lastMessageElement.getAttribute('data-sender-id') === data.senderId;

    const textElement = document.createElement('div');
    textElement.classList.add('message-text');
    textElement.textContent = decryptedText;

    if (shouldGroup) {
        lastMessageElement.appendChild(textElement);
    } else {
        const newBubble = createNewMessageBubble(data);
        newBubble.appendChild(textElement);
    }
  
    debounceScrollMessages();
    lastSenderId = data.senderId;
});

socket.on('chat image', async (data) => {
    if (!roomKey) return;
    const decryptedImage = await cryptoUtils.decrypt(roomKey, data);
    if (!decryptedImage) return;
    
    const lastMessageElement = messages.lastElementChild;
    const shouldGroup = lastMessageElement && !lastMessageElement.classList.contains('system-message') && lastMessageElement.getAttribute('data-sender-id') === data.senderId;

    const imageElement = document.createElement('img');
    imageElement.src = decryptedImage;
    imageElement.addEventListener('click', () => openImageModal(decryptedImage));

    if (shouldGroup) {
        lastMessageElement.appendChild(imageElement);
    } else {
        const newBubble = createNewMessageBubble(data);
        newBubble.appendChild(imageElement);
    }
  
    messages.scrollTop = messages.scrollHeight;
    lastSenderId = data.senderId;
});

socket.on('system message', (data) => {
    const item = document.createElement('li');
    const messageTemplate = translations[currentLang][data.key];
    item.textContent = messageTemplate.replace('{username}', data.username);
    item.classList.add('system-message');
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
    lastSenderId = null;
});

setLanguage();
