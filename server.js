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

// === ЛОГИКА КРАША ===
let roundActive = false;
let crashPoint = null;

// Генерация краша
function generateCrashPoint() {
  // классическая формула crash
  const r = Math.random();
  return Math.max(1.01, 1 / (1 - r));
}

// Запуск раунда
function startRound() {
  if (roundActive) return;

  roundActive = true;
  crashPoint = generateCrashPoint();

  console.log("ROUND STARTED. Crash =", crashPoint.toFixed(2));

  // Рассылаем crash_point всем игрокам
  broadcast({
    type: "crash_point",
    value: crashPoint,
    timestamp: Date.now(),
  });

  // Завершаем раунд через 100мс
  setTimeout(() => {
    roundActive = false;
    crashPoint = null;

    broadcast({
      type: "round_end",
    });

    console.log("ROUND ENDED");
  }, 100);
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

        // Рассылаем ставку всем
        broadcast({
          type: "bet",
          userId: data.userId,
          username: data.username,
          avatar: data.avatar || null,
          amount: data.amount,
          timestamp: Date.now(),
        });

        // Если это первая ставка → запускаем раунд
        if (!roundActive) {
          startRound();
        }
      }

    } catch (e) {
      console.error("Invalid WS message:", e);
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");

    broadcast({
      type: "online",
      count: wss.clients.size,
    });
  });
});
