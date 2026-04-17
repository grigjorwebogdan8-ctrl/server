const WebSocket = require("ws");
const PORT = process.env.PORT || 10000;

const wss = new WebSocket.Server({ port: PORT }, () => {
  console.log("WS server started on port", PORT);
});

wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      console.log("New bet:", data);

      // === BROADCAST ВСЕМ КЛИЕНТАМ ===
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: "bet",
            userId: data.userId,
            username: data.username,
            amount: data.amount,
            timestamp: Date.now()
          }));
        }
      });

    } catch (e) {
      console.error("Invalid WS message:", e);
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});
