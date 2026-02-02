import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { Server } from "socket.io";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

app.use((req, res, next) => {
  if (req.headers.host === 'www.chatzi.me') {
    return res.redirect(301, 'https://chatzi.me' + req.originalUrl);
  }
  next();
});


app.set("trust proxy", 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json());

app.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
}));

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "public", "welcome.html")));
app.get("/start", (_req, res) => res.sendFile(path.join(__dirname, "public", "welcome.html")));
app.get("/gender", (_req, res) => res.sendFile(path.join(__dirname, "public", "gender.html")));
app.get("/chat", (_req, res) => res.sendFile(path.join(__dirname, "public", "chat.html")));
app.get("/health", (_req, res) => res.status(200).send("ok"));

const io = new Server(server, {});

// ---------- State ----------
const waitingQueue = [];                  // socketIds waiting
const partnerOf = new Map();              // socketId -> partnerSocketId
const profileOf = new Map();              // socketId -> {name, gender, interests[]}
const blocked = new Map();                // socketId -> Set(blockedSocketId)
const reportCount = new Map();            // socketId -> number reports this session
const cooldownUntil = new Map();          // socketId -> timestamp (ms)

function now() { return Date.now(); }

function isConnected(socketId) {
  const s = io.sockets.sockets.get(socketId);
  return !!s && s.connected;
}
function safeEmit(socketId, event, payload) {
  const s = io.sockets.sockets.get(socketId);
  if (s) s.emit(event, payload);
}
function removeFromQueue(socketId) {
  const idx = waitingQueue.indexOf(socketId);
  if (idx !== -1) waitingQueue.splice(idx, 1);
}
function inCooldown(socketId) {
  const t = cooldownUntil.get(socketId) || 0;
  return t > now();
}
function ensureBlockedSet(socketId) {
  if (!blocked.has(socketId)) blocked.set(socketId, new Set());
  return blocked.get(socketId);
}
function isBlockedEitherWay(a, b) {
  const aSet = blocked.get(a);
  const bSet = blocked.get(b);
  return (aSet && aSet.has(b)) || (bSet && bSet.has(a));
}
function normalizeInterests(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map(x => String(x).toLowerCase().trim())
    .filter(Boolean)
    .slice(0, 5);
}
function intersectCount(aArr, bArr) {
  if (!aArr?.length || !bArr?.length) return 0;
  const s = new Set(aArr);
  let c = 0;
  for (const x of bArr) if (s.has(x)) c++;
  return c;
}

function disconnectPair(socketId, reasonForPartner = "Partner disconnected") {
  const partner = partnerOf.get(socketId);
  partnerOf.delete(socketId);

  if (partner) {
    partnerOf.delete(partner);
    safeEmit(partner, "paired", { paired: false });
    safeEmit(partner, "system", { msg: reasonForPartner });
  }

  safeEmit(socketId, "paired", { paired: false });
}

function tryMatch() {
  // clean dead/cooldown sockets from queue
  for (let i = waitingQueue.length - 1; i >= 0; i--) {
    const id = waitingQueue[i];
    if (!isConnected(id) || inCooldown(id)) waitingQueue.splice(i, 1);
  }

  // attempt pairing while 2+ people waiting
  while (waitingQueue.length >= 2) {
    const a = waitingQueue.shift();
    if (!isConnected(a) || inCooldown(a)) continue;

    const aProf = profileOf.get(a) || { interests: [] };

    // find best match for 'a'
    let bestIdx = -1;
    let bestScore = -1;

    for (let i = 0; i < waitingQueue.length; i++) {
      const b = waitingQueue[i];
      if (!isConnected(b) || inCooldown(b)) continue;
      if (a === b) continue;
      if (isBlockedEitherWay(a, b)) continue;

      const bProf = profileOf.get(b) || { interests: [] };

      // interest score (prefer shared interests, but fallback allowed)
      const score = intersectCount(aProf.interests, bProf.interests);

      // choose the highest score; if all 0, first acceptable will be used
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
        if (bestScore >= 2) break; // good enough, stop searching
      }
    }

    if (bestIdx === -1) {
      // no suitable partner right now -> put back and stop
      waitingQueue.unshift(a);
      break;
    }

    const b = waitingQueue.splice(bestIdx, 1)[0];

    partnerOf.set(a, b);
    partnerOf.set(b, a);

    safeEmit(a, "paired", { paired: true });
    safeEmit(b, "paired", { paired: true });

    // share minimal partner info (optional for UI)
    const aInfo = profileOf.get(a) || {};
    const bInfo = profileOf.get(b) || {};

    safeEmit(a, "partner", { name: bInfo.name || "anonymous" });
    safeEmit(b, "partner", { name: aInfo.name || "anonymous" });
  }
}

function broadcastOnlineCount() {
  io.emit("onlineCount", { count: io.engine.clientsCount });
}

io.on("connection", (socket) => {
  broadcastOnlineCount();

  socket.on("profile", (payload) => {
    const name = typeof payload?.name === "string" ? payload.name.slice(0, 40) : "anonymous";
    const gender = typeof payload?.gender === "string" ? payload.gender.slice(0, 20) : "";
    const interests = normalizeInterests(payload?.interests);
    profileOf.set(socket.id, { name, gender, interests });
  });

  socket.on("find", () => {
    if (partnerOf.has(socket.id)) return;
    if (inCooldown(socket.id)) {
      socket.emit("system", { msg: "Please wait a bit before starting a new chat." });
      return;
    }
    removeFromQueue(socket.id);
    waitingQueue.push(socket.id);
    socket.emit("system", { msg: "Finding someone..." });
    tryMatch();
  });

  socket.on("next", () => {
    if (partnerOf.has(socket.id)) {
      disconnectPair(socket.id, "Partner skipped. You can find a new chat.");
    }
    if (inCooldown(socket.id)) return;
    removeFromQueue(socket.id);
    waitingQueue.push(socket.id);
    socket.emit("system", { msg: "Finding someone..." });
    tryMatch();
  });

  socket.on("typing", (payload) => {
    const partner = partnerOf.get(socket.id);
    if (!partner) return;
    safeEmit(partner, "typing", { typing: !!payload?.typing });
  });

  socket.on("block", () => {
    const partner = partnerOf.get(socket.id);
    if (!partner) return;

    ensureBlockedSet(socket.id).add(partner);

    // disconnect both sides
    disconnectPair(socket.id, "Partner blocked. You can find a new chat.");
    safeEmit(socket.id, "system", { msg: "You blocked this user." });
  });

  socket.on("report", (payload) => {
    const partner = partnerOf.get(socket.id);
    if (!partner) return;

    const reason = typeof payload?.reason === "string" ? payload.reason.slice(0, 80) : "unspecified";

    // count reports against the partner
    const c = (reportCount.get(partner) || 0) + 1;
    reportCount.set(partner, c);

    // light cooldown if repeatedly reported in this session
    if (c >= 3) {
      cooldownUntil.set(partner, now() + 10 * 60 * 1000); // 10 minutes
      removeFromQueue(partner);
      safeEmit(partner, "system", { msg: "You have been temporarily restricted due to reports." });
      disconnectPair(partner, "Chat ended.");
    }

    console.log(`[REPORT] from=${socket.id} against=${partner} reason=${reason} count=${c}`);

    // end chat for reporter immediately
    disconnectPair(socket.id, "You reported this chat. You can start a new one.");
    safeEmit(socket.id, "system", { msg: "Report submitted. Thanks for keeping chatzi safe ✅" });
  });

  socket.on("message", (payload) => {
    const partner = partnerOf.get(socket.id);
    if (!partner) {
      socket.emit("system", { msg: "You are not connected yet." });
      return;
    }
    let msg = typeof payload?.msg === "string" ? payload.msg.trim() : "";
    if (!msg) return;
    if (msg.length > 800) msg = msg.slice(0, 800);
    msg = msg.replace(/[\u0000-\u001F\u007F]/g, "");
    safeEmit(partner, "message", { msg });
  });

  socket.on("disconnect", () => {
    removeFromQueue(socket.id);
    profileOf.delete(socket.id);

    if (partnerOf.has(socket.id)) disconnectPair(socket.id, "Partner disconnected.");
    broadcastOnlineCount();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`chatzi running on http://localhost:${PORT}`));
