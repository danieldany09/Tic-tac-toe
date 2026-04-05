# Multiplayer Tic-Tac-Toe

A real-time, server-authoritative multiplayer Tic-Tac-Toe game built with **Nakama** game server and a **React** frontend.

## Live Demo

| Resource | URL |
|----------|-----|
| **Play the Game** | [tic-tac-toe-zeta-roan.vercel.app](https://tic-tac-toe-zeta-roan.vercel.app/) |
| **Nakama Server** | `https://tictactoe-nakama1.duckdns.org` (AWS EC2 - `13.51.86.220`) |
| **Source Code** | [github.com/danieldany09/Tic-tac-toe](https://github.com/danieldany09/Tic-tac-toe) |

> **Note:** The Nakama server is an API endpoint, not a website. Opening it directly in a browser returns `{"error":"missing token","code":16}` — this confirms the server is **live and running**. The endpoint is consumed programmatically by the React frontend via the nakama-js SDK (HTTP + WebSocket).

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend Runtime | Nakama | 3.21.1 |
| Backend Language | TypeScript | 5.4.5 |
| Backend Bundler | esbuild | 0.20.2 |
| Database | PostgreSQL | 16 |
| Frontend Framework | React | 18.2.0 |
| Frontend Bundler | Vite | 5.2.0 |
| Nakama JS SDK | nakama-js | 2.7.0 |
| Containerization | Docker Compose | 2.20+ |
| Frontend Hosting | Vercel | - |
| Backend Hosting | AWS EC2 | - |

---

## Architecture and Design Decisions

### High-Level Architecture

```
Browser (React SPA on Vercel)
   │
   ├── HTTPS ──► Nginx :443 (SSL termination via Let's Encrypt)
   │                │
   │                ▼
   │            Nakama :7350 (HTTP API + WebSocket)
   │                │  Server-authoritative match handler
   │                │  RPC: find_match / create_match / list_open_matches
   │                ▼
   │            PostgreSQL :5432 (accounts, sessions, storage, leaderboards)
   │
   └── DNS ──► tictactoe-nakama1.duckdns.org (AWS EC2)
```

### Why Nakama?

- **Server-authoritative model**: All game logic (move validation, win/draw detection, turn enforcement) runs on the server. Clients cannot cheat.
- **Built-in services**: Authentication (device-based), storage, leaderboards, and real-time WebSocket messaging out of the box.
- **Scalable matchmaking**: RPC-based match discovery with capacity guards (max 500 concurrent matches).

### Key Design Decisions

1. **Server-authoritative game logic**: The server owns the board state. Clients send move requests; the server validates, applies, and broadcasts updates. This prevents cheating and ensures consistency.

2. **Device-based authentication**: Each browser tab gets a unique device ID (localStorage + sessionStorage). This enables anonymous play without requiring account registration, while still supporting leaderboards and reconnection.

3. **Reconnection support**: Active match IDs are persisted in Nakama storage. If a player disconnects and returns within 10 minutes, they auto-rejoin their game via the `rejoin_match` RPC.

4. **Turn timer (30 seconds)**: Prevents stalling. If a player doesn't move within the deadline, the server forfeits them automatically.

5. **Tick-based game loop (5 Hz)**: The match handler runs at 5 ticks/second, processing all queued moves each tick. This balances responsiveness with server efficiency.

6. **Goja-compatible TypeScript**: Backend code is compiled to ES5 CommonJS via esbuild to run in Nakama's embedded goja JavaScript engine (no ES6 classes, no top-level exports).

### Messaging Protocol

| Op Code | Direction | Payload | Description |
|---------|-----------|---------|-------------|
| 1 (MOVE) | Client -> Server | `{ "position": 0-8 }` | Submit a move |
| 2 (STATE_UPDATE) | Server -> Client | Board state, marks, turn | Updated board after each valid move |
| 3 (GAME_OVER) | Server -> Client | Winner, reason, final board | Game ended (win / draw / forfeit) |
| 4 (PLAYER_READY) | Server -> Client | Player info, marks, turn | Both players joined; game starts |
| 5 (PLAYER_LEFT) | Server -> Client | Player info | Opponent disconnected |
| 6 (ERROR) | Server -> Client | Error code, message | Move rejected (NOT_YOUR_TURN, CELL_OCCUPIED, INVALID_POSITION) |

### Board Index Mapping

```
 0 | 1 | 2
---+---+---
 3 | 4 | 5
---+---+---
 6 | 7 | 8
```

---

## Project Structure

```
.
├── backend/                  # Nakama server runtime module (TypeScript)
│   ├── src/
│   │   ├── main.ts           # InitModule entry point
│   │   ├── matchHandler.ts   # Match lifecycle (init, join, loop, leave)
│   │   ├── gameLogic.ts      # Win/draw detection, move validation
│   │   ├── rpcFunctions.ts   # RPC endpoints (find_match, create_match, etc.)
│   │   ├── leaderboard.ts    # Stats tracking and leaderboard management
│   │   └── types.ts          # Shared types and op codes
│   └── build.js              # esbuild bundler config
├── web/                      # React + Vite frontend
│   └── src/
│       ├── App.tsx            # Root component (screen router)
│       ├── useTicTacToeNakama.ts  # Core game hook (state + Nakama integration)
│       ├── gameProtocol.ts    # Op codes and payload types
│       ├── nakamaEnv.ts       # Environment config and storage helpers
│       └── components/
│           ├── NicknameGate.tsx      # Username entry screen
│           ├── LobbyScreen.tsx       # Main menu (find/create match, open rooms)
│           ├── MatchmakingScreen.tsx  # Waiting for opponent
│           ├── GameScreen.tsx         # Active game board with turn timer
│           └── LeaderboardScreen.tsx  # Wins and streak rankings
├── test/                     # Node.js integration tests
│   ├── integration.js        # Full game flow test
│   ├── validation.js         # Move validation tests
│   └── player_left.js        # Disconnect/reconnection tests
├── docs/
│   └── deployment.md         # Detailed production deployment guide
├── docker-compose.yml        # Local development setup
├── docker-compose.prod.yml   # Production deployment setup
├── Makefile                  # Build, dev, deploy, and test targets
└── .env.example              # Environment variable template
```

---

## Setup and Installation Instructions

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | >= 18 |
| Docker | >= 24 |
| Docker Compose | >= 2.20 |
| Git | any |

### Local Development Setup

**1. Clone the repository**

```bash
git clone https://github.com/danieldany09/Tic-tac-toe.git
cd Tic-tac-toe
```

**2. Install dependencies and start the backend**

```bash
make install      # Install backend npm dependencies
make dev          # Build backend + start Nakama & PostgreSQL via Docker
```

This starts:
- **Nakama** at `http://localhost:7350` (API/WebSocket)
- **Nakama Console** at `http://localhost:7351` (admin UI, credentials: `admin` / `adminpassword`)
- **PostgreSQL** at `localhost:5432`

**3. Start the frontend dev server**

```bash
make web-install  # Install frontend npm dependencies
make web-dev      # Start Vite dev server at http://localhost:5173
```

**4. Play the game**

Open `http://localhost:5173` in two browser tabs (each tab gets a unique identity). Enter a nickname in each tab, click "Find Match", and play!

### Useful Makefile Targets

| Command | Description |
|---------|-------------|
| `make dev` | Build backend + start Docker containers |
| `make stop` | Stop all containers |
| `make restart` | Rebuild backend + restart Nakama |
| `make logs` | Tail Nakama server logs |
| `make web-dev` | Start frontend dev server |
| `make web-build` | Build frontend for production |
| `make test-all` | Run all integration tests |
| `make clean` | Stop containers and remove volumes |

---

## Deployment Process Documentation

### Backend Deployment (AWS EC2)

The Nakama game server runs on an AWS EC2 instance using Docker Compose.

**1. Provision an EC2 instance**

- **OS**: Ubuntu 22.04 LTS
- **Instance type**: t3.medium (2 vCPU, 4 GB RAM) or similar
- **Storage**: 30+ GB SSD
- **Security group ports**: SSH (22), HTTP (80), HTTPS (443), Nakama API (7350)

**2. Server setup**

```bash
# SSH into the instance
ssh -i your-key.pem ubuntu@13.51.86.220

# Install Docker
curl -fsSL https://get.docker.com | sh
usermod -aG docker $USER
newgrp docker

# Install Node.js (for build step)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
```

**3. Deploy the application**

```bash
git clone https://github.com/danieldany09/Tic-tac-toe.git
cd Tic-tac-toe

# Configure environment
cp .env.example .env
nano .env   # Fill in DB_PASSWORD, NAKAMA_HTTP_KEY, NAKAMA_CONSOLE_PASSWORD, DOMAIN

# Build and start
make deploy
```

**4. Setup DNS (DuckDNS)**

The domain `tictactoe-nakama1.duckdns.org` points to the EC2 public IP (`13.51.86.220`) via DuckDNS dynamic DNS.

**5. SSL with Nginx + Let's Encrypt**

```bash
apt-get install -y nginx certbot python3-certbot-nginx
# Configure Nginx reverse proxy (see docs/deployment.md section 6)
certbot --nginx -d tictactoe-nakama1.duckdns.org
```

**6. Verify deployment**

```bash
# Check containers are healthy
docker compose -f docker-compose.prod.yml ps

# Quick API ping
curl https://tictactoe-nakama1.duckdns.org/
# Expected: {"error":"missing token","code":16}  (Nakama is running)
```

### Frontend Deployment (Vercel)

The React SPA is deployed on Vercel with automatic builds from the GitHub repository.

**1. Connect repository to Vercel**

- Import the GitHub repo at [vercel.com/new](https://vercel.com/new)
- Set the **Root Directory** to `web`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

**2. Configure environment variables in Vercel dashboard**

| Variable | Value |
|----------|-------|
| `VITE_NAKAMA_HOST` | `tictactoe-nakama1.duckdns.org` |
| `VITE_NAKAMA_PORT` | `443` (if SSL) or `7350` (if direct) |
| `VITE_NAKAMA_KEY` | `defaultkey` |
| `VITE_NAKAMA_USE_SSL` | `true` (if SSL) |

**3. Deploy**

Vercel auto-deploys on every push to `main`. Manual redeploy available via the Vercel dashboard.

---

## API / Server Configuration Details

### RPC Endpoints

| RPC Function | Description | Request Payload | Response |
|-------------|-------------|-----------------|----------|
| `find_match` | Quick-play matchmaking. Checks for reconnectable match first, then finds an open match or creates a new one. | `{}` | `{ "match_id": "..." }` |
| `create_match` | Creates a private match room. Share the match ID with a friend. | `{}` | `{ "match_id": "..." }` |
| `list_open_matches` | Lists matches waiting for a second player. | `{ "limit": 1-50 }` (optional, default 20) | `{ "matches": [{ "match_id", "size" }] }` |
| `rejoin_match` | Checks if user has an active match to reconnect to (< 10 min old). | `{}` | `{ "match_id": "..." }` or `null` |
| `clear_active_match` | Clears stored active match record after failed rejoin. | `{}` | `{}` |

### Server Configuration

All Nakama configuration is passed via command-line flags in Docker Compose files:

| Setting | Local (`docker-compose.yml`) | Production (`docker-compose.prod.yml`) |
|---------|-----|-----|
| Database | `postgres:localdb@postgres:5432/nakama` | `${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}` |
| HTTP Key | (default) | `${NAKAMA_HTTP_KEY}` from `.env` |
| Console | `admin` / `adminpassword` | `${NAKAMA_CONSOLE_USERNAME}` / `${NAKAMA_CONSOLE_PASSWORD}` |
| Console Port (7351) | Exposed locally | **Not exposed** (SSH tunnel only) |
| Session Token Expiry | 3600s (1 hour) | 3600s (1 hour) |
| Runtime Path | `./nakama-data/modules` | `./nakama-data/modules` (read-only) |

### Game Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `TICK_RATE` | 5 | Match loop runs 5 times per second |
| `TURN_TIME_SEC` | 30 | Seconds before auto-forfeit on timeout |
| `MAX_CONCURRENT_MATCHES` | 500 | Server rejects new matches above this |
| `ACTIVE_MATCH_TTL` | 10 min | Reconnection window for disconnected players |

### Leaderboards

| Leaderboard ID | Operator | Sort | Tracks |
|---------------|----------|------|--------|
| `tic_tac_toe_wins` | `incr` | Descending | Total wins |
| `tic_tac_toe_streak` | `best` | Descending | Best win streak |

---

## How to Test the Multiplayer Functionality

### Automated Tests

The `test/` directory contains Node.js integration tests that simulate full multiplayer game flows against a running Nakama server.

**Prerequisites**: Ensure the backend is running locally (`make dev`).

```bash
# Install test dependencies
make test-install

# Run all tests
make test-all
```

| Test | Command | What It Verifies |
|------|---------|-----------------|
| **Integration** | `make test` | Full game flow: 2 players authenticate, find match, join via WebSocket, play moves to completion, verify win detection and leaderboard updates |
| **Validation** | `make test-validation` | Server rejects invalid moves: playing out of turn (NOT_YOUR_TURN), occupied cell (CELL_OCCUPIED), invalid position (INVALID_POSITION) |
| **Player Left** | `make test-player-left` | Disconnect behavior: player leaving mid-game triggers forfeit, opponent wins, active match storage is cleared |

### Manual Testing (Local)

1. Run `make dev` to start the backend
2. Run `make web-dev` to start the frontend
3. Open **two browser tabs** at `http://localhost:5173`
   - Each tab generates a unique device ID (sessionStorage), so they act as separate players
4. Enter a different nickname in each tab
5. Click **"Find Match"** in both tabs
6. Play the game! Verify:
   - Moves appear in real-time on both boards
   - Only the current player can make a move
   - Win/draw/forfeit is detected correctly
   - Leaderboard updates after game ends
   - Closing one tab forfeits the game for that player

### Manual Testing (Production)

1. Open [tic-tac-toe-zeta-roan.vercel.app](https://tic-tac-toe-zeta-roan.vercel.app/) in **two different browsers** or devices
2. Enter nicknames and find a match
3. Play and verify real-time multiplayer works across the internet

### Testing Reconnection

1. Start a match between two players
2. Close one browser tab mid-game
3. Reopen the app within 10 minutes
4. The player should auto-rejoin the same match

---

## License

This project was built as a multiplayer game development assignment.
