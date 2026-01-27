const BACKEND_URL = "https://chatzi-backend.onrender.com";

function debugOnPage(msg) {
  const el = document.getElementById("debugBox");
  if (el) el.textContent += msg + "\n";
}

console.log("✅ Chatzi script.js loaded");
debugOnPage("✅ script.js loaded");

const socket = io(BACKEND_URL, {
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 800,
  timeout: 15000,
});

const qs = new URLSearchParams(window.location.search);
const myName = qs.get("name") || "Anonymous";
const myGender = qs.get("gender") || "Other";

const statusEl = document.getElementById("status");
const chatBox = document.getElementById("chatBox");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const newBtn = document.getElementById("newBtn");

function setStatus(t) {
  if (statusEl) statusEl.textContent = t;
  debugOnPage("STATUS: " + t);
}

function addLine(label, text) {
  const div = document.createElement("div");
  div.className = "line";
  div.innerHTML = `<b>${label}:</b> ${text}`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

setStatus("Connecting...");

socket.on("connect", () => {
  setStatus("Connected ✅ Finding stranger...");
  debugOnPage("SOCKET CONNECTED: " + socket.id);
  socket.emit("find", { name: myName, gender: myGender });
});

socket.on("connect_error", (err) => {
  setStatus("Server not reachable (trying...)");
  debugOnPage("connect_error: " + (err?.message || err));
  console.log("connect_error:", err?.message || err);
});

socket.on("disconnect", (reason) => {
  setStatus("Disconnected (reconnecting...)");
  debugOnPage("disconnect: " + reason);
});

socket.on("status", (s) => {
  debugOnPage("status event: " + JSON.stringify(s));
  if (s?.state === "waiting") setStatus("Finding stranger...");
  if (s?.state === "idle") setStatus("Idle. Press New Chat.");
});

socket.on("matched", (data) => {
  debugOnPage("matched: " + JSON.stringify(data));
  const p = data?.partner;
  setStatus(`Matched ✅ (${p?.gender || "Other"})`);
  addLine("System", `Connected with ${p?.name || "Stranger"} (${p?.gender || "Other"})`);
});

socket.on("message", (m) => {
  debugOnPage("message: " + JSON.stringify(m));
  addLine(m.from || "Stranger", m.text || "");
});

socket.on("left", () => {
  debugOnPage("left event received");
  setStatus("Stranger left. Press New Chat.");
  addLine("System", "Stranger left the chat.");
});

sendBtn?.addEventListener("click", () => {
  const text = msgInput.value.trim();
  if (!text) return;
  addLine("Me", text);
  socket.emit("message", text);
  msgInput.value = "";
});

msgInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendBtn.click();
});

function newChat() {
  addLine("System", "Searching for new stranger...");
  socket.emit("skip");
  socket.emit("find", { name: myName, gender: myGender });
}

newBtn?.addEventListener("click", newChat);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") newChat();
});

// Wake backend
fetch(`${BACKEND_URL}/health`)
  .then((r) => r.text())
  .then((t) => debugOnPage("health ok: " + t))
  .catch((e) => debugOnPage("health failed: " + e));
