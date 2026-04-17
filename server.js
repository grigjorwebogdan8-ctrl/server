const WebSocket = require("ws");
const PORT = process.env.PORT || 10000;

const wss = new WebSocket.Server({ port: PORT }, () => {
  console.log("WS server started on port", PORT);
});

// Хранилище игроков
let players = {};

// Хранилище ставок текущего раунда
let roundBets = [];

// Универсальная рассылка
function broadcast(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// Генерация краша
function generateCrashPoint() {
  const r = Math.random();
  return Math.max(1.01, 1 / (1 - r));
}

let roundActive = false;

function startRound() {
  if (roundActive) return;
  roundActive = true;

  const crashPoint = generateCrashPoint();
  console.log("ROUND STARTED. Crash =", crashPoint.toFixed(2));

  // отправляем crash_point
  broadcast({
    type: "crash_point",
    value: crashPoint,
    timestamp: Date.now(),
  });

  // очищаем ставки после старта
  setTimeout(() => {
    roundActive = false;
    roundBets = [];

    broadcast({
      type: "bets_list",
      list: [],
    });

    broadcast({ type: "round_end" });
  }, 100);
}

wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

      // === РЕГИСТРАЦИЯ ИГРОКА ===
      if (data.type === "register") {
        players[data.userId] = {
          id: data.userId,
          username: data.username,
          avatar: data.avatar || null,
          lastSeen: Date.now(),
        };

        broadcast({
          type: "players",
          list: Object.values(players),
        });
      }

      // === СТАВКА ===
      if (data.type === "bet") {
        // обновляем игрока
        players[data.userId] = {
          id: data.userId,
          username: data.username,
          avatar: data.avatar || null,
          lastSeen: Date.now(),
        };

        // сохраняем ставку
        const bet = {
          id: Date.now().toString(),
          userId: data.userId,
          username: data.username,
          avatar: data.avatar || null,
          amount: data.amount,
          status: "playing",
        };

        roundBets.unshift(bet);

        // рассылаем обновлённый список ставок
        broadcast({
          type: "bets_list",
          list: roundBets,
        });

        // запускаем раунд, если он ещё не идёт
        if (!roundActive) startRound();
      }

    } catch (e) {
      console.error("Invalid WS message:", e);
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});
