# Crash Game Server

Production-ready WebSocket + REST API server for a real-time multiplayer Crash game.

## Features

- **Real-time Multiplayer**: WebSocket connections for live game synchronization
- **REST API**: Complete API for user management, balances, stats, and admin controls
- **Database Persistence**: Supabase PostgreSQL for data storage and recovery
- **Rate Limiting**: Prevents spam and abuse
- **Security**: Input validation, sanitization, and authentication
- **Logging**: Structured logging with Winston
- **Production Ready**: Designed for Render deployment with auto-scaling

## Architecture

- **WebSocket Server**: Handles real-time game events (bets, cashouts, state updates)
- **REST API**: User management, balances, history, admin controls
- **Database**: Supabase with Row Level Security
- **Game Logic**: Server-authoritative crash point generation with house edge

## Quick Start

1. **Clone the repository**:
   ```bash
   git clone https://github.com/grigjorwebogdan8-ctrl/server.git
   cd server
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

4. **Set up database**:
   - Create Supabase project
   - Run `database_schema.sql` in Supabase SQL editor

5. **Start the server**:
   ```bash
   npm start
   ```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port | `10000` |
| `SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase anon key | `eyJ...` |
| `ADMIN_API_KEY` | Admin authentication key | `secure-random-key` |
| `ALLOWED_ORIGINS` | CORS allowed origins | `https://yourapp.com` |

## API Endpoints

### REST API

#### User Management
- `GET /api/user/:userId/balance` - Get user balance
- `POST /api/user/:userId/balance` - Update balance
- `GET /api/user/:userId/stats` - Get user stats
- `POST /api/user/:userId/stats` - Update stats
- `GET /api/user/:userId/history` - Get user history
- `POST /api/user/:userId/history` - Add history item
- `POST /api/user-init` - Initialize user

#### Betting
- `POST /api/bet/place` - Place a bet
- `POST /api/bet/cashout` - Cash out a bet

#### Admin
- `POST /api/admin/next-crash` - Set next crash point
- `GET /api/admin/users` - Get all users
- `GET /api/admin/history` - Get crash history

### WebSocket Events

#### Client → Server
- `register` - Register player
- `place_bet` - Place bet
- `cashout` - Cash out

#### Server → Client
- `sync` - Initial game state
- `crash_point` - Round crash point
- `state_update` - Game state changes
- `bets_list` - Current bets
- `online` - Online player count
- `crash` - Round ended

## Database Schema

See `database_schema.sql` for complete schema with:
- User profiles and balances
- Game statistics and history
- Current bets and rounds
- Admin overrides
- Crash history

## Deployment

See `RENDER_DEPLOYMENT.md` for complete Render deployment guide.

### Quick Deploy
1. Push to GitHub
2. Connect repository to Render
3. Set environment variables
4. Deploy!

## Game Logic

### Crash Point Algorithm
- Uses exponential distribution with 5% house edge
- Admin can override next crash point
- Deterministic but fair randomization

### Round Lifecycle
1. **Idle** → **Countdown** (5s) → **In-Progress** → **Crashed** → **Idle**
2. State persists across server restarts
3. Bets are validated server-side

### Security Features
- Rate limiting (100 req/15min general, 10 bets/min)
- Input sanitization and validation
- Admin API key authentication
- Balance validation before bets
- Server-side cashout validation

## Monitoring

- **Logs**: Winston structured logging to console and file
- **Health Check**: `GET /health`
- **Metrics**: Game events, connections, errors
- **Database**: Query performance and connection health

## Development

```bash
# Development
npm run dev

# Production
npm start

# Build (if needed)
npm run build
```

## Client Integration

Update your client configuration:

```javascript
// WebSocket
const ws = new WebSocket('wss://your-server.onrender.com');

// REST API
const api = {
  base: 'https://your-server.onrender.com/api',
  // ... endpoints
};
```

## Contributing

1. Fork the repository
2. Create feature branch
3. Add tests
4. Submit pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
- Check the logs
- Verify environment variables
- Test database connectivity
- Review Render deployment settings