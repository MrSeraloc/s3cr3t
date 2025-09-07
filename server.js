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

const sessionMap = new Map();
const roomState = new Map();

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

  socket.on('join room', async ({ roomId, sessionId }) => {
    if (!roomState.has(roomId)) {
        roomState.set(roomId, { userCounter: 0, users: new Map() });
    }
    const currentRoom = roomState.get(roomId);

    if (currentRoom.users.has(sessionId)) {
        const returningUser = currentRoom.users.get(sessionId);
        const oldSocketId = returningUser.socketId;
        if (io.sockets.sockets.get(oldSocketId)) {
            io.sockets.sockets.get(oldSocketId).disconnect(true);
        }
        returningUser.socketId = socket.id;
        socket.username = returningUser.username;
        sessionMap.set(socket.id, { sessionId, roomId }); // Atualiza o sessionMap para o novo socket
    } else {
        currentRoom.userCounter++;
        const newUser = {
            username: `Utilizador ${currentRoom.userCounter}`,
            sessionId: sessionId,
            socketId: socket.id
        };
        currentRoom.users.set(sessionId, newUser);
        sessionMap.set(socket.id, { sessionId, roomId });
        socket.username = newUser.username;
    }

    const roomSockets = await io.in(roomId).fetchSockets();
    const otherUsers = roomSockets.map(s => s.id).filter(id => id !== socket.id);
    
    socket.join(roomId);
    socket.room = roomId;
    
    socket.emit('existing-users', otherUsers);
    
    socket.to(roomId).emit('system message', { key: 'userJoined', username: socket.username });
    
    updateRoomCount(roomId);
  });

  socket.on('disconnecting', () => {
    const sessionInfo = sessionMap.get(socket.id);
    if (!sessionInfo) return;

    const { roomId, sessionId } = sessionInfo;
    const currentRoom = roomState.get(roomId);

    // Só remove o utilizador da lógica de sessão se for o socket atual dele
    const userInRoom = currentRoom?.users.get(sessionId);
    if (userInRoom && userInRoom.socketId === socket.id) {
        currentRoom.users.delete(sessionId);
        console.log(`LOG: Utilizador ${userInRoom.username} com sessionId ${sessionId} removido do estado da sala.`);

        socket.to(roomId).emit('system message', { key: 'userLeft', username: userInRoom.username });

        if (currentRoom.users.size === 0) {
            roomState.delete(roomId);
            console.log(`LOG: Sala ${roomId} está vazia. Limpando estado.`);
        }
    }
    
    setTimeout(() => updateRoomCount(roomId), 100);
    sessionMap.delete(socket.id);
  });

  // ============================ INÍCIO DO CÓDIGO RESTAURADO ============================
  // Estes são os blocos que estavam em falta e que são essenciais para a comunicação

  socket.on('key-request', (payload) => {
    // Reencaminha o pedido de chave para o alvo correto
    socket.to(payload.target).emit('key-request', {
      requesterId: socket.id,
      publicKey: payload.publicKey
    });
  });

  socket.on('key-response', (payload) => {
    // Reencaminha a resposta da chave para o requisitante original
    socket.to(payload.target).emit('key-response', {
      encryptedKey: payload.encryptedKey
    });
  });

  socket.on('chat message', (payload) => {
    // Reenvia a mensagem para todos na sala
    if (socket.username && socket.room) {
      io.to(socket.room).emit('chat message', { 
        ...payload,
        senderId: socket.id,
        username: socket.username
      });
    }
  });

  socket.on('chat image', (payload) => {
    // Reenvia a imagem para todos na sala
    if (socket.username && socket.room) {
      io.to(socket.room).emit('chat image', { 
        ...payload,
        senderId: socket.id,
        username: socket.username
      });
    }
  });
  // ============================ FIM DO CÓDIGO RESTAURADO ===============================
});

server.listen(PORT, () => {
  console.log(`Servidor a correr na porta ${PORT}`);
});