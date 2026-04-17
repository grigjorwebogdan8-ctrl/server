const WebSocket = require("ws");

const PORT = process.env.PORT || 10000;

const wss = new WebSocket.Server({ port: PORT });

wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.type === "bet") {
      console.log("New bet:", data);

      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: "bet_update",
            user: data.user,
            amount: data.amount
          }));
        }
      });
    }
  });
});

console.log("WS server started on port " + PORT);
