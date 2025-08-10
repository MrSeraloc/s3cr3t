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

// Variáveis para guardar as chaves de encriptação
let roomKey = null;
let keyPair = null;

const translations = {
    en: {
        pageTitle: "Confessorium",
        placeholder: "Type your message or paste an image",
        userJoined: "{username} joined the chat.",
        userLeft: "{username} left the chat.",
        roomInstructions: "To join the conversation, ",
        clickToCopy: "click here to copy the room link.",
        linkCopiedBubble: "Link copied!"
    },
    pt: {
        pageTitle: "Confessorium",
        placeholder: "Digite sua mensagem ou cole uma imagem",
        userJoined: "{username} entrou no chat.",
        userLeft: "{username} saiu do chat.",
        roomInstructions: "Para participar da conversa, ",
        clickToCopy: "clique aqui para copiar o link da sala.",
        linkCopiedBubble: "Link copiado!"
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

lightThemeBtn.addEventListener('click', () => setTheme('light'));
darkThemeBtn.addEventListener('click', () => setTheme('dark'));
const savedTheme = localStorage.getItem('theme') || 'dark';
setTheme(savedTheme);

// MUDANÇA AQUI: Adicionada uma verificação para evitar erros
if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => imageModal.classList.remove('show'));
}
if (imageModal) {
    imageModal.addEventListener('click', (e) => { if (e.target === imageModal) imageModal.classList.remove('show'); });
}

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
  
    messages.scrollTop = messages.scrollHeight;
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
