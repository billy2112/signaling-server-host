const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = process.env.SIGNALING_PORT || 8080;

const server = http.createServer();
const wss = new WebSocketServer({ server });

const rooms = new Map();

const sendJson = (client, payload) => {
  if (!client || client.readyState !== client.OPEN) return;
  client.send(JSON.stringify(payload));
};

const broadcastRoom = (roomId, payload, exceptClient = null) => {
  const clients = rooms.get(roomId) || [];
  clients.forEach((client) => {
    if (client === exceptClient) return;
    sendJson(client, payload);
  });
};

const removeClientFromRoom = (client) => {
  if (!client.roomId) return;
  const clients = rooms.get(client.roomId) || [];
  const updated = clients.filter((item) => item !== client);
  if (updated.length === 0) {
    rooms.delete(client.roomId);
  } else {
    rooms.set(client.roomId, updated);
  }
  broadcastRoom(client.roomId, { type: "peer-left" }, client);
};

wss.on("connection", (ws) => {
  ws.on("message", (message) => {
    let payload;
    try {
      payload = JSON.parse(message.toString());
    } catch (error) {
      return;
    }

    if (payload.type === "join") {
      const roomId = payload.roomId;
      if (!roomId) return;
      const clients = rooms.get(roomId) || [];

      ws.roomId = roomId;
      ws.userId = payload.userId || null;

      const role = clients.length === 0 ? "initiator" : "receiver";
      const updated = [...clients, ws].slice(0, 2);
      rooms.set(roomId, updated);

      sendJson(ws, { type: "joined", role });

      if (updated.length === 2) {
        broadcastRoom(roomId, { type: "ready" });
      }
      return;
    }

    if (!ws.roomId) return;
    if (["offer", "answer", "ice", "leave"].includes(payload.type)) {
      if (payload.type === "leave") {
        removeClientFromRoom(ws);
        return;
      }
      broadcastRoom(ws.roomId, payload, ws);
    }
  });

  ws.on("close", () => {
    removeClientFromRoom(ws);
  });
});

server.listen(PORT, () => {
  console.log(`Signaling server running on ws://localhost:${PORT}`);
});
