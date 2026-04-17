const http = require("http");
const WebSocket = require("ws");

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("WebSocket server is running");
});

const wss = new WebSocket.Server({ noServer: true });

wss.on("connection", (ws) => {
  console.log("Client connected");
  ws.send("Hello from WS");

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    // === Обработка ставки ===
    if (data.type === "bet") {
      console.log("New bet:", data);

      // Рассылка всем игрокам
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

server.on("upgrade", (req, socket, head) => {
  if (req.url === "/ws") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log("WS server started on port " + PORT);
});
