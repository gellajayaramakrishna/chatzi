document.addEventListener("gesturestart", function(e){ e.preventDefault(); });

/* ===========================
   Chatzi client script
   - socket matchmaking
   - typing indicator
   - gif by URL
   - ESC skip
=========================== */

function getParam(key) {
  const u = new URL(window.location.href);
  return u.searchParams.get(key) || "";
}

const name = getParam("name") || "anonymous";
const gender = getParam("gender") || "Other";

const myHandleEl = document.getElementById("myHandle");
const onlinePill = document.getElementById("onlinePill");
const statusLine = document.getElementById("statusLine");

const chatBox = document.getElementById("chatBox");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const newChatBtn = document.getElementById("newChatBtn");

const typingLine = document.getElementById("typingLine");
const chipsRow = document.getElementById("chipsRow");

const overlay = document.getElementById("overlay");
const gifBtn = document.getElementById("gifBtn");
const gifUrl = document.getElementById("gifUrl");
const gifCancel = document.getElementById("gifCancel");
const gifSend = document.getElementById("gifSend");

myHandleEl.textContent = "@"+name;

function backendURL() {
  // Local dev
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    return "http://localhost:3000";
  }
  // Production backend on Render
  return "https://chatzi-backend.onrender.com";
}

const BACKEND = backendURL();

const socket = io(BACKEND, {
  transports: ["websocket", "polling"],
  withCredentials: true,
});

let myRoom = null;
let matched = false;
let typingTimer = null;

function setStatus(txt) {
  statusLine.textContent = txt;
}

function addMessage(side, html, meta = "") {
  const row = document.createElement("div");
  row.className = "msgRow " + side;

  const bubble = document.createElement("div");
  bubble.className = "msgBubble";
  bubble.innerHTML = html;

  row.appendChild(bubble);

  if (meta) {
    const m = document.createElement("div");
    m.className = "meta";
    m.textContent = meta;
    bubble.appendChild(m);
  }

  chatBox.appendChild(row);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function escapeHTML(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

/* ---------- Join / Match ---------- */
socket.on("connect", () => {
  setStatus("Finding stranger…");
  socket.emit("join", { name, gender });
});

socket.on("disconnect", () => {
  matched = false;
  myRoom = null;
  setStatus("Disconnected. Retrying…");
});

socket.on("online_count", (n) => {
  if (typeof n === "number") onlinePill.textContent = `${n} online`;
});

socket.on("matched", (payload) => {
  matched = true;
  myRoom = payload?.room || null;
  const partner = payload?.partnerName || "stranger";
  const partnerGender = payload?.partnerGender || "Other";

  setStatus(`Connected to @${partner} (${partnerGender}) ✅`);
  addMessage("them", `<b>Connected!</b> Say hi to your stranger.`, "");
});

socket.on("partner_left", () => {
  matched = false;
  myRoom = null;
  typingLine.style.display = "none";
  setStatus("Stranger left. Press New Chat (or Esc) to find someone else.");
  addMessage("them", `<b>Stranger left the chat.</b>`, "");
});

socket.on("message", (msg) => {
  // msg: { type, text, url, from }
  if (!msg) return;

  if (msg.type === "gif" && msg.url) {
    const safe = escapeHTML(msg.url);
    addMessage("them", `<div><img src="${safe}" alt="gif" style="max-width:260px;border-radius:12px;border:1px solid rgba(0,0,0,.08)"/></div>`);
    return;
  }

  const text = escapeHTML(msg.text || "");
  addMessage("them", text);
});

/* ---------- Typing ---------- */
socket.on("typing", () => {
  typingLine.style.display = "block";
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    typingLine.style.display = "none";
  }, 1200);
});

function emitTyping() {
  if (!socket.connected || !matched) return;
  socket.emit("typing");
}

/* ---------- Send message ---------- */
function sendText() {
  const text = (messageInput.value || "").trim();
  if (!text) return;

  if (!matched) {
    addMessage("me", escapeHTML(text), "Not connected yet");
    messageInput.value = "";
    return;
  }

  socket.emit("message", { type: "text", text });
  addMessage("me", escapeHTML(text));
  messageInput.value = "";
}

sendBtn.addEventListener("click", sendText);

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendText();
});

messageInput.addEventListener("input", () => {
  emitTyping();
});

/* ---------- Chips ---------- */
chipsRow.querySelectorAll(".chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    messageInput.value = btn.textContent.trim();
    messageInput.focus();
    emitTyping();
  });
});

/* ---------- New chat / Skip ---------- */
function newChat() {
  typingLine.style.display = "none";
  setStatus("Finding stranger…");
  socket.emit("new_chat");
}

newChatBtn.addEventListener("click", newChat);

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") newChat();
});

/* ---------- GIF modal ---------- */
gifBtn.addEventListener("click", () => {
  overlay.style.display = "flex";
  gifUrl.value = "";
  gifUrl.focus();
});

gifCancel.addEventListener("click", () => {
  overlay.style.display = "none";
});

gifSend.addEventListener("click", () => {
  const url = (gifUrl.value || "").trim();
  if (!url) return;

  if (!matched) {
    overlay.style.display = "none";
    addMessage("me", `GIF not sent (not connected).`);
    return;
  }

  // basic check
  const ok = url.includes(".gif");
  if (!ok) {
    addMessage("me", "Please paste a direct .gif URL.");
    return;
  }

  socket.emit("message", { type: "gif", url });
  addMessage("me", `<div><img src="${escapeHTML(url)}" alt="gif" style="max-width:260px;border-radius:12px;border:1px solid rgba(0,0,0,.08)"/></div>`);
  overlay.style.display = "none";
});

/* Safety button */
document.getElementById("helpBtn").addEventListener("click", () => {
  alert("Safety tips:\n\n• Don’t share phone/email/address\n• Don’t send money\n• If uncomfortable, press Esc to skip\n• Be respectful ✅");
});
