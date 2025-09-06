const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// A porta agora é dinâmica, fornecida pelo Google App Engine, ou 8080 como padrão local.
const PORT = process.env.PORT || 8080;

app.use(express.static('public'));

// =========== INÍCIO DA MODIFICAÇÃO ===========

// 1. Rota principal '/' agora serve a sua nova página de splash.
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 2. Criamos uma nova rota '/new' que o botão da splash page irá chamar.
//    Esta rota gera o ID da sala e redireciona o usuário para ela.
app.get('/new', (req, res) => {
  const roomId = crypto.randomBytes(16).toString('hex');
  res.redirect(`/${roomId}`);
});

// =========== FIM DA MODIFICAÇÃO ===========

app.get('/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// ... o resto do seu código (io.on('connection', ...)) continua aqui ...

io.on('connection', (socket) => {
  const userIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;

  socket.on('join room', async (roomId) => {
    const room = io.sockets.adapter.rooms.get(roomId);
    const otherUsers = room ? Array.from(room) : [];
    
    socket.join(roomId);
    socket.room = roomId;

    const updatedRoom = io.sockets.adapter.rooms.get(roomId);
    const numClients = updatedRoom ? updatedRoom.size : 0;
    socket.username = `Utilizador ${numClients}`;

    // LOG CORRIGIDO: Escrevendo no console
    console.log(`LOG: ${roomId} | ${socket.username} | ${userIp} | [CONECTOU-SE]`);

    socket.emit('existing-users', otherUsers);

    io.to(roomId).emit('system message', { key: 'userJoined', username: socket.username });
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
      // LOG CORRIGIDO: Escrevendo no console
      console.log(`LOG: ${socket.room} | ${socket.username} | N/A | [DESCONECTOU-SE]`);
      io.to(socket.room).emit('system message', { key: 'userLeft', username: socket.username });
    }
  });

  socket.on('chat message', (payload) => {
    if (socket.username && socket.room) {
      // LOG CORRIGIDO: Escrevendo no console
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
      // LOG CORRIGIDO: Escrevendo no console
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