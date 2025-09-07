const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://confessorium.com", // O seu domínio de produção
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

  // ============================ INÍCIO DA CORREÇÃO DEFINITIVA ============================
  // Substituímos a lógica antiga de 'join room' por esta, muito mais robusta.
  socket.on('join room', async (roomId) => {
    // Usamos fetchSockets() para obter uma lista GARANTIDA de sockets ativos.
    // Isso evita o problema do "fantasma" do F5.
    const roomSockets = await io.in(roomId).fetchSockets();
    const otherUsers = roomSockets.map(s => s.id).filter(id => id !== socket.id);

    socket.join(roomId);
    socket.room = roomId; // Adicionamos uma propriedade para facilitar o acesso

    const numClients = (await io.in(roomId).fetchSockets()).length;
    socket.username = `Utilizador ${numClients}`;

    console.log(`LOG: ${roomId} | ${socket.username} | ${userIp} | [CONECTOU-SE]`);
    
    // Agora o cliente pode iniciar a troca de chaves com uma lista limpa.
    socket.emit('existing-users', otherUsers);
    
    // Notifica os outros que um novo utilizador entrou
    socket.to(roomId).emit('system message', { key: 'userJoined', username: socket.username });
    
    // Atualiza a contagem para todos
    updateRoomCount(roomId);
  });
  // ============================ FIM DA CORREÇÃO DEFINITIVA ===============================

  socket.on('key-request', (payload) => {
    socket.to(payload.target).emit('key-request', {
      requesterId: socket.id,
      publicKey: payload.publicKey
    });
  });

  socket.on('key-response', (payload) => {
    socket.to(payload.target).emit('key-response', {
      encryptedKey: payload.encryptedKey
    });
  });

  socket.on('disconnecting', () => {
    if (socket.username && socket.room) {
      console.log(`LOG: ${socket.room} | ${socket.username} | N/A | [DESCONECTOU-SE]`);
      // Notifica os outros que o utilizador saiu
      socket.to(socket.room).emit('system message', { key: 'userLeft', username: socket.username });
      
      // Atualiza a contagem para os utilizadores restantes
      const room = io.sockets.adapter.rooms.get(socket.room);
      const count = room ? room.size - 1 : 0; // -1 porque o utilizador ainda está tecnicamente na sala
      socket.to(socket.room).emit('room-update', { count: Math.max(0, count) });
    }
  });

  socket.on('disconnect', () => {
      // Nenhuma lógica necessária aqui, 'disconnecting' já tratou de tudo.
  });

  socket.on('chat message', (payload) => {
    if (socket.username && socket.room) {
      io.to(socket.room).emit('chat message', { 
        ...payload,
        senderId: socket.id,
        username: socket.username
      });
    }
  });

  socket.on('chat image', (payload) => {
    if (socket.username && socket.room) {
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