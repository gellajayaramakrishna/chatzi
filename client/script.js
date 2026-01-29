/* Chatzi client script (NO GIF) - stable matchmaking */

const BACKEND_URL = "https://chatzi-backend.onrender.com";

const $ = (id) => document.getElementById(id);

function qs(name) {
  const u = new URL(location.href);
  return u.searchParams.get(name);
}

function escapeHtml(s) {
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

let socket = null;
let roomId = null;
let matched = false;

const myName = qs("name") || "user";
const myGender = qs("gender") || "Other";

function showOverlay(title, sub, buttonText = "OK") {
  if (!overlay) return;
  overlay.style.display = "flex";
  if (modalTitle) modalTitle.textContent = title;
  if (modalSub) modalSub.textContent = sub || "";
  if (modalBtn) modalBtn.textContent = buttonText;
}

function hideOverlay() {
  if (!overlay) return;
  overlay.style.display = "none";
}

function addSystem(msg) {
  if (!messages) return;
  const div = document.createElement("div");
  div.className = "sys";
  div.innerHTML = escapeHtml(msg);
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function addMsg(text, mine) {
  if (!messages) return;
  const div = document.createElement("div");
  div.className = mine ? "msg mine" : "msg";
  div.innerHTML = escapeHtml(text);
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function connectSocket() {
  showOverlay("Finding your match...", "Connecting to server…", "Cancel");

  socket = io(BACKEND_URL, {
    transports: ["polling", "websocket"],
    reconnection: true,
    reconnectionAttempts: 30,
    timeout: 20000,
  });

  socket.on("connect", () => {
    addSystem("Connected ✅");
    socket.emit("join", { name: myName, gender: myGender });
  });

  socket.on("connect_error", (e) => {
    addSystem("Connect error: " + (e?.message || "unknown"));
    showOverlay("Server not reachable", "Press New Chat to retry.", "OK");
  });

  socket.on("finding", () => {
    matched = false;
    roomId = null;
    showOverlay("Finding your match...", "Please wait…", "Cancel");
  });

  socket.on("matched", (data) => {
    matched = true;
    roomId = data.roomId;

    const partner = data.partner?.name || "stranger";
    if (handleEl) handleEl.textContent = "@user";
    hideOverlay();
    addSystem("Matched ✅ You are chatting with " + partner);
  });

  socket.on("partner_left", () => {
    matched = false;
    roomId = null;
    addSystem("Stranger left the chat.");
    showOverlay("Stranger left", "Press New Chat to find someone else.", "OK");
  });

  socket.on("message", (m) => {
    const mine = socket && m.from === socket.id;
    addMsg(m.text, mine);
  });

  socket.on("typing", () => {
    if (!typingEl) return;
    typingEl.style.opacity = "1";
    typingEl.textContent = "Stranger is typing…";
    setTimeout(() => {
      typingEl.style.opacity = "0";
    }, 900);
  });
}

function sendMessage() {
  const text = (messageInput?.value || "").trim();
  if (!text) return;

  if (!socket || !socket.connected || !matched || !roomId) {
    addSystem("Not connected / not matched yet.");
    return;
  }

  socket.emit("message", { roomId, text });
  messageInput.value = "";
}

let typingThrottle = null;
function onTyping() {
  if (!socket || !socket.connected || !roomId) return;
  if (typingThrottle) return;
  typingThrottle = setTimeout(() => (typingThrottle = null), 350);
  socket.emit("typing", { roomId });
}

function newChat() {
  if (!socket) return;
  socket.emit("skip");
}

if (sendBtn) sendBtn.addEventListener("click", sendMessage);

if (messageInput) {
  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });
  messageInput.addEventListener("input", onTyping);
}

if (newChatBtn) newChatBtn.addEventListener("click", newChat);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") newChat();
});

if (modalBtn) modalBtn.addEventListener("click", () => hideOverlay());

connectSocket();
