/* =========================
   Chatzi - client/script.js
   ========================= */

/* ---------- CONFIG ---------- */
// Your backend (Render) base URL:
const BACKEND_URL = "https://chatzi-backend.onrender.com";

// Socket.IO endpoint is same host:
const SOCKET_URL = BACKEND_URL;

// Health endpoint:
const HEALTH_URL = BACKEND_URL + "/health";

/* ---------- HELPERS ---------- */
function $(id) {
  return document.getElementById(id);
}

function getQueryParam(key) {
  const url = new URL(window.location.href);
  return url.searchParams.get(key) || "";
}

// Optional on-page debug box (only if <pre id="debugBox"></pre> exists)
function debugOnPage(msg) {
  const el = $("debugBox");
  if (!el) return;
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  el.textContent += line + "\n";
  el.scrollTop = el.scrollHeight;
}

function setStatus(text, kind = "info") {
  // Tries multiple possible status elements depending on your HTML versions
  const statusEl =
    $("statusText") || $("status") || $("statusBadge") || $("statusLine");

  if (!statusEl) {
    debugOnPage("⚠️ No status element found in DOM");
    return;
  }

  statusEl.textContent = text;

  // If your status element uses classes, we can set a small hint
  statusEl.dataset.kind = kind;
}

/* ---------- DOM ELEMENTS (SAFE) ---------- */
// These IDs should exist in your current chat.html.
// If any ID doesn't exist, code won't crash; it will just skip that feature.

const handleEl = $("handle"); // @anonymous
const greenDotEl = document.querySelector(".greenDot");
const overlayEl = $("overlay");
const overlayTitleEl = $("overlayTitle");
const overlaySubtitleEl = $("overlaySubtitle");
const overlaySpinnerEl = $("overlaySpinner"); // optional
const toastEl = $("toast");

const chatBoxEl = $("chatBox"); // chat messages area
const messageInputEl = $("messageInput"); // input
const sendBtnEl = $("sendBtn"); // send
const newChatBtnEl = $("newChatBtn"); // new chat
const gifBtnEl = $("gifBtn"); // GIF
const gifPanelEl = $("gifPanel"); // GIF panel container
const gifGridEl = $("gifGrid"); // GIF grid container
const onlineCountEl = $("onlineCount"); // e.g. "3286 people online now"
const typingIndicatorEl = $("typingIndicator"); // "Stranger is typing..." line

// Chips row (conversation starters)
const chipButtons = document.querySelectorAll("[data-chip]");

/* ---------- TOAST ---------- */
function showToast(text) {
  if (!toastEl) return;
  toastEl.textContent = text;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 1600);
}

/* ---------- OVERLAY ---------- */
function showOverlay(title, subtitle) {
  if (!overlayEl) return;
  overlayEl.style.display = "flex";
  if (overlayTitleEl) overlayTitleEl.textContent = title || "";
  if (overlaySubtitleEl) overlaySubtitleEl.textContent = subtitle || "";
  if (overlaySpinnerEl) overlaySpinnerEl.style.display = "inline-block";
}

function hideOverlay() {
  if (!overlayEl) return;
  overlayEl.style.display = "none";
}

/* ---------- CHAT UI ---------- */
function appendMsg(who, text, type = "me") {
  if (!chatBoxEl) return;

  const row = document.createElement("div");
  row.className = "msgRow " + type;

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  const label = document.createElement("div");
  label.className = "label";
  label.textContent = who;

  const body = document.createElement("div");
  body.className = "body";
  body.textContent = text;

  bubble.appendChild(label);
  bubble.appendChild(body);
  row.appendChild(bubble);
  chatBoxEl.appendChild(row);

  chatBoxEl.scrollTop = chatBoxEl.scrollHeight;
}

function setTyping(show) {
  if (!typingIndicatorEl) return;
  typingIndicatorEl.style.display = show ? "block" : "none";
}

/* ---------- USER INFO ---------- */
const name = getQueryParam("name") || "Anonymous";
const gender = getQueryParam("gender") || "Other";

// Set handle in top bar
if (handleEl) handleEl.textContent = "@" + name.toLowerCase().replace(/\s+/g, "");

// Initial status
setStatus("Connecting…", "info");

/* ---------- SOCKET.IO ---------- */
let socket = null;

// For typing debounce
let typingTimeout = null;
let lastTypingSentAt = 0;

function connectSocket() {
  // socket.io client must already be loaded in chat.html:
  // <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
  if (typeof io === "undefined") {
    setStatus("Socket.IO library missing", "error");
    debugOnPage("❌ io is undefined. Did you include socket.io client script?");
    return;
  }

  debugOnPage("🔌 Connecting to socket: " + SOCKET_URL);

  socket = io(SOCKET_URL, {
    transports: ["websocket", "polling"],
    withCredentials: true,
  });

  socket.on("connect", () => {
    debugOnPage("✅ socket connected: " + socket.id);
    setStatus("Connected ✅", "ok");
    if (greenDotEl) greenDotEl.style.opacity = "1";

    // Register user to server for matching
    socket.emit("join", { name, gender });
    showOverlay("Finding your match…", "Please wait while we connect you.");
  });

  socket.on("connect_error", (err) => {
    debugOnPage("❌ connect_error: " + (err?.message || err));
    setStatus("Connection error", "error");
    if (greenDotEl) greenDotEl.style.opacity = "0.4";
  });

  socket.on("disconnect", (reason) => {
    debugOnPage("⚠️ disconnected: " + reason);
    setStatus("Disconnected", "error");
    if (greenDotEl) greenDotEl.style.opacity = "0.4";
    setTyping(false);

    // Show overlay hint
    showOverlay("Disconnected", "Press New Chat to reconnect.");
  });

  // Server tells we are queued
  socket.on("queued", () => {
    debugOnPage("🕒 queued");
    setStatus("Finding stranger…", "info");
    showOverlay("Finding your match…", "Please wait while we connect you.");
  });

  // Server matched us
  socket.on("matched", (data) => {
    debugOnPage("🎯 matched: " + JSON.stringify(data || {}));
    setStatus("Connected ✅", "ok");
    hideOverlay();
    setTyping(false);

    const strangerLabel = data?.strangerName
      ? `Connected with ${data.strangerName}`
      : "Connected with a stranger";

    showToast(strangerLabel);
    appendMsg("System", "You're now connected. Say hi 👋", "system");
  });

  // Incoming message
  socket.on("message", (payload) => {
    debugOnPage("📩 msg: " + JSON.stringify(payload || {}));
    setTyping(false);

    const text = payload?.text || "";
    appendMsg("Stranger", text, "them");
  });

  // Stranger left
  socket.on("stranger_left", () => {
    debugOnPage("🚪 stranger_left");
    setStatus("Stranger left", "warn");
    setTyping(false);

    showOverlay("Stranger left the chat", "Press New Chat to find someone new.");
    appendMsg("System", "Stranger left. Press New Chat to continue.", "system");
  });

  // Online count (REAL from server)
  socket.on("online_count", (n) => {
    debugOnPage("👥 online_count: " + n);
    if (onlineCountEl) {
      const num = Number(n) || 0;
      onlineCountEl.textContent = `${num} people online now`;
    }
  });

  // Typing indicator from stranger
  socket.on("typing", () => {
    debugOnPage("⌨️ stranger typing");
    setTyping(true);

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => setTyping(false), 1200);
  });
}

/* ---------- SEND MESSAGE ---------- */
function sendMessage() {
  const text = (messageInputEl?.value || "").trim();
  if (!text) return;

  if (!socket || !socket.connected) {
    showToast("Not connected yet");
    return;
  }

  socket.emit("message", { text });
  appendMsg("Me", text, "me");
  messageInputEl.value = "";
}

/* ---------- TYPING EMIT ---------- */
function setupTypingEmit() {
  if (!messageInputEl) return;

  messageInputEl.addEventListener("input", () => {
    if (!socket || !socket.connected) return;

    // send typing max once per 500ms
    const now = Date.now();
    if (now - lastTypingSentAt < 500) return;
    lastTypingSentAt = now;

    socket.emit("typing");
    debugOnPage("🟢 typing sent");
  });
}

/* ---------- NEW CHAT / SKIP ---------- */
function newChat() {
  if (!socket || !socket.connected) {
    showToast("Reconnecting…");
    connectSocket();
    return;
  }

  setTyping(false);
  showOverlay("Finding your match…", "Skipping to a new stranger…");
  setStatus("Finding stranger…", "info");
  socket.emit("new_chat");
  debugOnPage("⏭️ new_chat emitted");
}

// ESC key to skip
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    newChat();
  }
});

/* ---------- GIF PICKER (FREE via Giphy Public API optional) ---------- */
/*
  NOTE:
  - A truly “free” GIF search needs an API key (GIPHY/Tenor).
  - If you don’t want keys right now, we’ll show a small built-in list of safe GIFs.
  - Later we can add Tenor (Google) key properly.
*/

const DEFAULT_GIFS = [
  "https://media.giphy.com/media/3o7aD2saalBwwftBIY/giphy.gif",
  "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif",
  "https://media.giphy.com/media/5GoVLqeAOo6PK/giphy.gif",
  "https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif",
  "https://media.giphy.com/media/3o6Zt481isNVuQI1l6/giphy.gif",
];

function toggleGifPanel() {
  if (!gifPanelEl) return;
  const open = gifPanelEl.style.display === "block";
  gifPanelEl.style.display = open ? "none" : "block";

  if (!open) {
    renderDefaultGifs();
  }
}

function renderDefaultGifs() {
  if (!gifGridEl) return;
  gifGridEl.innerHTML = "";

  DEFAULT_GIFS.forEach((url) => {
    const img = document.createElement("img");
    img.src = url;
    img.className = "gifThumb";
    img.alt = "gif";
    img.loading = "lazy";
    img.addEventListener("click", () => {
      // send as a message (link)
      if (!socket || !socket.connected) {
        showToast("Not connected yet");
        return;
      }
      socket.emit("message", { text: url });
      appendMsg("Me", url, "me");
      if (gifPanelEl) gifPanelEl.style.display = "none";
    });
    gifGridEl.appendChild(img);
  });
}

/* ---------- CHIP STARTERS ---------- */
chipButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const text = btn.getAttribute("data-chip") || btn.textContent.trim();
    if (!text) return;

    if (!socket || !socket.connected) {
      showToast("Not connected yet");
      return;
    }

    socket.emit("message", { text });
    appendMsg("Me", text, "me");
    showToast("Sent");
  });
});

/* ---------- BUTTON WIRES ---------- */
if (sendBtnEl) sendBtnEl.addEventListener("click", sendMessage);

if (messageInputEl) {
  messageInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

if (newChatBtnEl) newChatBtnEl.addEventListener("click", newChat);

if (gifBtnEl) gifBtnEl.addEventListener("click", toggleGifPanel);

/* ---------- HEALTH CHECK (for wake + status) ---------- */
async function pingHealth() {
  try {
    debugOnPage("🌡️ health ping: " + HEALTH_URL);
    const res = await fetch(HEALTH_URL, { method: "GET" });
    const ok = res.ok;
    debugOnPage("🌡️ health response: " + ok);
    return ok;
  } catch (e) {
    debugOnPage("🌡️ health failed: " + (e?.message || e));
    return false;
  }
}

/* ---------- INIT ---------- */
(async function init() {
  showOverlay("Waking server…", "Free hosting may take a moment on first load.");
  setTyping(false);

  // Wake server first (helps Render cold start)
  await pingHealth();

  // Connect socket
  connectSocket();

  // Setup typing emit
  setupTypingEmit();

  debugOnPage("✅ init done");
})();
