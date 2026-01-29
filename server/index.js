const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(express.json());

// ✅ Add all your frontend domains here
const ALLOWED_ORIGINS = [
  "https://chatzi.me",
  "https://www.chatzi.me",
  "https://chatzi.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

// CORS for REST
app.use(
  cors({
    origin: (origin, cb) => {
      // allow no-origin (curl, server-to-server)
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error("CORS blocked: " + origin));
    },
    credentials: true,
  })
);

app.get("/", (req, res) => res.send("Chatzi backend is running ✅"));
app.get("/health", (req, res) => res.json({ ok: true, ts: Date.now() }));

const server = http.createServer(app);

// ✅ Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error("CORS blocked: " + origin));
    },
    credentials: true,
  },
  transports: ["polling", "websocket"], // important for Render + mobile
});

// ---- Matchmaking (simple + reliable) ----
const waiting = []; // { id, name, gender, ts }
const userInfo = new Map(); // socket.id -> {name, gender, roomId}

function removeWaiting(id) {
  const idx = waiting.findIndex((x) => x.id === id);
  if (idx !== -1) waiting.splice(idx, 1);
}

function makeRoomId(a, b) {
  return "room_" + [a, b].sort().join("_");
}

function tryMatch() {
  // match first two waiting
  if (waiting.length < 2) return;

  const a = waiting.shift();
  const b = waiting.shift();

  const roomId = makeRoomId(a.id, b.id);

  const sa = io.sockets.sockets.get(a.id);
  const sb = io.sockets.sockets.get(b.id);
  if (!sa || !sb) return;

  sa.join(roomId);
  sb.join(roomId);

  userInfo.set(a.id, { ...(userInfo.get(a.id) || {}), roomId });
  userInfo.set(b.id, { ...(userInfo.get(b.id) || {}), roomId });

  sa.emit("matched", { roomId, partner: { name: b.name, gender: b.gender } });
  sb.emit("matched", { roomId, partner: { name: a.name, gender: a.gender } });
}

function onlineCount() {
  return io.engine.clientsCount || 0;
}

io.on("connection", (socket) => {
  socket.emit("online", { count: onlineCount() });
  socket.broadcast.emit("online", { count: onlineCount() });

  socket.on("join", ({ name, gender }) => {
    name = (name || "user").toString().slice(0, 30);
    gender = (gender || "Other").toString().slice(0, 15);

    userInfo.set(socket.id, { name, gender, roomId: null });

    // remove old waiting (safety) and add fresh
    removeWaiting(socket.id);
    waiting.push({ id: socket.id, name, gender, ts: Date.now() });

    socket.emit("finding");
    tryMatch();
  });

  socket.on("message", ({ roomId, text }) => {
    const info = userInfo.get(socket.id);
    if (!info || !info.roomId || info.roomId !== roomId) return;

    text = (text || "").toString();
    if (!text.trim()) return;
    if (text.length > 1000) text = text.slice(0, 1000);

    io.to(roomId).emit("message", {
      from: socket.id,
      text,
      ts: Date.now(),
    });
  });

  socket.on("typing", ({ roomId }) => {
    const info = userInfo.get(socket.id);
    if (!info || !info.roomId || info.roomId !== roomId) return;
    socket.to(roomId).emit("typing");
  });

  socket.on("skip", () => {
    const info = userInfo.get(socket.id);
    if (info?.roomId) {
      socket.to(info.roomId).emit("partner_left");
      socket.leave(info.roomId);
      userInfo.set(socket.id, { ...info, roomId: null });
    }
    removeWaiting(socket.id);

    // re-join queue using stored info
    const u = userInfo.get(socket.id);
    if (u) {
      waiting.push({ id: socket.id, name: u.name, gender: u.gender, ts: Date.now() });
      socket.emit("finding");
      tryMatch();
    }
  });

  socket.on("disconnect", () => {
    removeWaiting(socket.id);

    const info = userInfo.get(socket.id);
    if (info?.roomId) {
      socket.to(info.roomId).emit("partner_left");
    }
    userInfo.delete(socket.id);

    io.emit("online", { count: onlineCount() });
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log("✅ Chatzi backend listening on", PORT);
});
