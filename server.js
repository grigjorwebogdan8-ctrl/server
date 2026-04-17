const WebSocket = require("ws");
const PORT = process.env.PORT || 10000;

const wss = new WebSocket.Server({ port: PORT }, () => {
  console.log("WS server started on port", PORT);
});

// Универсальная функция рассылки
function broadcast(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

wss.on("connection", (ws) => {
  console.log("Client connected");

  // Отправляем реальный онлайн всем
  broadcast({
    type: "online",
    count: wss.clients.size,
  });

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      console.log("New message:", data);

      // === СТАВКА ===
      if (data.type === "bet") {
        console.log("New bet:", data);

        broadcast({
          type: "bet",
          userId: data.userId,
          username: data.username,
          avatar: data.avatar || null, // аватар игрока
          amount: data.amount,
          timestamp: Date.now(),
        });
      }

      // === СИНХРОНИЗАЦИЯ КРАША (если понадобится) ===
      if (data.type === "crash_point") {
        broadcast({
          type: "crash_point",
          value: data.value,
          timestamp: Date.now(),
        });
      }

    } catch (e) {
      console.error("Invalid WS message:", e);
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");

    // Обновляем онлайн
    broadcast({
      type: "online",
      count: wss.clients.size,
    });
  });
});
