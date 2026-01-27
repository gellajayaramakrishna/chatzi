const BACKEND_URL = "https://chatzi-backend.onrender.com";

const socket = io(BACKEND_URL, {
  transports: ["websocket", "polling"], // key fix
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
  socket.emit("find", { name: myName, gender: myGender });
});

socket.on("connect_error", (err) => {
  setStatus("Server not reachable (trying...)");
  console.log("connect_error:", err?.message || err);
});

socket.on("disconnect", () => {
  setStatus("Disconnected (reconnecting...)");
});

socket.on("status", (s) => {
  if (s?.state === "waiting") setStatus("Finding stranger...");
  if (s?.state === "idle") setStatus("Idle. Press New Chat.");
});

socket.on("matched", (data) => {
  const p = data?.partner;
  setStatus(`Matched ✅ (${p?.gender || "Other"})`);
  addLine("System", `Connected with ${p?.name || "Stranger"} (${p?.gender || "Other"})`);
});

socket.on("message", (m) => {
  addLine(m.from || "Stranger", m.text || "");
});

socket.on("left", () => {
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

// ESC to skip
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") newChat();
});

// Wake backend (avoid sleep delays + show real issue if blocked)
fetch(`${BACKEND_URL}/health`).catch(()=>{});
