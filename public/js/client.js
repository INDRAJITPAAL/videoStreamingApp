const socket = io();
const streamId = "room123";
let localStream, isStreamer, config, peerConnections = {};

// 1) fetch STUN/TURN config
fetch("/turn")
  .then(r => r.json())
  .then(cfg => config = cfg)
  .catch(() => {
    // fallback if /turn fails
    config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
  });

// 2) streamer flow
function startStreamer() {
  isStreamer = true;
  navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
      localStream = stream;
      document.getElementById("localVideo").srcObject = stream;
      socket.emit("join-stream", { streamId, isStreamer: true });

      socket.on("viewer-joined", ({ viewerId }) => {
        const pc = new RTCPeerConnection(config);
        peerConnections[viewerId] = pc;
        localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

        pc.onicecandidate = e => {
          if (e.candidate)
            socket.emit("signal", { to: viewerId, data: { candidate: e.candidate } });
        };

        pc.createOffer()
          .then(offer => pc.setLocalDescription(offer))
          .then(() => {
            socket.emit("signal", { to: viewerId, data: { sdp: pc.localDescription } });
          });
      });

      socket.on("signal", ({ from, data }) => {
        const pc = peerConnections[from];
        if (data.sdp && data.sdp.type === "answer") {
          pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        }
        if (data.candidate) {
          pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      });
    })
    .catch(console.error);
}

// 3) viewer flow
function joinViewer() {
  isStreamer = false;
  const pc = new RTCPeerConnection(config);

  pc.ontrack = e => {
    document.getElementById("remoteVideo").srcObject = e.streams[0];
  };

  pc.onicecandidate = e => {
    if (e.candidate && pc.remoteDescription) {
      socket.emit("signal", { to: streamerId, data: { candidate: e.candidate } });
    }
  };

  let streamerId = null;
  socket.emit("join-stream", { streamId, isStreamer: false });

  socket.on("signal", async ({ from, data }) => {
    streamerId = from;
    if (data.sdp && data.sdp.type === "offer") {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("signal", { to: from, data: { sdp: pc.localDescription } });
    }
    if (data.candidate) {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  });
}

// 4) chat
document.getElementById("chat-input").addEventListener("keypress", e => {
  if (e.key === "Enter") {
    const msg = e.target.value;
    socket.emit("chat-message", { streamId, message: msg, sender: isStreamer ? "Streamer" : "Viewer" });
    e.target.value = "";
  }
});
socket.on("chat-message", ({ sender, message }) => {
  const box = document.getElementById("chat-box");
  box.innerHTML += `<p><b>${sender}</b>: ${message}</p>`;
  box.scrollTop = box.scrollHeight;
});
