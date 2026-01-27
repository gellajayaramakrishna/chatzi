const express = require("express");
const http = require("http");
const path = require("path");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

/**
 * ✅ Allowed frontend origins
 * Add your production domains here.
 */
const ALLOWED_ORIGINS = new Set([
  "https://chatzi.me",
  "https://www.chatzi.me",
  "https://chatzi.vercel.app",
  "http://localhost:3000",
]);

/**
 * ✅ CORS middleware (Express routes like /health)
 * Allow requests with no Origin too (origin === undefined / null),
 * otherwise Render checks and some browsers can get blocked.
 */
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // ✅ allow null/undefined origin
      if (ALLOWED_ORIGINS.has(origin)) return cb(null, true);
      return cb(new Error("CORS blocked: " + origin));
    },
    credentials: true,
  })
);

app.use(express.json());

/**
 * ✅ Health route
 */
app.get("/", (req, res) => res.send("Chatzi backend running ✅"));
app.get("/health", (req, res) => res.json({ ok: true }));

/**
 * ✅ Socket.IO with CORS
 */
const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // ✅ allow null/undefined
      if (ALLOWED_ORIGINS.has(origin)) return cb(null, true);
      return cb(new Error("Socket CORS blocked: " + origin));
    },
    credentials: true,
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});

/**
 * ✅ Matching logic
 */
let waitingUser = null;

io.on("connection", (socket) => {
  console.log("✅ connected:", socket.id);

  socket.on("find", (payload = {}) => {
    socket.data.user = payload;

    // if someone waiting, match
    if (waitingUser && waitingUser.connected && waitingUser.id !== socket.id) {
      const a = waitingUser;
      const b = socket;

      waitingUser = null;

      const room = `room_${a.id}_${b.id}`;
      a.join(room);
      b.join(room);

      a.data.room = room;
      b.data.room = room;

      a.emit("matched", { room, peer: b.data.user || {} });
      b.emit("matched", { room, peer: a.data.user || {} });

      console.log("🎯 matched:", a.id, "<->", b.id, "room:", room);
    } else {
      waitingUser = socket;
      socket.emit("status", { state: "waiting" });
      console.log("⏳ queued:", socket.id);
    }
  });

  socket.on("message", (text) => {
    const room = socket.data.room;
    if (!room) return;
    socket.to(room).emit("message", { text });
  });

  socket.on("typing", () => {
    const room = socket.data.room;
    if (!room) return;
    socket.to(room).emit("typing");
  });

  socket.on("stopTyping", () => {
    const room = socket.data.room;
    if (!room) return;
    socket.to(room).emit("stopTyping");
  });

  socket.on("skip", () => {
    const room = socket.data.room;
    if (room) {
      socket.to(room).emit("peerLeft");
    }
    socket.data.room = null;

    if (waitingUser && waitingUser.id === socket.id) {
      waitingUser = null;
    }
    socket.emit("status", { state: "skipped" });
  });

  socket.on("disconnect", () => {
    console.log("❌ disconnected:", socket.id);

    const room = socket.data.room;
    if (room) socket.to(room).emit("peerLeft");

    if (waitingUser && waitingUser.id === socket.id) {
      waitingUser = null;
    }
  });
});

/**
 * ✅ Start server (Render uses PORT env)
 */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("🚀 Backend listening on", PORT));
