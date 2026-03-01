const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const crypto = require('crypto');

const fs = require('fs');

const app = express();
app.use(express.json());

// Enable CORS for API endpoints
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});
const server = http.createServer(app);
const ALLOWED_ORIGINS = [
  "https://confessorium.com",
  "http://localhost:8080",
  "http://localhost:3000"
];
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 6e6 // 6MB max payload (images)
});
const PORT = process.env.PORT || 8080;

const sessionMap = new Map();
const roomState = new Map();
const rateLimitMap = new Map();
const emptyRoomTimers = new Map(); // Track grace period timers for empty rooms

// Grace period: 60 seconds before blocking an empty room
const EMPTY_ROOM_GRACE_PERIOD = 60000; // 60 seconds

// --- Rate Limiting ---
const RATE_LIMIT_WINDOW = 1000; // 1 second
const RATE_LIMIT_MAX = 10; // max messages per window

function checkRateLimit(socketId) {
    const now = Date.now();
    const entry = rateLimitMap.get(socketId);
    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
        rateLimitMap.set(socketId, { windowStart: now, count: 1 });
        return true;
    }
    entry.count++;
    return entry.count <= RATE_LIMIT_MAX;
}

// --- Room Expiration Cleanup ---
const CLEANUP_INTERVAL = 30000; // check every 30s
setInterval(() => {
    const now = Date.now();
    for (const [roomId, state] of roomState.entries()) {
        if (state.expiresAt && now >= state.expiresAt) {
            io.to(roomId).emit('room-expired');
            // Disconnect all sockets in the room
            const room = io.sockets.adapter.rooms.get(roomId);
            if (room) {
                for (const sid of room) {
                    const s = io.sockets.sockets.get(sid);
                    if (s) s.disconnect(true);
                }
            }
            roomState.delete(roomId);
            // Also clean up persisted usernames when room expires
            clearRoomUsernames(roomId);
            // Block the room for 720 hours (30 days) to prevent reuse
            blockRoom(roomId);
            console.log(`LOG: Sala ${roomId} expirou. Bloqueando para 30 dias.`);
        }
    }
}, CLEANUP_INTERVAL);

// --- Feedback Storage ---
const FEEDBACK_FILE = '/tmp/feedback.json';
const feedbackRateLimit = new Map();

// --- Persistence Storage Paths ---
const BLOCKED_ROOMS_FILE = '/tmp/blocked-rooms.json';
const USERNAMES_FILE = '/tmp/usernames.json';
const ANALYTICS_FILE = '/tmp/analytics.json';

// Utility functions for JSON serialization of Maps
function serializeMap(map) {
    const entries = [];
    for (const [key, value] of map.entries()) {
        if (value instanceof Map) {
            entries.push([key, Array.from(value.entries())]);
        } else {
            entries.push([key, value]);
        }
    }
    return entries;
}

function deserializeMap(entries, nested = false) {
    const map = new Map();
    for (const [key, value] of entries) {
        if (nested && Array.isArray(value)) {
            map.set(key, new Map(value));
        } else {
            map.set(key, value);
        }
    }
    return map;
}

// Persistence functions
function saveBlockedRooms() {
    try {
        const data = serializeMap(blockedRooms);
        fs.writeFileSync(BLOCKED_ROOMS_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('[PERSISTENCE] Erro ao salvar blocked-rooms.json:', err.message);
    }
}

function saveUsernames() {
    try {
        const data = serializeMap(usernamePersistence);
        fs.writeFileSync(USERNAMES_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('[PERSISTENCE] Erro ao salvar usernames.json:', err.message);
    }
}

function saveAnalytics() {
    try {
        fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(analytics, null, 2));
    } catch (err) {
        console.error('[ANALYTICS] Erro ao salvar analytics.json:', err.message);
    }
}

function loadPersistedData() {
    // Load blocked rooms
    try {
        const data = JSON.parse(fs.readFileSync(BLOCKED_ROOMS_FILE, 'utf-8'));
        const entries = deserializeMap(data);
        const now = Date.now();
        for (const [roomId, expiresAt] of entries.entries()) {
            if (expiresAt > now) {
                blockedRooms.set(roomId, expiresAt);
            }
        }
        console.log(`[PERSISTENCE] Carregadas ${blockedRooms.size} salas bloqueadas.`);
    } catch (err) {
        // File doesn't exist or invalid, start fresh
    }

    // Load usernames
    try {
        const data = JSON.parse(fs.readFileSync(USERNAMES_FILE, 'utf-8'));
        const deserialized = deserializeMap(data, true);
        for (const [roomId, userMap] of deserialized.entries()) {
            usernamePersistence.set(roomId, userMap);
        }
        console.log(`[PERSISTENCE] Carregadas ${usernamePersistence.size} salas com usernames persistidos.`);
    } catch (err) {
        // File doesn't exist or invalid, start fresh
    }

    // Load analytics
    try {
        const data = JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf-8'));
        analytics.totalRoomsCreated = data.totalRoomsCreated || 0;
        analytics.totalUniqueUsers = data.totalUniqueUsers || 0;
        analytics.hourlyActivity = data.hourlyActivity || new Array(24).fill(0);
        analytics.lastReset = data.lastReset || new Date().toDateString();
        console.log(`[ANALYTICS] Carregados dados históricos.`);
    } catch (err) {
        // File doesn't exist or invalid, start fresh
    }
}

// --- Username Persistence (per room) ---
// Structure: usernamePersistence = Map<roomId, Map<sessionId, username>>
const usernamePersistence = new Map();

function getPersistedUsername(roomId, sessionId) {
    const roomUsernames = usernamePersistence.get(roomId);
    return roomUsernames ? roomUsernames.get(sessionId) : null;
}

function setPersistedUsername(roomId, sessionId, username) {
    if (!usernamePersistence.has(roomId)) {
        usernamePersistence.set(roomId, new Map());
    }
    usernamePersistence.get(roomId).set(sessionId, username);
    saveUsernames();
}

function clearRoomUsernames(roomId) {
    usernamePersistence.delete(roomId);
    saveUsernames();
}

// --- Analytics ---
const analytics = {
    totalRoomsCreated: 0,
    totalUniqueUsers: 0,
    hourlyActivity: new Array(24).fill(0),
    lastReset: new Date().toDateString()
};
let analyticsSaveTimer = null;

function incrementAnalytics(key) {
    if (key === 'roomsCreated') analytics.totalRoomsCreated++;
    else if (key === 'uniqueUsers') analytics.totalUniqueUsers++;
    // Debounce saves para não abusar de I/O
    clearTimeout(analyticsSaveTimer);
    analyticsSaveTimer = setTimeout(() => saveAnalytics(), 5000);
}

function incrementHourlyActivity() {
    const hour = new Date().getUTCHours();
    analytics.hourlyActivity[hour]++;
    clearTimeout(analyticsSaveTimer);
    analyticsSaveTimer = setTimeout(() => saveAnalytics(), 5000);
}

// Reset horário (reset às 00:00 UTC)
setInterval(() => {
    const today = new Date().toDateString();
    if (analytics.lastReset !== today) {
        analytics.hourlyActivity = new Array(24).fill(0);
        analytics.lastReset = today;
        saveAnalytics();
    }
}, 60000); // Check every minute

// --- Room Blocking (with expiration) ---
// Structure: blockedRooms = Map<roomId, expiresAt (timestamp)>
// Purpose: Prevent room reuse for 720 hours (30 days) after last person leaves
const BLOCK_DURATION = 720 * 60 * 60 * 1000; // 720 hours in milliseconds
const blockedRooms = new Map();

function isRoomBlocked(roomId) {
    if (!blockedRooms.has(roomId)) return false;
    const expiresAt = blockedRooms.get(roomId);
    if (Date.now() >= expiresAt) {
        // Expiration time passed, unblock the room
        blockedRooms.delete(roomId);
        saveBlockedRooms();
        console.log(`LOG: Bloqueio da sala ${roomId} expirou. Sala desbloqueada.`);
        return false;
    }
    return true;
}

function blockRoom(roomId) {
    const expiresAt = Date.now() + BLOCK_DURATION;
    blockedRooms.set(roomId, expiresAt);
    const expiryDate = new Date(expiresAt).toLocaleString('pt-PT');
    console.log(`LOG: Sala ${roomId} bloqueada até ${expiryDate}`);
    saveBlockedRooms();
}

// Cleanup blocked rooms every hour
setInterval(() => {
    const now = Date.now();
    let hasDeletions = false;
    for (const [roomId, expiresAt] of blockedRooms.entries()) {
        if (now >= expiresAt) {
            blockedRooms.delete(roomId);
            hasDeletions = true;
            console.log(`LOG: Bloqueio da sala ${roomId} expirou e foi removido.`);
        }
    }
    if (hasDeletions) saveBlockedRooms();
}, 60 * 60 * 1000); // Check every hour

// --- Routes ---
app.use(express.static('public'));
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.get('/new', (req, res) => { res.redirect(`/${crypto.randomBytes(16).toString('hex')}`); });

// --- Feedback Endpoint ---
app.post('/api/feedback', (req, res) => {
    console.log('[FEEDBACK] Requisição recebida');
    console.log('[FEEDBACK] Body:', req.body);

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const now = Date.now();
    const lastSent = feedbackRateLimit.get(ip);

    if (lastSent && now - lastSent < 60000) {
        console.log('[FEEDBACK] Rate limit ativado para IP:', ip);
        return res.status(429).json({ error: 'Aguarde 1 minuto antes de enviar outra sugestão.' });
    }

    const message = (req.body.message || '').trim();
    console.log('[FEEDBACK] Mensagem:', message, 'Tamanho:', message.length);

    if (!message || message.length > 2000) {
        console.log('[FEEDBACK] Mensagem inválida');
        return res.status(400).json({ error: 'Mensagem inválida (1-2000 caracteres).' });
    }

    feedbackRateLimit.set(ip, now);

    const entry = { message, ip, date: new Date().toISOString() };
    console.log(`[FEEDBACK] Salvando:`, entry);

    // Append to feedback.json
    let feedbackList = [];
    try { feedbackList = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf-8')); } catch {}
    feedbackList.push(entry);
    try {
        fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(feedbackList, null, 2));
        console.log('[FEEDBACK] Arquivo salvo com sucesso. Total de feedbacks:', feedbackList.length);
    } catch (err) {
        console.error('[FEEDBACK] Erro ao salvar arquivo:', err.message);
    }

    res.json({ ok: true });
});

// --- Dashboard Protection ---
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || null;

function requireDashboardAuth(req, res, next) {
    if (!DASHBOARD_PASSWORD) {
        return res.status(403).send('Dashboard desativado.');
    }
    const auth = req.headers.authorization || '';
    const [scheme, encoded] = auth.split(' ');

    if (scheme !== 'Basic' || !encoded) {
        res.set('WWW-Authenticate', 'Basic realm="Dashboard"');
        return res.status(401).send('Autenticação necessária.');
    }

    const decoded = Buffer.from(encoded, 'base64').toString();
    const [, pass] = decoded.split(':');

    if (pass === DASHBOARD_PASSWORD) {
        return next();
    }

    res.set('WWW-Authenticate', 'Basic realm="Dashboard"');
    res.status(401).send('Senha incorreta.');
}

// --- Dashboard Routes ---
app.get('/dashboard', requireDashboardAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/api/dashboard-data', requireDashboardAuth, (req, res) => {
    const liveRooms = roomState.size;
    const liveUsers = Array.from(roomState.values()).reduce((sum, room) => sum + room.users.size, 0);
    const blockedRoomsCount = blockedRooms.size;

    // Get last 10 feedbacks
    let recentFeedback = [];
    try {
        const feedbackList = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf-8'));
        recentFeedback = feedbackList.slice(-10).reverse();
    } catch {}

    // Get blocked rooms with expiry dates
    const blockedRoomsList = Array.from(blockedRooms.entries())
        .map(([roomId, expiresAt]) => ({
            roomId: roomId.substring(0, 16) + '...',
            expiresAt: new Date(expiresAt).toLocaleString('pt-PT')
        }))
        .slice(-10);

    const uptime = Math.floor(process.uptime());

    res.json({
        liveRooms,
        liveUsers,
        blockedRooms: blockedRoomsCount,
        totalRoomsCreated: analytics.totalRoomsCreated,
        totalUniqueUsers: analytics.totalUniqueUsers,
        hourlyActivity: analytics.hourlyActivity,
        recentFeedback,
        blockedRoomsList,
        uptime,
        timestamp: new Date().toLocaleString('pt-PT')
    });
});

// --- Rooms Count Endpoint (public) ---
// Returns total possible room combinations (2^128) minus blocked rooms
app.get('/api/rooms-count', (req, res) => {
    const total = BigInt('340282366920938463463374607431768211456'); // 2^128
    const blocked = BigInt(blockedRooms.size);
    const available = total - blocked;
    res.json({ count: available.toString() });
});

app.get('/:roomId', (req, res) => {
    const roomId = req.params.roomId;
    // Check if room is blocked
    if (isRoomBlocked(roomId)) {
        const expiresAt = blockedRooms.get(roomId);
        return res.redirect(`/blocked.html?expires=${expiresAt}`);
    }
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

function updateRoomCount(roomId) {
    const room = io.sockets.adapter.rooms.get(roomId);
    const count = room ? room.size : 0;
    const currentRoom = roomState.get(roomId);
    const users = currentRoom
        ? Array.from(currentRoom.users.values()).map(u => u.username)
        : [];
    const roomInfo = {
        count,
        users,
        maxUsers: currentRoom?.maxUsers || 0,
        expiresAt: currentRoom?.expiresAt || null,
        hasPassword: !!currentRoom?.passwordHash
    };
    io.to(roomId).emit('room-update', roomInfo);
}

// Load persisted data on server boot
loadPersistedData();

io.on('connection', (socket) => {

  // --- Join Room (with password & limits) ---
  socket.on('join room', async ({ roomId, sessionId, password, roomConfig }) => {
    // Check if room is blocked (used before and within 30-day expiration)
    if (isRoomBlocked(roomId)) {
        const expiresAt = blockedRooms.get(roomId);
        const expiryDate = new Date(expiresAt).toLocaleString('pt-PT');
        socket.emit('join-error', { code: 'room-blocked', message: `Esta sala foi usada anteriormente e está bloqueada até ${expiryDate}.` });
        return;
    }

    // Create room if it doesn't exist
    if (!roomState.has(roomId)) {
        incrementAnalytics('roomsCreated');
        const state = { userCounter: 0, users: new Map(), passwordHash: null, maxUsers: 0, expiresAt: null };
        // First user can configure the room
        if (roomConfig) {
            if (roomConfig.password) {
                state.passwordHash = crypto.createHash('sha256').update(roomConfig.password).digest('hex');
            }
            if (roomConfig.maxUsers > 0) {
                state.maxUsers = roomConfig.maxUsers;
            }
            if (roomConfig.duration > 0) {
                state.expiresAt = Date.now() + (roomConfig.duration * 60 * 1000); // minutes to ms
            }
        }
        roomState.set(roomId, state);
    }
    const currentRoom = roomState.get(roomId);

    // Check password
    if (currentRoom.passwordHash) {
        const inputHash = password ? crypto.createHash('sha256').update(password).digest('hex') : null;
        if (inputHash !== currentRoom.passwordHash) {
            socket.emit('join-error', { code: 'wrong-password' });
            return;
        }
    }

    // Check max users
    if (currentRoom.maxUsers > 0 && !currentRoom.users.has(sessionId)) {
        if (currentRoom.users.size >= currentRoom.maxUsers) {
            socket.emit('join-error', { code: 'room-full' });
            return;
        }
    }

    if (currentRoom.users.has(sessionId)) {
        // Returning user in same room
        const returningUser = currentRoom.users.get(sessionId);
        const oldSocketId = returningUser.socketId;
        if (io.sockets.sockets.get(oldSocketId)) {
            io.sockets.sockets.get(oldSocketId).disconnect(true);
        }
        returningUser.socketId = socket.id;
        socket.username = returningUser.username;
        sessionMap.set(socket.id, { sessionId, roomId });
    } else {
        // New user in room
        currentRoom.userCounter++;
        incrementAnalytics('uniqueUsers');
        // Check if this sessionId had a persisted username in this room (from previous connection)
        const persistedUsername = getPersistedUsername(roomId, sessionId);
        const username = persistedUsername || `Utilizador ${currentRoom.userCounter}`;

        const newUser = {
            username: username,
            sessionId: sessionId,
            socketId: socket.id
        };
        currentRoom.users.set(sessionId, newUser);
        sessionMap.set(socket.id, { sessionId, roomId });
        socket.username = username;

        // Persist the username for this session in this room (first time or recovery)
        setPersistedUsername(roomId, sessionId, username);
    }

    const roomSockets = await io.in(roomId).fetchSockets();
    const otherUsers = roomSockets.map(s => s.id).filter(id => id !== socket.id);

    socket.join(roomId);
    socket.room = roomId;

    // Cancel grace period timer if someone rejoins before it expires
    if (emptyRoomTimers.has(roomId)) {
        clearTimeout(emptyRoomTimers.get(roomId));
        emptyRoomTimers.delete(roomId);
        console.log(`LOG: Sala ${roomId} reativada - timer de bloqueio cancelado.`);
    }

    socket.emit('join-success', { username: socket.username });
    socket.emit('existing-users', otherUsers);

    socket.to(roomId).emit('system message', { key: 'userJoined', username: socket.username });

    updateRoomCount(roomId);
  });

  // --- Disconnecting ---
  socket.on('disconnecting', () => {
    const sessionInfo = sessionMap.get(socket.id);
    if (!sessionInfo) return;

    const { roomId, sessionId } = sessionInfo;
    const currentRoom = roomState.get(roomId);

    const userInRoom = currentRoom?.users.get(sessionId);
    if (userInRoom && userInRoom.socketId === socket.id) {
        currentRoom.users.delete(sessionId);
        console.log(`LOG: Utilizador ${userInRoom.username} com sessionId ${sessionId} removido do estado da sala.`);

        socket.to(roomId).emit('system message', { key: 'userLeft', username: userInRoom.username });

        if (currentRoom.users.size === 0 && !currentRoom.expiresAt) {
            // Start grace period: room will be blocked after 60 seconds if still empty
            if (!emptyRoomTimers.has(roomId)) {
                console.log(`LOG: Sala ${roomId} está vazia. Aguardando 60 segundos antes de bloquear...`);

                const timer = setTimeout(() => {
                    // Check if room is still empty after grace period
                    const room = roomState.get(roomId);
                    if (room && room.users.size === 0) {
                        roomState.delete(roomId);
                        // Also clean up persisted usernames when room is completely empty
                        clearRoomUsernames(roomId);
                        // Block the room for 720 hours (30 days) to prevent reuse
                        blockRoom(roomId);
                        console.log(`LOG: Sala ${roomId} bloqueada após 60 segundos vazia.`);
                    }
                    emptyRoomTimers.delete(roomId);
                }, EMPTY_ROOM_GRACE_PERIOD);

                emptyRoomTimers.set(roomId, timer);
            }
        }
    }

    setTimeout(() => updateRoomCount(roomId), 100);
    sessionMap.delete(socket.id);
    rateLimitMap.delete(socket.id);
  });

  // --- Typing Indicator ---
  socket.on('typing', (isTyping) => {
    if (socket.username && socket.room) {
        socket.to(socket.room).emit('typing', { username: socket.username, isTyping });
    }
  });

  // --- Rename ---
  socket.on('rename', (newName) => {
    if (!socket.username || !socket.room) return;
    const trimmed = (newName || '').trim().substring(0, 30);
    if (!trimmed || trimmed === socket.username) return;

    const sessionInfo = sessionMap.get(socket.id);
    if (!sessionInfo) return;
    const currentRoom = roomState.get(sessionInfo.roomId);
    if (!currentRoom) return;

    // Check if name is already taken in this room
    for (const [, user] of currentRoom.users) {
        if (user.username === trimmed && user.socketId !== socket.id) {
            socket.emit('rename-error', { error: 'Nome já em uso nesta sala.' });
            return;
        }
    }

    const oldName = socket.username;
    socket.username = trimmed;
    const userEntry = currentRoom.users.get(sessionInfo.sessionId);
    if (userEntry) userEntry.username = trimmed;

    // Persist the new username for this session in this room
    setPersistedUsername(sessionInfo.roomId, sessionInfo.sessionId, trimmed);

    socket.emit('rename-success', { username: trimmed });
    io.to(socket.room).emit('system message', { key: 'userRenamed', oldName, newName: trimmed });
    updateRoomCount(sessionInfo.roomId);
  });

  // --- Key Exchange ---
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

  // --- Chat Message (with rate limiting) ---
  socket.on('chat message', (payload) => {
    if (!socket.username || !socket.room) return;
    if (!checkRateLimit(socket.id)) {
        socket.emit('rate-limited');
        return;
    }
    incrementHourlyActivity();
    io.to(socket.room).emit('chat message', {
      ...payload,
      senderId: socket.id,
      username: socket.username,
      messageId: crypto.randomBytes(8).toString('hex'),
      timestamp: Date.now()
    });
  });

  // --- Chat Image (with size limit + rate limiting) ---
  socket.on('chat image', (payload) => {
    if (!socket.username || !socket.room) return;
    if (!checkRateLimit(socket.id)) {
        socket.emit('rate-limited');
        return;
    }
    // Check payload size (~5MB limit for the encrypted data)
    const payloadSize = JSON.stringify(payload).length;
    if (payloadSize > 5 * 1024 * 1024) {
        socket.emit('image-too-large');
        return;
    }
    io.to(socket.room).emit('chat image', {
      ...payload,
      senderId: socket.id,
      username: socket.username,
      messageId: crypto.randomBytes(8).toString('hex'),
      timestamp: Date.now()
    });
  });

  // --- Reactions ---
  socket.on('reaction', (payload) => {
    if (!socket.username || !socket.room) return;
    io.to(socket.room).emit('reaction', {
      messageId: payload.messageId,
      emoji: payload.emoji,
      username: socket.username,
      senderId: socket.id
    });
  });
});

server.listen(PORT, () => {
  console.log(`Servidor a correr na porta ${PORT}`);
});
