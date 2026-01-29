const BACKEND_URL = "https://chatzi-backend.onrender.com";

const $ = (id) => document.getElementById(id);

function qs(name) {
  const u = new URL(location.href);
  return u.searchParams.get(name);
}

function esc(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

const overlay = $("overlay");
const modalTitle = $("modalTitle");
const modalSub = $("modalSub");
const modalBtn = $("modalBtn");

const messages = $("messages");
const messageInput = $("messageInput");
const sendBtn = $("sendBtn");
const newChatBtn = $("newChatBtn");
const handleEl = $("handle");
const typingEl = $("typing");
const matchStatus = $("matchStatus");

let socket = null;
let roomId = null;
let matched = false;

const myName = qs("name") || "user";
const myGender = qs("gender") || "Other";

function showOverlay(title, sub, buttonText = "OK") {
  overlay.style.display = "flex";
  modalTitle.textContent = title;
  modalSub.textContent = sub || "";
  modalBtn.textContent = buttonText;
}
function hideOverlay() {
  overlay.style.display = "none";
}

function addSystem(msg) {
  const div = document.createElement("div");
  div.className = "sys";
  div.innerHTML = esc(msg);
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function addMsg(text, mine) {
  const div = document.createElement("div");
  div.className = mine ? "msg mine" : "msg";
  div.innerHTML = esc(text);
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function connect() {
  showOverlay("Finding your match…", "Connecting to server…", "Cancel");

  socket = io(BACKEND_URL, {
    transports: ["polling", "websocket"],
    reconnection: true,
    reconnectionAttempts: 30,
    timeout: 20000
  });

  socket.on("connect", ()=> setStatus("Online"));
}););
  });

  socket.on("connect_error", (e) => {
    addSystem("Connect error: " + (e?.message || "unknown"));
    setStatus("Server not reachable");
    showOverlay("Server not reachable", "Press New Chat to retry.", "OK");
  });

  socket.on("finding", () => {
    matched = false;
    roomId = null;
    setStatus("Finding stranger…");
    showOverlay("Finding your match…", "Please wait…", "Cancel");
  });

  socket.on("matched", (data) => {
    matched = true;
    roomId = data.roomId;
    hideOverlay();
    setStatus("Connected ✅");
    addSystem("Matched ✅ You are now chatting.");
  });

  socket.on("partner_left", () => {
    matched = false;
    roomId = null;
    addSystem("Stranger left the chat.");
    setStatus("Stranger left");
    showOverlay("Stranger left", "Press New Chat to find someone else.", "OK");
  });

  socket.on("message", (m) => {
    const mine = socket && m.from === socket.id;
    addMsg(m.text, mine);
  });

  socket.on("typing", () => {
    typingEl.style.opacity = "1";
    typingEl.textContent = "Stranger is typing…";
    setTimeout(() => (typingEl.style.opacity = "0"), 900);
  });
}

function sendMessage() {
  const text = (messageInput.value || "").trim();
  if (!text) return;

  if (!socket || !socket.connected || !matched || !roomId) {
    addSystem("Not matched yet…");
    return;
  }

  socket.emit("message", { roomId, text });
  messageInput.value = "";
}

let typingCooldown = null;
function onTyping() {
  if (!socket || !socket.connected || !roomId) return;
  if (typingCooldown) return;
  typingCooldown = setTimeout(() => (typingCooldown = null), 350);
  socket.emit("typing", { roomId });
}

function newChat() {
  if (!socket) return;
  socket.emit("skip");
  setStatus("Finding stranger…");
}

sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});
messageInput.addEventListener("input", onTyping);

newChatBtn.addEventListener("click", newChat);
modalBtn.addEventListener("click", hideOverlay);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") newChat();
});

connect();
