const socket = io("https://chatzi-backend.onrender.com");

const statusEl = document.getElementById("status");
const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const newChatBtn = document.getElementById("newChatBtn");

function addMessage(text) {
  const div = document.createElement("div");
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

sendBtn.onclick = () => {
  const msg = inputEl.value.trim();
  if (!msg) return;
  addMessage("Me: " + msg);
  socket.emit("message", msg);
  inputEl.value = "";
};

newChatBtn.onclick = () => {
  socket.emit("new_chat");
  messagesEl.innerHTML = "";
  statusEl.textContent = "Finding stranger...";
};

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    newChatBtn.click();
  }
});

socket.on("connect", () => {
  statusEl.textContent = "Connected";
});

socket.on("message", (msg) => {
  addMessage("Stranger: " + msg);
});

socket.on("status", (msg) => {
  statusEl.textContent = msg;
});

socket.emit("find");
