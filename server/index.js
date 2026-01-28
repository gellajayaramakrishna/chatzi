const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
app.use(express.json());

// ---- CORS ----
// Allow your domains + localhost + all vercel preview domains
const allowedExact = new Set([
  "https://chatzi.me",
  "https://www.chatzi.me",
  "https://chatzi.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);

function isAllowed(origin) {
  if (!origin) return true; // allow curl/postman/null
  if (allowedExact.has(origin)) return true;
  if (origin.endsWith(".vercel.app")) return true;
  return false;
}

app.use(cors({
  origin: (origin, cb) => {
    if (isAllowed(origin)) return cb(null, true);
    return cb(new Error("CORS blocked: " + origin));
  },
  credentials: true
}));

// Health + root endpoints (so Render doesn't show "Cannot GET /")
app.get("/", (req, res) => res.json({ ok: true, service: "chatzi-backend" }));
app.get("/health", (req, res) => res.json({ ok: true }));

// Local dev: serve client static if exists (optional)
const clientDir = path.join(__dirname, "..", "client");
app.use(express.static(clientDir));

// If a client file exists, allow /start.html etc in local dev
app.get("/:file(start.html|chat.html|index.html)", (req, res) => {
  res.sendFile(path.join(clientDir, req.params.file));
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      if (isAllowed(origin)) return cb(null, true);
      return cb(new Error("CORS blocked: " + origin));
    },
    credentials: true
  },
  transports: ["websocket", "polling"]
});

// ---- Matchmaking ----
const waiting = []; // queue of sockets waiting to match
const userInfo = new Map(); // socket.id -> {name, gender, room, partnerId}

function removeFromQueue(id) {
  const idx = waiting.findIndex(sid => sid === id);
  if (idx >= 0) waiting.splice(idx, 1);
}

function tryMatch() {
  while (waiting.length >= 2) {
    const a = waiting.shift();
    const b = waiting.shift();
    if (!io.sockets.sockets.get(a) || !io.sockets.sockets.get(b)) continue;

    const room = `room_${a.slice(0,5)}_${b.slice(0,5)}_${Date.now()}`;

    const A = userInfo.get(a);
    const B = userInfo.get(b);
    if (!A || !B) continue;

    A.room = room; B.room = room;
    A.partnerId = b; B.partnerId = a;

    const sockA = io.sockets.sockets.get(a);
    const sockB = io.sockets.sockets.get(b);

    sockA.join(room);
    sockB.join(room);

    sockA.emit("matched", {
      room,
      partnerName: B.name,
      partnerGender: B.gender
    });

    sockB.emit("matched", {
      room,
      partnerName: A.name,
      partnerGender: A.gender
    });
  }
}

function broadcastOnlineCount() {
  io.emit("online_count", io.engine.clientsCount);
}

// ---- Socket events ----
io.on("connection", (socket) => {
  broadcastOnlineCount();

  socket.on("join", ({ name, gender }) => {
    userInfo.set(socket.id, {
      name: String(name || "anonymous").slice(0, 40),
      gender: String(gender || "Other").slice(0, 20),
      room: null,
      partnerId: null
    });

    removeFromQueue(socket.id);
    waiting.push(socket.id);
    tryMatch();
  });

  socket.on("new_chat", () => {
    const me = userInfo.get(socket.id);
    if (!me) return;

    // If in a room, notify partner and leave
    if (me.room && me.partnerId) {
      const partner = io.sockets.sockets.get(me.partnerId);
      if (partner) partner.emit("partner_left");
      socket.leave(me.room);

      // cleanup partner info too
      const pInfo = userInfo.get(me.partnerId);
      if (pInfo) {
        pInfo.room = null;
        pInfo.partnerId = null;
        removeFromQueue(me.partnerId);
        waiting.push(me.partnerId);
      }
    }

    me.room = null;
    me.partnerId = null;

    removeFromQueue(socket.id);
    waiting.push(socket.id);
    tryMatch();
  });

  socket.on("message", (payload) => {
    const me = userInfo.get(socket.id);
    if (!me || !me.room) return;

    const msg = payload || {};
    const type = msg.type === "gif" ? "gif" : "text";

    if (type === "gif") {
      const url = String(msg.url || "").slice(0, 600);
      if (!url) return;
      socket.to(me.room).emit("message", { type: "gif", url, from: socket.id });
      return;
    }

    const text = String(msg.text || "").slice(0, 1200);
    if (!text) return;
    socket.to(me.room).emit("message", { type: "text", text, from: socket.id });
  });

  socket.on("typing", () => {
    const me = userInfo.get(socket.id);
    if (!me || !me.room) return;
    socket.to(me.room).emit("typing");
  });

  socket.on("disconnect", () => {
    const me = userInfo.get(socket.id);

    removeFromQueue(socket.id);

    if (me && me.room && me.partnerId) {
      const partner = io.sockets.sockets.get(me.partnerId);
      if (partner) {
        partner.emit("partner_left");
        const pInfo = userInfo.get(me.partnerId);
        if (pInfo) {
          pInfo.room = null;
          pInfo.partnerId = null;
          removeFromQueue(me.partnerId);
          waiting.push(me.partnerId);
          tryMatch();
        }
      }
    }

    userInfo.delete(socket.id);
    broadcastOnlineCount();
  });
});

// Periodic count updates
setInterval(broadcastOnlineCount, 3000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Chatzi backend running on port", PORT);
});
