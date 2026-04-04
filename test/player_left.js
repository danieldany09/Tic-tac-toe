// Node.js WebSocket polyfill for nakama-js
import { WebSocket } from 'ws';
globalThis.WebSocket = WebSocket;

import { Client } from '@heroiclabs/nakama-js';

const HOST = '127.0.0.1';
const PORT = '7350';
const SERVER_KEY = 'defaultkey';
const USE_SSL = false;

const OP = {
  MOVE: 1,
  STATE_UPDATE: 2,
  GAME_OVER: 3,
  PLAYER_READY: 4,
  PLAYER_LEFT: 5,
  ERROR: 6,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decodePayload(data) {
  if (!data) return {};
  if (typeof data === 'string') return JSON.parse(data);
  if (data instanceof Uint8Array) return JSON.parse(new TextDecoder().decode(data));
  return data;
}

async function main() {
  const run = Date.now();
  const client = new Client(SERVER_KEY, HOST, PORT, USE_SSL);

  const session1 = await client.authenticateDevice(`device-p1-pl-${run}`, true);
  const session2 = await client.authenticateDevice(`device-p2-pl-${run}`, true);

  const socket1 = client.createSocket(USE_SSL, false);
  const socket2 = client.createSocket(USE_SSL, false);

  const events1 = [];
  socket1.onmatchdata = (msg) =>
    events1.push({ opCode: msg.op_code, payload: decodePayload(msg.data) });

  await socket1.connect(session1, true);
  await socket2.connect(session2, true);

  const rpc1 = await client.rpc(session1, 'find_match', {});
  const d1 = typeof rpc1.payload === 'string' ? JSON.parse(rpc1.payload) : rpc1.payload;
  const matchId = d1.match_id;

  await sleep(400);
  await client.rpc(session2, 'find_match', {});

  await socket1.joinMatch(matchId);
  await sleep(300);
  await socket2.joinMatch(matchId);
  await sleep(600);

  const ready = events1.some((e) => e.opCode === OP.PLAYER_READY);
  if (!ready) {
    console.error('FAIL: expected PLAYER_READY before disconnect test');
    process.exit(1);
  }

  const aliceId = session1.userId || session1.user_id;
  const readyEvent = events1.find((e) => e.opCode === OP.PLAYER_READY);
  const aliceSymbol = readyEvent?.payload?.players?.[aliceId]?.symbol;
  const socketX = aliceSymbol === 'X' ? socket1 : socket2;
  const mid = matchId;

  await socketX.sendMatchState(mid, OP.MOVE, JSON.stringify({ position: 0 }));
  await sleep(400);

  socket2.disconnect();
  await sleep(1200);

  const left = events1.filter((e) => e.opCode === OP.PLAYER_LEFT);
  const over = events1.filter((e) => e.opCode === OP.GAME_OVER);

  if (left.length < 1) {
    console.error('FAIL: expected at least one PLAYER_LEFT on remaining client');
    process.exit(1);
  }
  if (over.length < 1) {
    console.error('FAIL: expected GAME_OVER after opponent disconnect');
    process.exit(1);
  }

  const pl = left[0].payload;
  if (!pl.userId || !pl.username) {
    console.error('FAIL: PLAYER_LEFT payload missing userId/username');
    process.exit(1);
  }

  console.log('OK: PLAYER_LEFT + GAME_OVER after disconnect');
  socket1.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
