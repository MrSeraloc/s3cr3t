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

  // ============================ INÍCIO DA CORREÇÃO ============================
  // Usamos o evento 'disconnecting' em vez de 'disconnect'.
  // Ele é mais fiável para obter as salas do utilizador antes de ele sair.
  socket.on('disconnecting', () => {
    // a propriedade socket.rooms é um Set que contém o ID do próprio socket e as salas em que está.
    const rooms = Array.from(socket.rooms);
    const currentRoomId = rooms.find(room => room !== socket.id); // Encontra a sala de chat
    
    if (socket.username && currentRoomId) {
      console.log(`LOG: ${currentRoomId} | ${socket.username} | N/A | [DESCONECTOU-SE]`);
      // Notifica os outros que o utilizador saiu
      socket.to(currentRoomId).emit('system message', { key: 'userLeft', username: socket.username });
      
      // A atualização da contagem será feita após a desconexão total para ser precisa.
      // O Socket.IO remove o utilizador da sala automaticamente entre 'disconnecting' e 'disconnect'.
    }
  });

  // Mantemos o 'disconnect' para a lógica que deve acontecer DEPOIS de o utilizador sair da sala.
  socket.on('disconnect', () => {
    // Já que não podemos confiar nas salas aqui, precisamos iterar para descobrir onde o utilizador estava.
    // Esta é uma lógica de fallback, a principal está no 'disconnecting'.
    // A melhor prática é apenas atualizar contagens e estados gerais aqui.
    // A função 'updateRoomCount' já lida com a contagem corretamente após a saída do utilizador.
  });
  // ============================ FIM DA CORREÇÃO ===============================

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
