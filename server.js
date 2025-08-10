const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// MUDANÇA AQUI: A porta agora é dinâmica, fornecida pelo Render, ou 3000 se estivermos localmente
const PORT = process.env.PORT || 3000;
const LOG_DIR = 'logs';
const LOG_FILE_PATH = path.join(LOG_DIR, 'chat.log');
const MAX_LOG_SIZE = 1 * 1024 * 1024 * 1024; // 1 GB

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR);
}

app.use(express.static('public'));

app.get('/', (req, res) => {
  const roomId = crypto.randomBytes(16).toString('hex');
  res.redirect(`/${roomId}`);
});

app.get('/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});


const writeToLog = (message) => {
  try {
    if (fs.existsSync(LOG_FILE_PATH)) {
      const stats = fs.statSync(LOG_FILE_PATH);
      if (stats.size > MAX_LOG_SIZE) {
        const archiveName = `chat_${Date.now()}.log`;
        const archivePath = path.join(LOG_DIR, archiveName);
        fs.renameSync(LOG_FILE_PATH, archivePath);
        console.log(`Log rotacionado para ${archivePath}`);
      }
    }
  } catch (err) {
    console.error('Erro ao verificar ou rotacionar o log:', err);
  }

  const timestamp = new Date().toISOString();
  fs.appendFile(LOG_FILE_PATH, `${timestamp} | ${message}\n`, (err) => {
    if (err) {
      console.error('Erro ao escrever no log:', err);
    }
  });
};

io.on('connection', (socket) => {
  const userIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address; // MUDANÇA AQUI: Para obter o IP correto no Render

  socket.on('join room', async (roomId) => {
    const room = io.sockets.adapter.rooms.get(roomId);
    const otherUsers = room ? Array.from(room) : [];
    
    socket.join(roomId);
    socket.room = roomId;

    const updatedRoom = io.sockets.adapter.rooms.get(roomId);
    const numClients = updatedRoom ? updatedRoom.size : 0;
    socket.username = `Utilizador ${numClients}`;

    console.log(`${socket.username} (IP: ${userIp}) conectou-se à sala ${roomId}`);
    writeToLog(`${roomId} | ${socket.username} | ${userIp} | [CONECTOU-SE]`);

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
      console.log(`${socket.username} desconectou-se da sala ${socket.room}`);
      writeToLog(`${socket.room} | ${socket.username} | N/A | [DESCONECTOU-SE]`);
      io.to(socket.room).emit('system message', { key: 'userLeft', username: socket.username });
    }
  });

  socket.on('chat message', (payload) => {
    if (socket.username && socket.room) {
      writeToLog(`${socket.room} | ${socket.username} | ${userIp} | [MENSAGEM ENCRIPTADA]`);
      io.to(socket.room).emit('chat message', { 
        ...payload,
        senderId: socket.id,
        username: socket.username
      });
    }
  });

  socket.on('chat image', (payload) => {
    if (socket.username && socket.room) {
      writeToLog(`${socket.room} | ${socket.username} | ${userIp} | [IMAGEM ENCRIPTADA]`);
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
