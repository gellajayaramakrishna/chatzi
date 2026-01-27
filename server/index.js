const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const ALLOWED_ORIGINS = [
  "https://chatzi.me",
  "https://www.chatzi.me",
  "https://chatzi.vercel.app",
  "http://localhost:3000",
];

// Express CORS (for /health etc.)
app.use(cors({
  origin: function (origin, cb) {
    // allow non-browser tools (curl/postman) with no origin
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error("CORS blocked: " + origin));
  },
  methods: ["GET", "POST"],
}));

app.get("/", (req, res) => res.send("Chatzi backend running ✅"));
app.get("/health", (req, res) => res.json({ ok: true }));

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"], // important: allow fallback
});

let waiting = []; // simple queue

io.on("connection", (socket) => {
  socket.on("find", ({ name, gender }) => {
    socket.data.name = name || "Anonymous";
    socket.data.gender = gender || "Other";

    // remove from queue if already there
    waiting = waiting.filter((s) => s.id !== socket.id);

    // find a partner
    const partner = waiting.shift();

    if (!partner) {
      waiting.push(socket);
      socket.emit("status", { state: "waiting" });
      return;
    }

    // pair them
    socket.data.partnerId = partner.id;
    partner.data.partnerId = socket.id;

    socket.emit("matched", {
      partner: {
        name: partner.data.name,
        gender: partner.data.gender,
      },
    });

    partner.emit("matched", {
      partner: {
        name: socket.data.name,
        gender: socket.data.gender,
      },
    });
  });

  socket.on("message", (text) => {
    const pid = socket.data.partnerId;
    if (pid) io.to(pid).emit("message", { from: "Stranger", text });
  });

  socket.on("skip", () => {
    const pid = socket.data.partnerId;

    // tell partner you left
    if (pid) {
      io.to(pid).emit("left");
      const pSocket = io.sockets.sockets.get(pid);
      if (pSocket) pSocket.data.partnerId = null;
    }

    socket.data.partnerId = null;

    // remove from waiting
    waiting = waiting.filter((s) => s.id !== socket.id);

    socket.emit("status", { state: "idle" });
  });

  socket.on("disconnect", () => {
    const pid = socket.data.partnerId;

    // remove from waiting
    waiting = waiting.filter((s) => s.id !== socket.id);

    // notify partner
    if (pid) {
      io.to(pid).emit("left");
      const pSocket = io.sockets.sockets.get(pid);
      if (pSocket) pSocket.data.partnerId = null;
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Chatzi backend running on port", PORT));
