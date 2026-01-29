/* Chatzi client script (stable matchmaking build) */

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
function qs(name) {
  const url = new URL(location.href);
  return url.searchParams.get(name);
}
function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// ---------- Backend URL ----------
const BACKEND_URL = "https://chatzi-backend.onrender.com";

// ---------- Page Elements (safe) ----------
const overlay = $("overlay");
const modalTitle = $("modalTitle");
const modalSub = $("modalSub");
const modalBtn = $("modalBtn");

const messages = $("messages");
const messageInput = $("messageInput");
const sendBtn = $("sendBtn");
const newChatBtn = $("newChatBtn");
const handleEl = $("handle");

// typing
const typingEl = $("typing");

// GIF UI (optional, won't break if missing)
const gifBtn = $("gifBtn");
const gifPanel = $("gifPanel");
const gifGrid = $("gifGrid");
const gifSearch = $("gifSearch");
const closeGif = $("closeGif");
const GIF_UI_OK = !!(gifBtn && gifPanel && gifGrid && gifSearch && closeGif);

// ---------- State ----------
let socket = null;
let roomId = null;
let myName = qs("name") || "user";
let myGender = qs("gender") || "Other";
let matched = false;

function showOverlay(title, sub, buttonText = "Cancel") {
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

// ---------- Socket ----------
function connectSocket() {
  addSystem("Connecting to server...");
  showOverlay("Finding your match...", "Please wait while we connect you.", "Cancel");

  socket = io(BACKEND_URL, {
    transports: ["polling", "websocket"],
    reconnection: true,
    reconnectionAttempts: 20,
    timeout: 20000,
  });

  socket.on("connect", () => {
    addSystem("Connected ✅");
    if (handleEl) handleEl.textContent = "@user";
    socket.emit("join", { name: myName, gender: myGender });
  });

  socket.on("connect_error", (e) => {
    addSystem("Connect error: " + (e?.message || "unknown"));
    showOverlay("Server not reachable", "Tap New Chat to retry.", "OK");
  });

  socket.on("finding", () => {
    matched = false;
    roomId = null;
    showOverlay("Finding your match...", "Please wait while we connect you.", "Cancel");
  });

  socket.on("matched", (data) => {
    matched = true;
    roomId = data.roomId;
    hideOverlay();
    const partner = data.partner?.name ? data.partner.name : "stranger";
    addSystem("Matched with " + partner + " ✅");
  });

  socket.on("partner_left", () => {
    matched = false;
    roomId = null;
    addSystem("Stranger left the chat.");
    showOverlay("Stranger left", "Press New Chat to find someone else.", "OK");
  });

  socket.on("message", (m) => {
    const mine = m.from === socket.id;
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

// typing emit (throttled)
let typingTimer = null;
function onTyping() {
  if (!socket || !socket.connected || !roomId) return;
  if (typingTimer) return;
  typingTimer = setTimeout(() => (typingTimer = null), 350);
  socket.emit("typing", { roomId });
}

// Skip / New Chat
function newChat() {
  if (!socket) return;
  socket.emit("skip");
}

// ---------- Events ----------
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

// Modal cancel
if (modalBtn) modalBtn.addEventListener("click", () => {
  hideOverlay();
});

// ---------- GIF (optional safe) ----------
if (GIF_UI_OK) {
  gifBtn.addEventListener("click", () => {
    gifPanel.style.display = "block";
  });
  closeGif.addEventListener("click", () => {
    gifPanel.style.display = "none";
  });
}

// ---------- Start ----------
connectSocket();
