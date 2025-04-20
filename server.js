const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const streamers = {}; // streamId -> socketId

// --- COTURN SETUP GUIDE ---
// 1. Install coturn on your server (e.g., Ubuntu: sudo apt install coturn).
// 2. Edit /etc/turnserver.conf:
//    - Set listening-port=3478
//    - Set fingerprint
//    - Set realm (e.g., realm=yourdomain.com)
//    - Set user=turnuser:turnpassword
//    - Optionally set external-ip if behind NAT
// 3. Start coturn: sudo service coturn start
// 4. Make sure port 3478 (UDP/TCP) is open in your firewall.
// 5. In the ICE config below, set the TURN server IP, username, and password to match your coturn config.

// 1) serve static client
app.use(express.static(path.join(__dirname, "public")));

// 2) expose ICE server config (STUN + your TURN)
app.get("/turn", (req, res) => {
  res.json({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      {
        urls: "turn:20.243.200.64:3478",
        username: "turnuser",
        credential: "turnpassword"
      }
    ]
  });
});

// 3) signaling
io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("join-stream", ({ streamId, isStreamer }) => {
    socket.join(streamId);
    if (isStreamer) {
      streamers[streamId] = socket.id;
      console.log(`Streamer joined: ${streamId}`);
    } else {
      const streamerId = streamers[streamId];
      if (streamerId) {
        io.to(streamerId).emit("viewer-joined", { viewerId: socket.id });
      }
    }
  });

  socket.on("signal", ({ to, data }) => {
    io.to(to).emit("signal", { from: socket.id, data });
  });

  socket.on("chat-message", ({ streamId, message, sender }) => {
    io.to(streamId).emit("chat-message", { sender, message });
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
    for (const [streamId, id] of Object.entries(streamers)) {
      if (id === socket.id) delete streamers[streamId];
    }
  });
});

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
