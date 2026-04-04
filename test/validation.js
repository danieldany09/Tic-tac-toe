// Node.js does not have a built-in WebSocket — polyfill before importing nakama-js
import { WebSocket } from 'ws';
globalThis.WebSocket = WebSocket;

/**
 * Validation Test – Verifies that the server correctly rejects illegal moves.
 *
 * Run:  npm run test:validation
 *
 * Scenarios tested:
 *   ✓ Playing out of turn  → ERROR code NOT_YOUR_TURN
 *   ✓ Playing on an already occupied cell  → ERROR code CELL_OCCUPIED
 *   ✓ Invalid position (out of range)  → ERROR code INVALID_POSITION
 */

import { Client } from '@heroiclabs/nakama-js';

const HOST       = '127.0.0.1';
const PORT       = '7350';
const SERVER_KEY = 'defaultkey';
const USE_SSL    = false;

const OP = { MOVE: 1, STATE_UPDATE: 2, GAME_OVER: 3, PLAYER_READY: 4, ERROR: 6 };

const sleep  = (ms) => new Promise((r) => setTimeout(r, ms));
const decode = (data) => {
  if (!data) return {};
  if (typeof data === 'string')   return JSON.parse(data);
  if (data instanceof Uint8Array) return JSON.parse(new TextDecoder().decode(data));
  return data;
};

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { console.log(`  ✓  ${label}`); passed++; }
  else           { console.error(`  ✗  ${label}`); failed++; }
}

// Waits until `predicate(events)` returns truthy or timeout expires
async function waitFor(events, predicate, timeoutMs = 1500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = events.find(predicate);
    if (match) return match;
    await sleep(100);
  }
  return null;
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  TicTacToe Nakama  –  Move Validation Tests');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const client = new Client(SERVER_KEY, HOST, PORT, USE_SSL);
  const run    = Date.now();

  const session1 = await client.authenticateDevice(`val-p1-${run}`, true);
  const session2 = await client.authenticateDevice(`val-p2-${run}`, true);

  const socket1 = client.createSocket(USE_SSL, false);
  const socket2 = client.createSocket(USE_SSL, false);

  const events1 = [];
  const events2 = [];

  socket1.onmatchdata = (msg) => events1.push({ opCode: msg.op_code, payload: decode(msg.data) });
  socket2.onmatchdata = (msg) => events2.push({ opCode: msg.op_code, payload: decode(msg.data) });

  await socket1.connect(session1, true);
  await socket2.connect(session2, true);

  // Create and join match
  const rpc      = await client.rpc(session1, 'find_match', {});
  const rpcData  = typeof rpc.payload === 'string' ? JSON.parse(rpc.payload) : rpc.payload;
  const matchId  = rpcData.match_id;

  await socket1.joinMatch(matchId);
  await sleep(300);
  await socket2.joinMatch(matchId);
  await sleep(500);

  const readyEvent = events1.find((e) => e.opCode === OP.PLAYER_READY);
  if (!readyEvent) {
    console.error('Could not start a match. Is the server running? (make dev)');
    process.exit(1);
  }

  // Determine who is X (X always goes first)
  const aliceSymbol  = readyEvent.payload.players?.[session1.user_id]?.symbol;
  const [sockX, evX] = aliceSymbol === 'X'
    ? [socket1, events1] : [socket2, events2];
  const [sockO, evO] = aliceSymbol === 'X'
    ? [socket2, events2] : [socket1, events1];

  console.log('[ 1 ] Out-of-turn move (O tries to play before X)...');
  {
    const startIdx = evO.length;
    await sockO.sendMatchState(matchId, OP.MOVE, JSON.stringify({ position: 0 }));
    const err = await waitFor(
      evO,
      (e) => e.opCode === OP.ERROR && evO.indexOf(e) >= startIdx
    );
    assert(!!err,                             'Server sent ERROR event to O');
    assert(err?.payload?.code === 'NOT_YOUR_TURN', `Error code is NOT_YOUR_TURN (got: ${err?.payload?.code})`);
  }

  console.log('\n[ 2 ] Valid first move by X (position 4)...');
  {
    const startIdx = evX.length;
    await sockX.sendMatchState(matchId, OP.MOVE, JSON.stringify({ position: 4 }));
    const state = await waitFor(
      evX,
      (e) =>
        e.opCode === OP.STATE_UPDATE &&
        evX.indexOf(e) >= startIdx &&
        e.payload?.board?.[4] === 'X'
    );
    assert(!!state,                'STATE_UPDATE received after valid move');
    assert(state?.payload?.board?.[4] === 'X', 'Board[4] is now X');
  }

  console.log('\n[ 3 ] Occupied cell (X tries to play position 4 again)...');
  {
    // It is now O\'s turn; let O play first so it becomes X\'s turn, then X plays occupied
    await sockO.sendMatchState(matchId, OP.MOVE, JSON.stringify({ position: 0 }));
    await sleep(300);

    const startIdx = evX.length;
    await sockX.sendMatchState(matchId, OP.MOVE, JSON.stringify({ position: 4 })); // already taken
    const err = await waitFor(
      evX,
      (e) => e.opCode === OP.ERROR && evX.indexOf(e) >= startIdx
    );
    assert(!!err,                               'Server sent ERROR event');
    assert(err?.payload?.code === 'CELL_OCCUPIED', `Error code is CELL_OCCUPIED (got: ${err?.payload?.code})`);
  }

  console.log('\n[ 4 ] Invalid position (out of range: position 99)...');
  {
    // After test 3 it is still O\'s turn (X\'s occupied-cell attempt did not apply)
    await sockO.sendMatchState(matchId, OP.MOVE, JSON.stringify({ position: 1 }));
    await sleep(300);

    const startIdx = evX.length;
    await sockX.sendMatchState(matchId, OP.MOVE, JSON.stringify({ position: 99 }));
    const err = await waitFor(
      evX,
      (e) => e.opCode === OP.ERROR && evX.indexOf(e) >= startIdx
    );
    assert(!!err,                                 'Server sent ERROR event');
    assert(err?.payload?.code === 'INVALID_POSITION', `Error code is INVALID_POSITION (got: ${err?.payload?.code})`);
  }

  socket1.disconnect();
  socket2.disconnect();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\nFatal error:', err.message ?? err);
  process.exit(1);
});
