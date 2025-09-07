const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

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

// ================== NOVA FUNÇÃO ADICIONADA ==================
// Função para atualizar e enviar a contagem de usuários para a sala
function updateRoomCount(roomId) {
    const room = io.sockets.adapter.rooms.get(roomId);
    const count = room ? room.size : 0;
    io.to(roomId).emit('room-update', { count: count });
}
// ==========================================================

io.on('connection', (socket) => {
  const userIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;

  socket.on('join room', async (roomId) => {
    socket.join(roomId);
    socket.room = roomId;

    const numClients = io.sockets.adapter.rooms.get(roomId)?.size || 0;
    socket.username = `Utilizador ${numClients}`;

    console.log(`LOG: ${roomId} | ${socket.username} | ${userIp} | [CONECTOU-SE]`);
    
    io.to(roomId).emit('system message', { key: 'userJoined', username: socket.username });
    
    // =========== ATUALIZA A CONTAGEM PARA TODOS ===========
    updateRoomCount(roomId);
    // ====================================================
  });

  socket.on('key-request', (payload) => {
    io.to(payload.target).emit('key-request', {
      requesterId: socket.id,
      publicKey: payload.publicKey
    });
  });

  socket.on('key-response', (payload) => {
    io.to(payload.target).emit('key-response', {
      encryptedKey: payload.encryptedKey
    });
  });

  socket.on('disconnect', () => {
    if (socket.username && socket.room) {
      console.log(`LOG: ${socket.room} | ${socket.username} | N/A | [DESCONECTOU-SE]`);
      io.to(socket.room).emit('system message', { key: 'userLeft', username: socket.username });
      
      // =========== ATUALIZA A CONTAGEM PARA TODOS ===========
      // Usamos um pequeno timeout para garantir que o socket saiu da sala antes de contar
      setTimeout(() => updateRoomCount(socket.room), 100);
      // ====================================================
    }
  });

  socket.on('chat message', (payload) => {
    if (socket.username && socket.room) {
      console.log(`LOG: ${socket.room} | ${socket.username} | ${userIp} | [MENSAGEM ENCRIPTADA]`);
      io.to(socket.room).emit('chat message', { 
        ...payload,
        senderId: socket.id,
        username: socket.username
      });
    }
  });

  socket.on('chat image', (payload) => {
    if (socket.username && socket.room) {
      console.log(`LOG: ${socket.room} | ${socket.username} | ${userIp} | [IMAGEM ENCRIPTADA]`);
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