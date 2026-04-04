import {
  ACTIVE_MATCH_COLLECTION,
  ACTIVE_MATCH_RECORD_KEY,
  MAX_CONCURRENT_MATCHES,
  STATS_COLLECTION,
  STATS_RECORD_KEY,
} from './types';
import { LEADERBOARD_ID } from './leaderboard';

/** Active-match storage TTL: records older than this are treated as stale (ms). */
var ACTIVE_MATCH_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * find_match
 *
 * 1. Reconnection: if the caller has a fresh active-match record in storage,
 *    return that match ID so they rejoin their in-progress game.
 * 2. Capacity guard: reject when total concurrent matches exceeds the soft cap.
 * 3. Matchmaking: join the oldest open (waiting) match, or create a new one.
 */
export function findMatch(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, _payload: string): string {
  if (!ctx.userId) {
    throw new Error('Authentication required');
  }

  // ── 1. Reconnection check ──────────────────────────────────────────────────
  try {
    var stored = nk.storageRead([{
      collection: ACTIVE_MATCH_COLLECTION,
      key: ACTIVE_MATCH_RECORD_KEY,
      userId: ctx.userId,
    }]);
    if (stored.length > 0 && stored[0].value && stored[0].value.matchId) {
      var storedMatchId = stored[0].value.matchId as string;
      var storedAt = (stored[0].value.storedAt as number) || 0;
      if (Date.now() - storedAt < ACTIVE_MATCH_TTL_MS) {
        logger.info('TicTacToe RPC find_match: reconnecting ' + ctx.userId + ' to active match ' + storedMatchId);
        return JSON.stringify({ match_id: storedMatchId });
      }
      // Record is stale — remove it and fall through to normal matchmaking.
      nk.storageDelete([{
        collection: ACTIVE_MATCH_COLLECTION,
        key: ACTIVE_MATCH_RECORD_KEY,
        userId: ctx.userId,
      }]);
      logger.info('TicTacToe RPC find_match: cleared stale active match record for ' + ctx.userId);
    }
  } catch (e) {
    logger.warn('TicTacToe RPC find_match: storage check failed: ' + String(e));
  }

  // ── 2. Concurrent match cap ────────────────────────────────────────────────
  // Count all active authoritative matches (waiting + full/playing).
  var allActive = nk.matchList(MAX_CONCURRENT_MATCHES + 1, true, null, 0, 2, null);
  if (allActive.length > MAX_CONCURRENT_MATCHES) {
    logger.warn('TicTacToe RPC find_match: concurrent match cap reached (' + allActive.length + ' active)');
    throw new Error('Server is at capacity. Please try again later.');
  }

  // ── 3. Standard matchmaking ────────────────────────────────────────────────
  // Take the oldest waiting match (index 0) to pair players in FIFO order.
  var openMatches = nk.matchList(10, true, null, 0, 1, '+label.open:1');
  if (openMatches.length > 0) {
    var match = openMatches[0];
    logger.info('TicTacToe RPC find_match: joining existing match ' + match.matchId);
    return JSON.stringify({ match_id: match.matchId });
  }

  var matchId = nk.matchCreate('tictactoe', {});
  logger.info('TicTacToe RPC find_match: created new match ' + matchId);
  return JSON.stringify({ match_id: matchId });
}

/**
 * create_match
 * Always spawns a brand-new private match regardless of open matches.
 */
export function createMatch(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, _payload: string): string {
  if (!ctx.userId) {
    throw new Error('Authentication required');
  }

  var matchId = nk.matchCreate('tictactoe', {});
  logger.info('TicTacToe RPC create_match: created private match ' + matchId + ' for ' + ctx.userId);
  return JSON.stringify({ match_id: matchId });
}

/** Room discovery: authoritative matches waiting for a second player (label open:1, size ≤ 1). */
export function listOpenMatches(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  if (!ctx.userId) {
    throw new Error('Authentication required');
  }

  var limit = 20;
  if (payload && payload.length > 0) {
    try {
      var o = JSON.parse(payload) as { limit?: number };
      if (typeof o.limit === 'number' && o.limit >= 1 && o.limit <= 50) {
        limit = Math.floor(o.limit);
      }
    } catch (_e) {
      // ignore invalid JSON, use default limit
    }
  }

  var openMatches = nk.matchList(limit, true, null, 0, 1, '+label.open:1');
  var matches: { match_id: string; size: number }[] = [];
  for (var i = 0; i < openMatches.length; i++) {
    var m = openMatches[i];
    matches.push({ match_id: m.matchId, size: m.size });
  }

  logger.info('TicTacToe RPC list_open_matches: returning ' + matches.length + ' matches');
  return JSON.stringify({ matches: matches });
}

/**
 * rejoin_match
 *
 * Looks up the caller's active match record in storage.
 * Returns { match_id: "<id>" } if a fresh record exists, or { match_id: null } if not.
 * The client calls this on app load to resume an in-progress game after a disconnect.
 */
export function rejoinMatch(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, _payload: string): string {
  if (!ctx.userId) {
    throw new Error('Authentication required');
  }

  try {
    var stored = nk.storageRead([{
      collection: ACTIVE_MATCH_COLLECTION,
      key: ACTIVE_MATCH_RECORD_KEY,
      userId: ctx.userId,
    }]);
    if (stored.length > 0 && stored[0].value && stored[0].value.matchId) {
      var matchId = stored[0].value.matchId as string;
      var storedAt = (stored[0].value.storedAt as number) || 0;
      if (Date.now() - storedAt < ACTIVE_MATCH_TTL_MS) {
        logger.info('TicTacToe RPC rejoin_match: found active match ' + matchId + ' for ' + ctx.userId);
        return JSON.stringify({ match_id: matchId });
      }
      // Stale record — clean up before returning null.
      nk.storageDelete([{
        collection: ACTIVE_MATCH_COLLECTION,
        key: ACTIVE_MATCH_RECORD_KEY,
        userId: ctx.userId,
      }]);
    }
  } catch (e) {
    logger.warn('TicTacToe RPC rejoin_match: storage read failed: ' + String(e));
  }

  return JSON.stringify({ match_id: null });
}

/**
 * clear_active_match
 *
 * Deletes the caller's active match storage record.
 * The client calls this when a rejoin attempt is rejected (match ended) so the
 * stale record doesn't block future find_match calls.
 */
export function clearActiveMatch(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, _payload: string): string {
  if (!ctx.userId) {
    throw new Error('Authentication required');
  }

  try {
    nk.storageDelete([{
      collection: ACTIVE_MATCH_COLLECTION,
      key: ACTIVE_MATCH_RECORD_KEY,
      userId: ctx.userId,
    }]);
    logger.info('TicTacToe RPC clear_active_match: cleared record for ' + ctx.userId);
  } catch (e) {
    logger.warn('TicTacToe RPC clear_active_match: failed: ' + String(e));
  }

  return JSON.stringify({ ok: true });
}

/**
 * get_player_stats
 *
 * Returns the calling player's full performance stats from Nakama storage,
 * plus their global rank in the wins and streak leaderboards.
 *
 * Response shape:
 *   { wins, losses, draws, currentStreak, bestStreak, gamesPlayed, winsRank, streakRank }
 */
export function getPlayerStats(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, _payload: string): string {
  if (!ctx.userId) {
    throw new Error('Authentication required');
  }

  var result = {
    wins: 0,
    losses: 0,
    draws: 0,
    currentStreak: 0,
    bestStreak: 0,
    gamesPlayed: 0,
  };

  // Read persisted stats from Nakama storage.
  // Global rank is resolved client-side from the leaderboard records the UI already fetches.
  try {
    var stored = nk.storageRead([{
      collection: STATS_COLLECTION,
      key: STATS_RECORD_KEY,
      userId: ctx.userId,
    }]);
    if (stored.length > 0 && stored[0].value) {
      var v = stored[0].value as Record<string, unknown>;
      result.wins          = typeof v.wins          === 'number' ? v.wins          : 0;
      result.losses        = typeof v.losses        === 'number' ? v.losses        : 0;
      result.draws         = typeof v.draws         === 'number' ? v.draws         : 0;
      result.currentStreak = typeof v.currentStreak === 'number' ? v.currentStreak : 0;
      result.bestStreak    = typeof v.bestStreak    === 'number' ? v.bestStreak    : 0;
      result.gamesPlayed   = typeof v.gamesPlayed   === 'number' ? v.gamesPlayed   : 0;
    }
  } catch (e) {
    logger.warn('TicTacToe RPC get_player_stats: storage read failed: ' + String(e));
  }

  logger.info('TicTacToe RPC get_player_stats: returned stats for ' + ctx.userId);
  return JSON.stringify(result);
}
