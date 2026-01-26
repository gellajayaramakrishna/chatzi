const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

function isAllowedOrigin(origin) {
  if (!origin) return true; // uptime robot, curl
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === "chatzi.vercel.app" ||
      hostname.endsWith(".vercel.app") ||
      hostname === "chatzi.me" ||
      hostname.endsWith(".chatzi.me") ||
      hostname === "localhost"
    );
  } catch {
    return false;
  }
}

// ✅ CORS for normal HTTP routes like /health
app.use(
  cors({
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
    credentials: true,
  })
);

app.get("/", (req, res) => res.send("Chatzi backend is running ✅"));
app.get("/health", (req, res) => res.json({ ok: true }));

// ✅ Socket.IO CORS
const io = new Server(server, {
  cors: {
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
    methods: ["GET", "POST"],
    credentials: true,
  },
});

let waitingUser = null;
const profiles = new Map();
const lastMsgTime = new Map();

function broadcastOnlineCount() {
  io.emit("online_count", io.engine.clientsCount);
}

io.on("connection", (socket) => {
  broadcastOnlineCount();

  socket.on("register_profile", ({ name, gender }) => {
    profiles.set(socket.id, {
      name: name || "Anonymous",
      gender: gender || "Other",
    });
  });

  socket.on("find_match", () => {
    if (!profiles.has(socket.id)) return socket.emit("need_profile");

    if (waitingUser && waitingUser.id !== socket.id) {
      const room = `room-${waitingUser.id}-${socket.id}`;
      const p1 = profiles.get(waitingUser.id);
      const p2 = profiles.get(socket.id);

      waitingUser.join(room);
      socket.join(room);

      waitingUser.emit("matched", { room, partner: { gender: p2.gender } });
      socket.emit("matched", { room, partner: { gender: p1.gender } });

      waitingUser.currentRoom = room;
      socket.currentRoom = room;

      waitingUser = null;
    } else {
      waitingUser = socket;
      socket.emit("waiting");
    }
  });

  socket.on("send_message", ({ room, message }) => {
    if (!room || !message) return;

    const now = Date.now();
    const last = lastMsgTime.get(socket.id) || 0;
    if (now - last < 500) return; // anti spam

    lastMsgTime.set(socket.id, now);
    socket.to(room).emit("receive_message", message);
  });

  socket.on("disconnect", () => {
    broadcastOnlineCount();
    if (waitingUser && waitingUser.id === socket.id) waitingUser = null;
    if (socket.currentRoom) socket.to(socket.currentRoom).emit("partner_left");
    profiles.delete(socket.id);
    lastMsgTime.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Chatzi backend on port", PORT));
