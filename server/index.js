const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET","POST"]
  }
});

let waiting = [];

app.get("/", (req,res)=>res.send("Chatzi backend running"));
app.get("/health", (req,res)=>res.json({ ok:true }));

io.on("connection", socket => {

  socket.on("join", data => {
    // Remove stale entry
    waiting = waiting.filter(u => u.id !== socket.id);

    const user = {
      id: socket.id,
      gender: data.gender
    };

    // Find match
    const matchIndex = waiting.findIndex(u =>
      u.gender !== user.gender ||
      u.gender === "Other" ||
      user.gender === "Other"
    );

    if(matchIndex !== -1){
      const match = waiting.splice(matchIndex,1)[0];
      io.to(match.id).emit("matched", socket.id);
      io.to(socket.id).emit("matched", match.id);
    } else {
      waiting.push(user);
    }
  });

  socket.on("disconnect", () => {
    waiting = waiting.filter(u => u.id !== socket.id);
  });
});

server.listen(3000, () =>
  console.log("Chatzi server running on 3000")
);
