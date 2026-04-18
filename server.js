const WebSocket = require("ws");
const PORT = process.env.PORT || 10000;

const wss = new WebSocket.Server({ port: PORT }, () => {
  console.log("WS server started on port", PORT);
});

// Хранилище игроков
let players = {};

// Хранилище ставок текущего раунда
let roundBets = [];

// Текущий множитель
let currentMultiplier = 1.00;
let roundInterval;

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

  currentMultiplier = 1.00;

  broadcast({ type: "round_start" });

  roundInterval = setInterval(() => {
    currentMultiplier += 0.01;
    broadcast({
      type: "multiplier_update",
      value: parseFloat(currentMultiplier.toFixed(2))
    });

    if (currentMultiplier >= crashPoint) {
      clearInterval(roundInterval);
      roundActive = false;

      // Обработка ставок при краше
      roundBets.forEach(bet => {
        if (bet.status === "playing") {
          bet.status = "crashed";
        }
      });

      broadcast({
        type: "bets_list",
        list: roundBets
      });

      broadcast({ type: "round_end", crash: true });

      roundBets = [];
    }
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

      // === CASHOUT ===
      if (data.type === "cashout") {
        const bet = roundBets.find(b => b.userId === data.userId && b.status === "playing");
        if (bet) {
          bet.status = "cashed_out";
          bet.amount_won = bet.amount * currentMultiplier;
          broadcast({
            type: "bets_list",
            list: roundBets,
          });
        }
      }

    } catch (e) {
      console.error("Invalid WS message:", e);
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});
