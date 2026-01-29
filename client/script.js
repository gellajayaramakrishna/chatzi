const BACKEND_URL = "https://chatzi-backend.onrender.com";

const $ = (id) => document.getElementById(id);
function qs(k){ return new URL(location.href).searchParams.get(k); }
function esc(s){
  return (s||"").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

const chatBox = $("chatBox");
const input = $("messageInput");
const sendBtn = $("sendBtn");
const newBtn = $("newChatBtn");
const handleEl = $("handle");
const statusPill = $("statusPill");

const overlay = $("overlay");
const modalTitle = $("modalTitle");
const modalSub = $("modalSub");

let socket, roomId=null, matched=false;

const myName = qs("name") || "user";
const myGender = qs("gender") || "Other";

function setStatus(t){
  if(statusPill) statusPill.textContent = t;
}

function showOverlay(t, s){
  if(!overlay) return;
  overlay.style.display="flex";
  if(modalTitle) modalTitle.textContent=t||"";
  if(modalSub) modalSub.textContent=s||"";
}
function hideOverlay(){
  if(!overlay) return;
  overlay.style.display="none";
}

function addSys(msg){
  const d=document.createElement("div");
  d.className="sys";
  d.innerHTML=esc(msg);
  chatBox.appendChild(d);
  chatBox.scrollTop=chatBox.scrollHeight;
}
function addMsg(msg, mine){
  const d=document.createElement("div");
  d.className=mine ? "msg mine" : "msg";
  d.innerHTML=esc(msg);
  chatBox.appendChild(d);
  chatBox.scrollTop=chatBox.scrollHeight;
}

function connect(){
  setStatus("Connecting…");
  showOverlay("Finding match…","Connecting to server…");

  socket = io(BACKEND_URL, {
    transports:["polling","websocket"],
    reconnection:true,
    reconnectionAttempts:30,
    timeout:20000
  });

  socket.on("connect", ()=>{
    setStatus("Online");
    if(handleEl) handleEl.textContent = "@"+myName;
    socket.emit("join",{ name: myName, gender: myGender });
  });

  socket.on("connect_error", (e)=>{
    setStatus("Offline");
    addSys("Connect error: " + (e?.message || "unknown"));
    showOverlay("Server issue","Try New Chat after a few seconds.");
  });

  socket.on("finding", ()=>{
    matched=false; roomId=null;
    setStatus("Finding…");
    showOverlay("Finding match…","Please wait…");
  });

  socket.on("matched", (data)=>{
    matched=true;
    roomId=data.roomId;
    setStatus("Connected");
    hideOverlay();
    addSys("Matched ✅ Say hi!");
  });

  socket.on("partner_left", ()=>{
    matched=false; roomId=null;
    setStatus("Finding…");
    addSys("Stranger left.");
    showOverlay("Finding match…","Searching for a new person…");
    socket.emit("join",{ name: myName, gender: myGender });
  });

  socket.on("message", (m)=>{
    addMsg(m.text, socket && m.from === socket.id);
  });

  socket.on("typing", ()=>{
    // optional; keep silent (no UI noise)
  });

  socket.on("disconnect", ()=>{
    setStatus("Connecting…");
  });
}

function send(){
  const text=(input.value||"").trim();
  if(!text) return;
  if(!socket || !socket.connected || !matched || !roomId){
    addSys("Not matched yet…");
    return;
  }
  socket.emit("message",{ roomId, text });
  input.value="";
}

function newChat(){
  if(!socket) return;
  socket.emit("skip");
}

sendBtn?.addEventListener("click", send);
input?.addEventListener("keydown", (e)=>{ if(e.key==="Enter") send(); });
newBtn?.addEventListener("click", newChat);
document.addEventListener("keydown",(e)=>{ if(e.key==="Escape") newChat(); });

connect();

/* =========================
   HARD RESET MATCH (Skip/New Chat)
   ========================= */

(function(){
  // helpers (safe even if ids differ)
  const $ = (id) => document.getElementById(id);

  // try common containers
  const messagesBox =
    $("messages") || $("chatMessages") || $("chatLog") || $("messageList") ||
    document.querySelector(".messages") || document.querySelector(".chatLog") ||
    document.querySelector('[id*="message"]') || document.querySelector('[class*="message"]');

  const statusEl =
    $("status") || $("matchStatus") ||
    document.querySelector(".status") || document.querySelector(".matchStatus");

  const overlay = $("overlay") || document.querySelector(".overlay");

  function setStatus(txt){
    if(statusEl) statusEl.textContent = txt;
  }

  function showOverlay(text){
    if(!overlay) return;
    overlay.style.display = "flex";
    const t = overlay.querySelector(".modalTitle") || overlay.querySelector("h3") || overlay.querySelector("h2");
    const p = overlay.querySelector(".modalSub") || overlay.querySelector("p");
    if(t) t.textContent = text || "Finding stranger…";
    else if(p) p.textContent = text || "Finding stranger…";
  }

  function hideOverlay(){
    if(!overlay) return;
    overlay.style.display = "none";
  }

  // This MUST exist in your file already (socket). If not, it won't break.
  const getSocket = () => (typeof socket !== "undefined" ? socket : null);

  // Clear UI
  function clearChatUI(){
    if(messagesBox) messagesBox.innerHTML = "";
    // remove duplicated "Matched ✅ Say hi!" lines if your UI adds them elsewhere
    document.querySelectorAll(".matchBanner,.matchedLine").forEach(e => e.remove());
    setStatus("Finding stranger…");
  }

  // Hard reset match
  window.hardResetMatch = function hardResetMatch(){
    clearChatUI();
    showOverlay("Finding stranger…");

    const s = getSocket();
    if(s){
      try { s.emit("leave"); } catch(e){}
      try { s.emit("skip"); } catch(e){}
      // ask server for fresh match (your backend may use one of these)
      try { s.emit("find"); } catch(e){}
      try { s.emit("findMatch"); } catch(e){}
      try { s.emit("newChat"); } catch(e){}
      try { s.emit("joinQueue"); } catch(e){}
    }

    // fallback: if server events are different, at least reconnect cleanly
    setTimeout(() => {
      const s2 = getSocket();
      if(s2 && !s2.connected){
        try { s2.connect(); } catch(e){}
      }
    }, 300);
  };

  // Wire New Chat button if present
  const newChatBtn = $("newChatBtn") || $("newChat") || document.querySelector('button[id*="newChat"]') || document.querySelector('button[class*="newChat"]');
  if(newChatBtn){
    newChatBtn.addEventListener("click", (e)=>{
      e.preventDefault();
      window.hardResetMatch();
    });
  }

  // Wire ESC to skip/reset
  document.addEventListener("keydown", (e)=>{
    if(e.key === "Escape"){
      window.hardResetMatch();
    }
  });

  // If your socket tells you when matched, hide overlay (common event names)
  const s = getSocket();
  if(s){
    const hide = ()=>{ hideOverlay(); setStatus("Matched ✅ Say hi!"); };
    ["matched","matchFound","paired","connectedToPeer"].forEach(ev=>{
      try { s.on(ev, hide); } catch(e){}
    });
    // If partner leaves, reset status
    ["partnerLeft","peerLeft","disconnectPeer"].forEach(ev=>{
      try { s.on(ev, ()=>{ setStatus("Partner left. Press New Chat."); }); } catch(e){}
    });
  }
})();
