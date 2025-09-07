const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://confessorium.com",
    methods: ["GET", "POST"]
  }
});
const PORT = process.env.PORT || 8080;

// ============================ INÍCIO DAS MUDANÇAS ============================
// Armazenamento em memória para mapear sessionId -> dados do usuário
// e para manter o estado da sala (como o contador de usuários)
const sessionMap = new Map();
const roomState = new Map();
// ============================ FIM DAS MUDANÇAS ===============================

app.use(express.static('public'));
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.get('/new', (req, res) => { res.redirect(`/${crypto.randomBytes(16).toString('hex')}`); });
app.get('/:roomId', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'chat.html')); });

function updateRoomCount(roomId) {
    const room = io.sockets.adapter.rooms.get(roomId);
    const count = room ? room.size : 0;
    io.to(roomId).emit('room-update', { count: count });
}

io.on('connection', (socket) => {
  const userIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;

  // ============================ LÓGICA DE JOIN COMPLETAMENTE REFEITA ============================
  socket.on('join room', async ({ roomId, sessionId }) => {
    
    // Garante que a sala tem um estado inicial
    if (!roomState.has(roomId)) {
        roomState.set(roomId, { userCounter: 0, users: new Map() });
    }
    const currentRoom = roomState.get(roomId);

    // O usuário está voltando? (Verifica se já conhecemos este sessionId na sala)
    if (currentRoom.users.has(sessionId)) {
        const returningUser = currentRoom.users.get(sessionId);
        
        // Desconecta o socket antigo (fantasma) se ele ainda existir
        const oldSocketId = returningUser.socketId;
        if (io.sockets.sockets.get(oldSocketId)) {
            console.log(`LOG: Desconectando socket fantasma ${oldSocketId}`);
            io.sockets.sockets.get(oldSocketId).disconnect(true);
        }

        // Reassocia o novo socket ao usuário existente
        returningUser.socketId = socket.id;
        socket.username = returningUser.username;
        console.log(`LOG: Usuário ${socket.username} reconectou com sessionId ${sessionId}`);

    } else {
        // É um usuário novo na sala
        currentRoom.userCounter++;
        const newUser = {
            username: `Utilizador ${currentRoom.userCounter}`,
            sessionId: sessionId,
            socketId: socket.id
        };
        currentRoom.users.set(sessionId, newUser);
        sessionMap.set(socket.id, { sessionId, roomId });
        socket.username = newUser.username;
        console.log(`LOG: Novo usuário ${socket.username} entrou com sessionId ${sessionId}`);
    }

    const roomSockets = await io.in(roomId).fetchSockets();
    const otherUsers = roomSockets.map(s => s.id).filter(id => id !== socket.id);
    
    socket.join(roomId);
    socket.room = roomId;
    
    socket.emit('existing-users', otherUsers);
    
    socket.to(roomId).emit('system message', { key: 'userJoined', username: socket.username });
    
    updateRoomCount(roomId);
  });
  // ============================ FIM DA LÓGICA DE JOIN ===============================


  socket.on('disconnecting', () => {
    const sessionInfo = sessionMap.get(socket.id);
    if (!sessionInfo) return; // Se não estiver no mapa, já foi tratado (ex: fantasma)

    const { roomId } = sessionInfo;
    const currentRoom = roomState.get(roomId);
    const user = currentRoom?.users.get(sessionInfo.sessionId);

    if (user) {
        console.log(`LOG: ${roomId} | ${user.username} | N/A | [DESCONECTOU-SE]`);
        socket.to(roomId).emit('system message', { key: 'userLeft', username: user.username });
        
        // Se a sala ficar vazia após a desconexão, limpa o estado dela
        const roomSize = io.sockets.adapter.rooms.get(roomId)?.size;
        if (roomSize === 1) { // Só este socket está saindo
            roomState.delete(roomId);
            console.log(`LOG: Sala ${roomId} está vazia. Limpando estado.`);
        }
    }
    
    setTimeout(() => updateRoomCount(roomId), 100);
    sessionMap.delete(socket.id);
  });

  // O resto dos listeners (key-request, chat message, etc.) continuam iguais
  // ...
});

server.listen(PORT, () => {
  console.log(`Servidor a correr na porta ${PORT}`);
});