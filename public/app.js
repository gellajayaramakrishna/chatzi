const socket = io();

const messagesEl = document.getElementById("messages");
const form = document.getElementById("form");
const input = document.getElementById("input");
const sendBtn = document.getElementById("sendBtn");
const findBtn = document.getElementById("findBtn");
const nextBtn = document.getElementById("nextBtn");
const statusEl = document.getElementById("status");
document.getElementById("year").textContent = new Date().getFullYear();

let paired = false;

function setStatus(text) {
  statusEl.textContent = text;
}

function clearChat() {
  messagesEl.innerHTML = "";
}

function addBubble(kind, text) {
  const div = document.createElement("div");
  div.className = `bubble ${kind}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setPaired(isPaired) {
  paired = isPaired;
  input.disabled = !paired;
  sendBtn.disabled = !paired;
  nextBtn.disabled = false;

  if (paired) {
    clearChat(); // ✅ clear old chat on new connection
    setStatus("Connected");
    addBubble("system", "Connected! Say hi 👋");
  } else {
    setStatus("Idle");
    input.value = "";
    input.disabled = true;
    sendBtn.disabled = true;
  }
}

socket.on("system", (payload) => {
  if (payload?.msg) addBubble("system", payload.msg);
});

socket.on("paired", (payload) => {
  setPaired(!!payload?.paired);
});

socket.on("message", (payload) => {
  if (payload?.msg) addBubble("them", payload.msg);
});

findBtn.addEventListener("click", () => {
  clearChat(); // ✅ clear when starting search
  addBubble("system", "Searching for a stranger...");
  setStatus("Finding...");
  socket.emit("find");
});

nextBtn.addEventListener("click", () => {
  clearChat(); // ✅ clear when skipping
  addBubble("system", "Finding a new stranger...");
  setStatus("Finding...");
  input.value = "";
  input.disabled = true;
  sendBtn.disabled = true;
  socket.emit("next");
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const msg = input.value.trim();
  if (!msg) return;

  addBubble("me", msg);
  socket.emit("message", { msg });
  input.value = "";
});
