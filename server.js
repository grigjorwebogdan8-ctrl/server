require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const { WebSocketServer } = WebSocket;

const PORT = process.env.PORT || 10000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map((origin) => origin.trim()).filter(Boolean);

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'server.log', level: 'info' }),
  ],
});

const app = express();
app.use(express.json());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('CORS policy violation: origin not allowed')); 
  },
  credentials: true,
}));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});

const betLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many betting requests, please slow down.' },
});

app.use('/api/', apiLimiter);

const gameState = {
  status: 'idle',
  countdown: 5.0,
  multiplier: 1.0,
  crashPoint: null,
  roundId: null,
  startTime: null,
  players: new Map(),
  currentBets: new Map(),
};

let gameLoopTimer = null;

function broadcast(message) {
  const payload = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

function sendSync(ws) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    type: 'sync',
    gameState: gameState.status,
    countdown: gameState.countdown,
    multiplier: gameState.multiplier,
    crashPoint: gameState.crashPoint,
    bets: Array.from(gameState.currentBets.values()),
    online: gameState.players.size,
  }));
}

function getActiveBets() {
  return Array.from(gameState.currentBets.values());
}

async function saveRoundState() {
  if (!gameState.roundId) return;

  const { error } = await supabase
    .from('rounds')
    .upsert({
      id: gameState.roundId,
      status: gameState.status,
      countdown: gameState.countdown,
      multiplier: gameState.multiplier,
      crash_point: gameState.crashPoint,
      start_time: gameState.startTime,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    logger.error('Failed to save round state', { error });
  }
}

async function saveBet(bet) {
  const { error } = await supabase.from('bets').insert(bet);
  if (error) {
    logger.error('Failed to save bet', { error, bet });
  }
}

async function updateBet(betId, updates) {
  const { error } = await supabase.from('bets').update(updates).eq('id', betId);
  if (error) {
    logger.error('Failed to update bet', { error, betId, updates });
  }
}

async function saveCrashHistory(crashPoint, bets) {
  const { error } = await supabase.from('crash_history').insert({
    round_id: gameState.roundId,
    crash_point: crashPoint,
    total_bets: bets.length,
    total_amount: bets.reduce((sum, bet) => sum + (bet.amount || 0), 0),
    cashed_out: bets.filter((bet) => bet.status === 'cashed_out').length,
    created_at: new Date().toISOString(),
  });

  if (error) {
    logger.error('Failed to save crash history', { error });
  }
}

function generateCrashPoint() {
  const houseEdge = 0.05;
  const rand = Math.random();
  const adjustedRand = Math.min(0.999999, rand * (1 - houseEdge));
  const lambda = 0.4;
  const rawValue = -Math.log(1 - adjustedRand) / lambda;
  return Math.max(1.01, Math.round((1 + rawValue) * 100) / 100);
}

async function ensureRoundInitialized() {
  if (gameState.roundId) return;

  gameState.roundId = `${Date.now()}`;
  gameState.startTime = new Date().toISOString();

  const { data: override, error } = await supabase
    .from('admin_overrides')
    .select('crash_point')
    .eq('active', true)
    .limit(1)
    .single();

  if (!error && override?.crash_point) {
    gameState.crashPoint = override.crash_point;
    await supabase.from('admin_overrides').update({ active: false }).eq('crash_point', override.crash_point);
  } else {
    gameState.crashPoint = generateCrashPoint();
  }

  await saveRoundState();
}

async function loadRoundState() {
  const { data, error } = await supabase
    .from('rounds')
    .select('*')
    .in('status', ['countdown', 'in-progress'])
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    logger.error('Failed to load round state', { error });
    return;
  }

  if (!data || data.length === 0) {
    logger.info('No active round to restore. Starting idle state.');
    return;
  }

  const round = data[0];
  gameState.roundId = round.id;
  gameState.status = round.status;
  gameState.countdown = parseFloat(round.countdown) || 5.0;
  gameState.multiplier = parseFloat(round.multiplier) || 1.0;
  gameState.crashPoint = parseFloat(round.crash_point) || generateCrashPoint();
  gameState.startTime = round.start_time;

  const { data: bets, error: betsError } = await supabase
    .from('bets')
    .select('*')
    .eq('round_id', gameState.roundId)
    .in('status', ['playing', 'cashed_out']);

  if (!betsError && bets) {
    bets.forEach((bet) => {
      gameState.currentBets.set(bet.id, bet);
    });
  }

  logger.info('Restored round state from database', {
    roundId: gameState.roundId,
    status: gameState.status,
    countdown: gameState.countdown,
    multiplier: gameState.multiplier,
    crashPoint: gameState.crashPoint,
    loadedBets: gameState.currentBets.size,
  });
}

async function dispatchCrashRound() {
  const bets = getActiveBets();

  for (const bet of bets) {
    if (bet.status === 'playing') {
      bet.status = 'crashed';
      bet.win_amount = 0;
      await updateBet(bet.id, { status: 'crashed', win_amount: 0 });
    }
  }

  await saveCrashHistory(gameState.crashPoint, bets);
  await saveRoundState();

  broadcast({ type: 'crash', crashPoint: gameState.crashPoint, bets });

  setTimeout(async () => {
    gameState.status = 'idle';
    gameState.multiplier = 1.0;
    gameState.countdown = 5.0;
    gameState.roundId = null;
    gameState.crashPoint = null;
    gameState.startTime = null;
    gameState.currentBets.clear();
    await saveRoundState();
  }, 3000);
}

async function tickGameLoop() {
  if (gameState.status === 'idle') {
    gameState.status = 'countdown';
    gameState.countdown = 5.0;
    gameState.multiplier = 1.0;
    gameState.currentBets.clear();
    gameState.roundId = `${Date.now()}`;
    gameState.startTime = new Date().toISOString();

    const { data: override, error } = await supabase
      .from('admin_overrides')
      .select('crash_point')
      .eq('active', true)
      .limit(1)
      .single();

    if (!error && override?.crash_point) {
      gameState.crashPoint = override.crash_point;
      await supabase.from('admin_overrides').update({ active: false }).eq('crash_point', override.crash_point);
    } else {
      gameState.crashPoint = generateCrashPoint();
    }

    await saveRoundState();

    broadcast({ type: 'crash_point', value: gameState.crashPoint });
    broadcast({ type: 'state_update', status: gameState.status, countdown: gameState.countdown, multiplier: gameState.multiplier });
    return;
  }

  if (gameState.status === 'countdown') {
    gameState.countdown = Math.max(0, gameState.countdown - 1);
    if (gameState.countdown <= 0) {
      gameState.status = 'in-progress';
      gameState.multiplier = 1.0;
    }
    await saveRoundState();
    broadcast({ type: 'state_update', status: gameState.status, countdown: gameState.countdown, multiplier: gameState.multiplier });
    return;
  }

  if (gameState.status === 'in-progress') {
    gameState.multiplier = Math.round((gameState.multiplier + 0.01 + gameState.multiplier * 0.005) * 100) / 100;
    if (gameState.multiplier >= gameState.crashPoint) {
      gameState.multiplier = gameState.crashPoint;
      gameState.status = 'crashed';
      await dispatchCrashRound();
      return;
    }
    await saveRoundState();
    broadcast({ type: 'state_update', status: gameState.status, countdown: gameState.countdown, multiplier: gameState.multiplier });
    return;
  }
}

function runGameLoop() {
  if (gameLoopTimer) return;
  gameLoopTimer = setInterval(() => {
    tickGameLoop().catch((error) => logger.error('Game loop error', { error }));
  }, 1000);
}

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws, req) => {
  logger.info('WebSocket connected', { ip: req.socket.remoteAddress });

  sendSync(ws);

  ws.on('message', async (rawMessage) => {
    try {
      const message = JSON.parse(rawMessage.toString());

      if (message.type === 'register') {
        const userId = String(message.userId);
        const username = typeof message.username === 'string' ? message.username.substring(0, 50) : 'Anonymous';
        const avatar = typeof message.avatar === 'string' ? message.avatar.substring(0, 500) : null;

        ws.userId = userId;
        gameState.players.set(userId, { userId, username, avatar, connectedAt: new Date().toISOString() });
        broadcast({ type: 'online', count: gameState.players.size });
        sendSync(ws);
        return;
      }

      if (message.type === 'place_bet' || message.type === 'bet') {
        const bet = gameState.currentBets.get(message.betId);
        if (bet) {
          broadcast({ type: 'bets_list', list: getActiveBets() });
        }
        return;
      }

      if (message.type === 'cashout') {
        const bet = gameState.currentBets.get(message.betId);
        if (bet) {
          broadcast({ type: 'bets_list', list: getActiveBets() });
        }
        return;
      }
    } catch (error) {
      logger.error('Invalid WebSocket message', { error, rawMessage: rawMessage.toString() });
    }
  });

  ws.on('close', () => {
    logger.info('WebSocket disconnected');
    if (ws.userId) {
      gameState.players.delete(ws.userId);
      broadcast({ type: 'online', count: gameState.players.size });
    }
  });

  ws.on('error', (error) => {
    logger.error('WebSocket error', { error });
  });
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.post('/api/user-init', async (req, res) => {
  try {
    const { id, first_name, username } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const now = new Date().toISOString();

    const { error } = await supabase.from('user_profiles').upsert({
      user_id: String(id),
      first_name: first_name || null,
      username: username || null,
      joined_at: now,
      last_seen: now,
    });

    if (error) {
      logger.error('User init error', { error });
      return res.status(500).json({ error: 'Database error' });
    }

    await supabase.from('user_balances').upsert({ user_id: String(id), balance: 0 });
    await supabase.from('user_stats').upsert({ user_id: String(id), games: 0, wins: 0, max_multiplier: 0, total_bet: 0 });

    res.json({ ok: true });
  } catch (error) {
    logger.error('User init catch error', { error });
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/user/:userId/balance', async (req, res) => {
  try {
    const userId = String(req.params.userId);
    const { data, error } = await supabase.from('user_balances').select('balance').eq('user_id', userId).single();
    if (error && error.code !== 'PGRST116') {
      logger.error('Balance query error', { error, userId });
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ balance: data?.balance ?? 0 });
  } catch (error) {
    logger.error('Balance error', { error });
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/user/:userId/balance', async (req, res) => {
  try {
    const userId = String(req.params.userId);
    const balance = parseFloat(req.body.balance);
    if (isNaN(balance) || balance < 0) {
      return res.status(400).json({ error: 'Invalid balance' });
    }

    const { error } = await supabase.from('user_balances').upsert({ user_id: userId, balance });
    if (error) {
      logger.error('Balance update error', { error, userId, balance });
      return res.status(500).json({ error: 'Database error' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Balance update exception', { error });
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/user/:userId/stats', async (req, res) => {
  try {
    const userId = String(req.params.userId);
    const { data, error } = await supabase.from('user_stats').select('*').eq('user_id', userId).single();
    if (error && error.code !== 'PGRST116') {
      logger.error('Stats query error', { error, userId });
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(data || { games: 0, wins: 0, max_multiplier: 0, total_bet: 0 });
  } catch (error) {
    logger.error('Stats error', { error });
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/user/:userId/stats', async (req, res) => {
  try {
    const userId = String(req.params.userId);
    const stats = req.body;
    const { error } = await supabase.from('user_stats').upsert({ user_id: userId, ...stats });
    if (error) {
      logger.error('Stats update error', { error, userId, stats });
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ success: true });
  } catch (error) {
    logger.error('Stats update exception', { error });
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/user/:userId/history', async (req, res) => {
  try {
    const userId = String(req.params.userId);
    const { data, error } = await supabase
      .from('user_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      logger.error('History query error', { error, userId });
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(data || []);
  } catch (error) {
    logger.error('History error', { error });
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/user/:userId/history', async (req, res) => {
  try {
    const userId = String(req.params.userId);
    const item = { user_id: userId, ...req.body };
    const { error } = await supabase.from('user_history').insert(item);
    if (error) {
      logger.error('Add history error', { error, userId, item });
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ success: true });
  } catch (error) {
    logger.error('Add history exception', { error });
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/bet/place', betLimiter, async (req, res) => {
  try {
    const { userId, amount, game, data } = req.body;
    if (!userId || typeof amount !== 'number' || game !== 'crash') {
      return res.status(400).json({ error: 'Invalid data' });
    }

    if (gameState.status !== 'idle' && gameState.status !== 'countdown') {
      return res.status(400).json({ error: 'Betting window closed' });
    }

    await ensureRoundInitialized();

    const normalizedUserId = String(userId);
    const { data: balanceData, error: balanceError } = await supabase
      .from('user_balances')
      .select('balance')
      .eq('user_id', normalizedUserId)
      .single();

    if (balanceError || !balanceData || balanceData.balance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const { error: deductError } = await supabase
      .from('user_balances')
      .update({ balance: balanceData.balance - amount })
      .eq('user_id', normalizedUserId);

    if (deductError) {
      return res.status(500).json({ error: 'Failed to deduct balance' });
    }

    const username = typeof data?.username === 'string' ? data.username.substring(0, 50) : 'Anonymous';
    const betId = `${normalizedUserId}_${Date.now()}`;
    const bet = {
      id: betId,
      user_id: normalizedUserId,
      username,
      amount,
      status: 'playing',
      round_id: gameState.roundId,
      multiplier: null,
      win_amount: 0,
      placed_at: new Date().toISOString(),
    };

    gameState.currentBets.set(betId, bet);
    await saveBet(bet);

    broadcast({ type: 'bets_list', list: getActiveBets() });
    res.json({ success: true, betId });
  } catch (error) {
    logger.error('Place bet error', { error, body: req.body });
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/bet/cashout', async (req, res) => {
  try {
    const { userId, betId, winAmount } = req.body;
    if (!userId || !betId || typeof winAmount !== 'number') {
      return res.status(400).json({ error: 'Invalid data' });
    }

    const bet = gameState.currentBets.get(betId);
    if (!bet || bet.user_id !== String(userId) || bet.status !== 'playing') {
      return res.status(400).json({ error: 'Invalid bet' });
    }

    if (gameState.status !== 'in-progress') {
      return res.status(400).json({ error: 'Cannot cashout now' });
    }

    const calculatedWin = Math.round((bet.amount * gameState.multiplier) * 100) / 100;
    if (Math.abs(winAmount - calculatedWin) > 0.02) {
      return res.status(400).json({ error: 'Invalid win amount' });
    }

    const { data: balanceData, error: balanceError } = await supabase
      .from('user_balances')
      .select('balance')
      .eq('user_id', String(userId))
      .single();

    if (balanceError || !balanceData) {
      return res.status(400).json({ error: 'User not found' });
    }

    await supabase
      .from('user_balances')
      .update({ balance: balanceData.balance + winAmount })
      .eq('user_id', String(userId));

    bet.status = 'cashed_out';
    bet.multiplier = gameState.multiplier;
    bet.win_amount = winAmount;
    bet.cashed_at = new Date().toISOString();
    await updateBet(betId, {
      status: 'cashed_out',
      multiplier: bet.multiplier,
      win_amount: winAmount,
      cashed_at: bet.cashed_at,
    });

    broadcast({ type: 'bets_list', list: getActiveBets() });
    res.json({ success: true, win: winAmount });
  } catch (error) {
    logger.error('Cashout error', { error, body: req.body });
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/topup/stars', async (req, res) => {
  try {
    const { userId, amount } = req.body;
    if (!userId || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'Invalid top-up data' });
    }
    const normalizedUserId = String(userId);
    const { data, error } = await supabase.from('user_balances').select('balance').eq('user_id', normalizedUserId).single();
    if (error) return res.status(500).json({ error: 'Database error' });
    const newBalance = (data?.balance || 0) + amount;
    const { error: updateError } = await supabase.from('user_balances').upsert({ user_id: normalizedUserId, balance: newBalance });
    if (updateError) return res.status(500).json({ error: 'Failed to top up balance' });
    res.json({ success: true, balance: newBalance });
  } catch (error) {
    logger.error('Top up stars error', { error, body: req.body });
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/topup/ton', async (req, res) => {
  try {
    const { userId, amount } = req.body;
    if (!userId || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'Invalid top-up data' });
    }
    const normalizedUserId = String(userId);
    const { data, error } = await supabase.from('user_balances').select('balance').eq('user_id', normalizedUserId).single();
    if (error) return res.status(500).json({ error: 'Database error' });
    const newBalance = (data?.balance || 0) + amount;
    const { error: updateError } = await supabase.from('user_balances').upsert({ user_id: normalizedUserId, balance: newBalance });
    if (updateError) return res.status(500).json({ error: 'Failed to top up balance' });
    res.json({ success: true, balance: newBalance });
  } catch (error) {
    logger.error('Top up TON error', { error, body: req.body });
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/game/crash-point', async (req, res) => {
  try {
    res.json({ crashPoint: gameState.crashPoint || 2.0, forced: false, status: gameState.status });
  } catch (error) {
    logger.error('Crash point error', { error });
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/next-crash', async (req, res) => {
  try {
    const apiKey = req.headers.authorization?.replace('Bearer ', '');
    if (apiKey !== ADMIN_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const multiplier = parseFloat(req.body.multiplier);
    if (Number.isNaN(multiplier) || multiplier < 1.01) {
      return res.status(400).json({ error: 'Invalid multiplier' });
    }
    const { error } = await supabase.from('admin_overrides').upsert({ crash_point: multiplier, active: true });
    if (error) {
      logger.error('Admin next crash error', { error });
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ success: true, multiplier });
  } catch (error) {
    logger.error('Admin next crash exception', { error });
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    const apiKey = req.headers.authorization?.replace('Bearer ', '');
    if (apiKey !== ADMIN_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { data, error } = await supabase.from('user_balances').select(`
      user_id,
      balance,
      user_stats (
        games,
        wins,
        max_multiplier,
        total_bet
      )
    `);
    if (error) {
      logger.error('Admin users error', { error });
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(data || []);
  } catch (error) {
    logger.error('Admin users exception', { error });
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/history', async (req, res) => {
  try {
    const apiKey = req.headers.authorization?.replace('Bearer ', '');
    if (apiKey !== ADMIN_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { data, error } = await supabase
      .from('crash_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      logger.error('Admin history error', { error });
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(data || []);
  } catch (error) {
    logger.error('Admin history exception', { error });
    res.status(500).json({ error: 'Server error' });
  }
});

app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err });
  res.status(500).json({ error: 'Server error' });
});

server.listen(PORT, async () => {
  logger.info(`Server listening on port ${PORT}`);
  await loadRoundState();
  runGameLoop();
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down');
  clearInterval(gameLoopTimer);
  await saveRoundState();
  server.close(() => process.exit(0));
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down');
  clearInterval(gameLoopTimer);
  await saveRoundState();
  server.close(() => process.exit(0));
});
