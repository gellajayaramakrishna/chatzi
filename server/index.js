const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  "https://chatzi.vercel.app",
  "http://localhost:3000"
];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

app.get("/", (req, res) => res.send("Chatzi backend is running ✅"));
app.get("/health", (req, res) => res.json({ ok: true }));

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
    if (!profiles.has(socket.id)) {
      socket.emit("need_profile");
      return;
    }

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
    if (now - last < 500) return;

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
