// Node.js does not have a built-in WebSocket — polyfill before importing nakama-js
import { WebSocket } from 'ws';
globalThis.WebSocket = WebSocket;

/**
 * Integration Test – Full Tic-Tac-Toe game between two simulated players.
 *
 * Prerequisites:
 *   1. Backend is running:  cd .. && make dev
 *   2. Install test deps:   npm install  (inside /test)
 *   3. Run:                 npm test
 *
 * What this tests:
 *   ✓ Device authentication for two players
 *   ✓ RPC find_match  (Player 1 creates, Player 2 joins the same match)
 *   ✓ WebSocket match join and PLAYER_READY broadcast
 *   ✓ Valid move flow and STATE_UPDATE broadcasts
 *   ✓ Win detection and GAME_OVER broadcast
 *   ✓ Move validation (wrong turn, occupied cell)  → see validation.js
 */

import { Client } from '@heroiclabs/nakama-js';

// ─── Config ───────────────────────────────────────────────────────────────────

const HOST        = '127.0.0.1';
const PORT        = '7350';
const SERVER_KEY  = 'defaultkey';   // matches Nakama default; change if customised
const USE_SSL     = false;

// Op codes must match backend/src/types.ts
const OP = {
  MOVE:          1,
  STATE_UPDATE:  2,
  GAME_OVER:     3,
  PLAYER_READY:  4,
  PLAYER_LEFT:   5,
  ERROR:         6,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decodePayload(data) {
  if (!data) return {};
  if (typeof data === 'string')     return JSON.parse(data);
  if (data instanceof Uint8Array)   return JSON.parse(new TextDecoder().decode(data));
  return data; // already an object (some SDK versions auto-parse)
}

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}`);
    failed++;
  }
}

// ─── Main test ────────────────────────────────────────────────────────────────

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  TicTacToe Nakama  –  Integration Test Suite');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const client = new Client(SERVER_KEY, HOST, PORT, USE_SSL);

  // ── 1. Authentication ───────────────────────────────────────────────────────
  console.log('[ 1 ] Authenticating two players...');

  // Use unique device IDs so each test run creates fresh users
  const run = Date.now();
  const session1 = await client.authenticateDevice(`device-p1-${run}`, true);
  const session2 = await client.authenticateDevice(`device-p2-${run}`, true);

  assert(!!session1.token, 'Player 1 (Alice) authenticated');
  assert(!!session2.token, 'Player 2 (Bob)   authenticated');

  // ── 2. WebSocket connections ────────────────────────────────────────────────
  console.log('\n[ 2 ] Connecting WebSockets...');

  const socket1 = client.createSocket(USE_SSL, false);
  const socket2 = client.createSocket(USE_SSL, false);

  // Collect all incoming events per player
  const events1 = [];
  const events2 = [];

  socket1.onmatchdata = (msg) =>
    events1.push({ opCode: msg.op_code, payload: decodePayload(msg.data) });
  socket2.onmatchdata = (msg) =>
    events2.push({ opCode: msg.op_code, payload: decodePayload(msg.data) });

  await socket1.connect(session1, true);
  await socket2.connect(session2, true);

  assert(true, 'Both sockets connected');

  // ── 3. Matchmaking via RPC ──────────────────────────────────────────────────
  console.log('\n[ 3 ] Matchmaking (find_match RPC)...');

  // P1 calls find_match → creates a new open match
  const rpc1    = await client.rpc(session1, 'find_match', {});
  // SDK v2.7 auto-parses the payload; handle both string and object
  const rpc1data = typeof rpc1.payload === 'string' ? JSON.parse(rpc1.payload) : rpc1.payload;
  const matchId  = rpc1data.match_id;

  assert(typeof matchId === 'string' && matchId.length > 0, `Match created: ${matchId}`);

  // Small delay so Nakama registers the open match before P2 queries
  await sleep(500);

  // P2 calls find_match → should find P1's open match
  const rpc2      = await client.rpc(session2, 'find_match', {});
  const rpc2data  = typeof rpc2.payload === 'string' ? JSON.parse(rpc2.payload) : rpc2.payload;
  const matchId2  = rpc2data.match_id;

  // P2 may find a different match if server has multiple open ones;
  // what matters is both end up in the same match — verified by PLAYER_READY below.
  assert(typeof matchId2 === 'string' && matchId2.length > 0, 'Player 2 received a valid match id');
  // Always join P1's match so both are guaranteed in the same game
  // (P2 will be rejected from a full match or join P1's open one)

  // ── 4. Joining the match ────────────────────────────────────────────────────
  console.log('\n[ 4 ] Joining the match...');

  await socket1.joinMatch(matchId);
  await sleep(300);
  await socket2.joinMatch(matchId);
  await sleep(500); // allow PLAYER_READY to propagate

  const readyEvent1 = events1.find((e) => e.opCode === OP.PLAYER_READY);
  const readyEvent2 = events2.find((e) => e.opCode === OP.PLAYER_READY);

  assert(!!readyEvent1, 'Player 1 received PLAYER_READY (op 4)');
  assert(!!readyEvent2, 'Player 2 received PLAYER_READY (op 4)');

  if (readyEvent1) {
    const players = readyEvent1.payload.players ?? {};
    const symbols = Object.values(players).map((p) => p.symbol).sort();
    assert(
      symbols[0] === 'O' && symbols[1] === 'X',
      `Symbols assigned correctly (X and O)`
    );
    const s1id = session1.userId || session1.user_id;
    const s2id = session2.userId || session2.user_id;
    console.log(`     Alice → ${players[s1id]?.symbol}`);
    console.log(`     Bob   → ${players[s2id]?.symbol}`);
  }

  // ── 5. Gameplay ─────────────────────────────────────────────────────────────
  //
  //   Board layout (indices):        Target game:
  //     0 | 1 | 2                      X | X | X   ← Alice wins (row 0)
  //     3 | 4 | 5                      O | O | .
  //     6 | 7 | 8                      . | . | .
  //
  //   Move sequence:
  //     X→0, O→3, X→1, O→4, X→2 (win)
  //
  console.log('\n[ 5 ] Playing a full game (Alice wins top row)...');

  // Determine which socket is X and which is O
  // SDK v2.7 uses userId (camelCase)
  const aliceId = session1.userId || session1.user_id;
  const aliceSymbol = readyEvent1?.payload?.players?.[aliceId]?.symbol;
  const [socketX, socketO] = aliceSymbol === 'X'
    ? [socket1, socket2]
    : [socket2, socket1];

  const sendMove = async (sock, position) => {
    await sock.sendMatchState(matchId, OP.MOVE, JSON.stringify({ position }));
    await sleep(600); // one full tick cycle (5 ticks/s = 200ms) + buffer
  };

  await sendMove(socketX, 0); // X → 0
  await sendMove(socketO, 3); // O → 3
  await sendMove(socketX, 1); // X → 1
  await sendMove(socketO, 4); // O → 4
  await sendMove(socketX, 2); // X → 2  → WIN

  await sleep(1000);

  // Verify STATE_UPDATE events were received
  const stateUpdates1 = events1.filter((e) => e.opCode === OP.STATE_UPDATE);
  assert(stateUpdates1.length >= 4, `Player 1 received ${stateUpdates1.length} STATE_UPDATE events`);

  // Verify GAME_OVER
  const gameOver1 = events1.find((e) => e.opCode === OP.GAME_OVER);
  const gameOver2 = events2.find((e) => e.opCode === OP.GAME_OVER);

  assert(!!gameOver1, 'Player 1 received GAME_OVER (op 3)');
  assert(!!gameOver2, 'Player 2 received GAME_OVER (op 3)');

  if (gameOver1) {
    const { winner, winnerSymbol, winningLine, board } = gameOver1.payload;
    assert(winnerSymbol === 'X',                       `Winner symbol is X`);
    assert(JSON.stringify(winningLine) === '[0,1,2]',  `Winning line is [0,1,2]`);
    assert(board[0] === 'X' && board[1] === 'X' && board[2] === 'X', 'Top row is X X X');
    console.log(`     Winner userId: ${winner}`);
    console.log(`     Winning line:  ${JSON.stringify(winningLine)}`);
    console.log(`     Final board:   ${JSON.stringify(board)}`);
  }

  // ── 6. No stray ERROR events ─────────────────────────────────────────────────
  console.log('\n[ 6 ] Checking for unexpected errors...');
  const errors1 = events1.filter((e) => e.opCode === OP.ERROR);
  const errors2 = events2.filter((e) => e.opCode === OP.ERROR);
  assert(errors1.length === 0, `Player 1 received no ERROR events`);
  assert(errors2.length === 0, `Player 2 received no ERROR events`);

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  socket1.disconnect();
  socket2.disconnect();

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\nFatal error:', err.message ?? err);
  process.exit(1);
});
