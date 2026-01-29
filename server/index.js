const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(express.json());

app.use(cors({ origin: "*", credentials: true }));
app.get("/", (req, res) => res.send("Chatzi backend running ✅"));
app.get("/health", (req, res) => res.json({ ok: true, ts: Date.now() }));

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", credentials: true },
  transports: ["polling", "websocket"],
});

let waiting = []; // {id,name,gender,ts}
const info = new Map(); // socket.id -> {name,gender,roomId}

function removeWaiting(id) {
  waiting = waiting.filter(u => u.id !== id);
}

function makeRoomId(a, b) {
  return "room_" + [a, b].sort().join("_");
}

function tryMatch() {
  while (waiting.length >= 2) {
    const a = waiting.shift();
    const b = waiting.shift();

    const sa = io.sockets.sockets.get(a.id);
    const sb = io.sockets.sockets.get(b.id);
    if (!sa || !sb) continue;

    const roomId = makeRoomId(a.id, b.id);
    sa.join(roomId);
    sb.join(roomId);

    info.set(a.id, { ...(info.get(a.id) || {}), roomId });
    info.set(b.id, { ...(info.get(b.id) || {}), roomId });

    sa.emit("matched", { roomId, partner: { name: b.name, gender: b.gender } });
    sb.emit("matched", { roomId, partner: { name: a.name, gender: a.gender } });
  }
}

io.on("connection", (socket) => {
  socket.on("join", ({ name, gender }) => {
    name = (name || "user").toString().slice(0, 30);
    gender = (gender || "Other").toString().slice(0, 20);

    info.set(socket.id, { name, gender, roomId: null });

    removeWaiting(socket.id);
    waiting.push({ id: socket.id, name, gender, ts: Date.now() });

    socket.emit("finding");
    tryMatch();
  });

  socket.on("message", ({ roomId, text }) => {
    const me = info.get(socket.id);
    if (!me || !me.roomId || me.roomId !== roomId) return;

    text = (text || "").toString();
    if (!text.trim()) return;
    if (text.length > 1000) text = text.slice(0, 1000);

    io.to(roomId).emit("message", { from: socket.id, text, ts: Date.now() });
  });

  socket.on("typing", ({ roomId }) => {
    const me = info.get(socket.id);
    if (!me || !me.roomId || me.roomId !== roomId) return;
    socket.to(roomId).emit("typing");
  });

  socket.on("skip", () => {
    const me = info.get(socket.id);
    if (me?.roomId) {
      socket.to(me.roomId).emit("partner_left");
      socket.leave(me.roomId);
      info.set(socket.id, { ...me, roomId: null });
    }

    removeWaiting(socket.id);

    const u = info.get(socket.id);
    if (u) {
      waiting.push({ id: socket.id, name: u.name, gender: u.gender, ts: Date.now() });
      socket.emit("finding");
      tryMatch();
    }
  });

  socket.on("disconnect", () => {
    removeWaiting(socket.id);

    const me = info.get(socket.id);
    if (me?.roomId) {
      socket.to(me.roomId).emit("partner_left");
    }
    info.delete(socket.id);
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log("✅ Chatzi backend listening on", PORT));
