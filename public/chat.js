const socket = io();

const messagesEl = document.getElementById("messages");
const form = document.getElementById("form");
const input = document.getElementById("input");
const sendBtn = document.getElementById("sendBtn");
const findBtn = document.getElementById("findBtn");
const nextBtn = document.getElementById("nextBtn");
const blockBtn = document.getElementById("blockBtn");
const reportBtn = document.getElementById("reportBtn");
const typingLine = document.getElementById("typingLine");

const ADJ = ["spare","obedient","curious","chill","bold","gentle","mystic","brave","sleepy","happy","quiet","sunny","clever","kind","wild","calm","shy"];
const COLOR = ["gray","amethyst","violet","indigo","lavender","plum","orchid","rose","pearl","silver","amber","jade","azure"];
const ANIMAL = ["lungfish","puffin","panda","otter","fox","wolf","tiger","koala","eagle","dolphin","lion","cat","owl","deer","rabbit","monkey"];
const rand = (arr) => arr[Math.floor(Math.random()*arr.length)];
const genName = () => `${rand(ADJ)}_${rand(COLOR)}_${rand(ANIMAL)}`;

function ensureName(){
  let n = (localStorage.getItem("cm_name") || "").trim();
  if (!n) {
    n = genName();
    localStorage.setItem("cm_name", n);
  }
  return n;
}

const gender = (localStorage.getItem("cm_gender") || "").trim();
if (!gender) location.href = "/gender";

const interests = (() => {
  try { return JSON.parse(localStorage.getItem("cm_interests") || "[]"); }
  catch { return []; }
})();

const name = ensureName();
document.getElementById("who").textContent = `@${name}`;

// send profile to server (used for interest matching + optional partner name)
socket.emit("profile", { name, gender, interests });

socket.on("onlineCount", (p) => {
  document.getElementById("online").textContent = p?.count ?? 0;
});

let paired = false;

function clearChat(){ messagesEl.innerHTML = ""; }
function addBubble(kind, text){
  const div = document.createElement("div");
  div.className = `bubble ${kind}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setControls(isPaired){
  paired = isPaired;
  input.disabled = !paired;
  sendBtn.disabled = !paired;

  nextBtn.disabled = false;
  blockBtn.disabled = !paired;
  reportBtn.disabled = !paired;

  typingLine.style.display = "none";
}

socket.on("partner", (p) => {
  // optional: you can show it somewhere later if you want
});

socket.on("paired", (p) => {
  const isPaired = !!p?.paired;
  setControls(isPaired);

  if (isPaired) {
    clearChat();
    addBubble("system", "Connected! Say hi 👋");
    input.focus();
  } else {
    input.value = "";
  }
});

socket.on("typing", (p) => {
  if (!paired) return;
  typingLine.style.display = p?.typing ? "block" : "none";
});

socket.on("system", (p) => { if (p?.msg) addBubble("system", p.msg); });
socket.on("message", (p) => { if (p?.msg) addBubble("them", p.msg); });

document.getElementById("chips").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  if (paired) input.value = chip.textContent.trim();
  input.focus();
});

function startFind(){
  clearChat();
  setControls(false);
  addBubble("system", "Searching for a stranger...");
  socket.emit("find");
}

function doNext(){
  clearChat();
  setControls(false);
  addBubble("system", "Finding a new stranger...");
  socket.emit("next");
}

findBtn.addEventListener("click", startFind);
nextBtn.addEventListener("click", doNext);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    doNext();
  }
});

// ---- Typing indicator (debounced) ----
let typingOn = false;
let typingTimer = null;

function setTyping(on){
  if (!paired) return;
  if (typingOn === on) return;
  typingOn = on;
  socket.emit("typing", { typing: on });
}

input.addEventListener("input", () => {
  if (!paired) return;

  setTyping(true);
  if (typingTimer) clearTimeout(typingTimer);
  typingTimer = setTimeout(() => setTyping(false), 900);
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const msg = input.value.trim();
  if (!msg) return;

  setTyping(false);
  addBubble("me", msg);
  socket.emit("message", { msg });
  input.value = "";
});

// ---- Block / Report ----
blockBtn.addEventListener("click", () => {
  if (!paired) return;
  if (!confirm("Block this user? You won’t be matched with them again (this session).")) return;
  socket.emit("block");
  doNext();
});

reportBtn.addEventListener("click", () => {
  if (!paired) return;
  const reason = prompt("Report reason (spam / abuse / scam / etc.)", "spam");
  if (!reason) return;
  socket.emit("report", { reason });
  doNext();
});

// ✅ auto start
startFind();
