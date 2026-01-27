/* ===============================
   CHATZI – CLIENT SCRIPT (FINAL)
   =============================== */

/* 🔗 BACKEND URL (Render) */
const BACKEND_URL = "https://chatzi-backend.onrender.com";

/* 🔌 Socket.io connection */
const socket = io(BACKEND_URL, {
  transports: ["websocket"],
  reconnection: true
});

/* 🧠 DOM Elements */
const messages = document.getElementById("messages");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const typingEl = document.getElementById("typingIndicator");
const statusEl = document.getElementById("status");
const newChatBtn = document.getElementById("newChatBtn");

/* 🧪 Debug helper */
function debug(msg) {
  console.log("[CHATZI]", msg);
}

/* ===============================
   SOCKET EVENTS
   =============================== */

socket.on("connect", () => {
  debug("Connected to backend");
  if (statusEl) statusEl.innerText = "Connected";
});

socket.on("disconnect", () => {
  debug("Disconnected");
  if (statusEl) statusEl.innerText = "Disconnected";
});

socket.on("waiting", () => {
  debug("Waiting for partner...");
  if (statusEl) statusEl.innerText = "Finding someone...";
});

socket.on("matched", () => {
  debug("Matched!");
  if (statusEl) statusEl.innerText = "Connected to stranger";
});

socket.on("message", (msg) => {
  addMessage("Stranger", msg);
});

socket.on("partnerLeft", () => {
  addSystem("Stranger left the chat");
  if (statusEl) statusEl.innerText = "Partner disconnected";
});

/* ===============================
   TYPING INDICATOR
   =============================== */

messageInput?.addEventListener("input", () => {
  socket.emit("typing");
});

socket.on("typing", () => {
  if (!typingEl) return;
  typingEl.style.display = "block";
  clearTimeout(window._typingTimer);
  window._typingTimer = setTimeout(() => {
    typingEl.style.display = "none";
  }, 1000);
});

/* ===============================
   SEND MESSAGE
   =============================== */

sendBtn?.addEventListener("click", sendMessage);

messageInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;
  socket.emit("message", text);
  addMessage("You", text);
  messageInput.value = "";
}

/* ===============================
   UI HELPERS
   =============================== */

function addMessage(sender, text) {
  if (!messages) return;
  const div = document.createElement("div");
  div.className = sender === "You" ? "msg you" : "msg stranger";
  div.innerText = `${sender}: ${text}`;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function addSystem(text) {
  if (!messages) return;
  const div = document.createElement("div");
  div.className = "msg system";
  div.innerText = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

/* ===============================
   NEW CHAT / SKIP
   =============================== */

newChatBtn?.addEventListener("click", () => {
  socket.emit("skip");
  messages.innerHTML = "";
  if (statusEl) statusEl.innerText = "Finding someone...";
});

/* ===============================
   AUTO JOIN
   =============================== */

socket.emit("join");
