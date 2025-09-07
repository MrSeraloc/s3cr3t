const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://confessorium.com", // Seu domínio de produção
    methods: ["GET", "POST"]
  }
});
const PORT = process.env.PORT || 8080;

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/new', (req, res) => {
  const roomId = crypto.randomBytes(16).toString('hex');
  res.redirect(`/${roomId}`);
});

app.get('/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

function updateRoomCount(roomId) {
    const room = io.sockets.adapter.rooms.get(roomId);
    const count = room ? room.size : 0;
    io.to(roomId).emit('room-update', { count: count });
}

io.on('connection', (socket) => {
  const userIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;

  socket.on('join room', async (roomId) => {
    // Busca outros usuários ANTES de o novo socket entrar na sala
    const otherUsers = Array.from(io.sockets.adapter.rooms.get(roomId) || []).filter(id => id !== socket.id);
    
    socket.join(roomId);
    socket.room = roomId;

    const numClients = io.sockets.adapter.rooms.get(roomId)?.size || 0;
    socket.username = `Utilizador ${numClients}`;

    console.log(`LOG: ${roomId} | ${socket.username} | ${userIp} | [CONECTOU-SE]`);
    
    // ============================ INÍCIO DA CORREÇÃO ============================
    // A lógica crucial que estava faltando: notificar o cliente para iniciar a troca de chaves.
    socket.emit('existing-users', otherUsers);
    // ============================ FIM DA CORREÇÃO ===============================
    
    // Notifica os outros que um novo usuário entrou
    socket.to(roomId).emit('system message', { key: 'userJoined', username: socket.username });
    
    // Atualiza a contagem de usuários para todos na sala
    updateRoomCount(roomId);
  });

  socket.on('key-request', (payload) => {
    // Encaminha o pedido de chave para o alvo específico
    socket.to(payload.target).emit('key-request', {
      requesterId: socket.id,
      publicKey: payload.publicKey
    });
  });

  socket.on('key-response', (payload) => {
    // Encaminha a resposta com a chave encriptada para o requisitante original
    socket.to(payload.target).emit('key-response', {
      encryptedKey: payload.encryptedKey
    });
  });

  socket.on('disconnect', () => {
    if (socket.username && socket.room) {
      console.log(`LOG: ${socket.room} | ${socket.username} | N/A | [DESCONECTOU-SE]`);
      // Notifica os outros que o usuário saiu
      io.to(socket.room).emit('system message', { key: 'userLeft', username: socket.username });
      
      // Atualiza a contagem para os restantes
      setTimeout(() => updateRoomCount(socket.room), 100);
    }
  });

  socket.on('chat message', (payload) => {
    if (socket.username && socket.room) {
      // Reenvia a mensagem para todos na sala, incluindo o remetente
      io.to(socket.room).emit('chat message', { 
        ...payload,
        senderId: socket.id,
        username: socket.username
      });
    }
  });

  socket.on('chat image', (payload) => {
    if (socket.username && socket.room) {
      // Reenvia a imagem para todos na sala, incluindo o remetente
      io.to(socket.room).emit('chat image', { 
        ...payload,
        senderId: socket.id,
        username: socket.username
      });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Servidor a correr na porta ${PORT}`);
});