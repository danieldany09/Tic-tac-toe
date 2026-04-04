import {
  TicTacToeState,
  PlayerStats,
  STATS_COLLECTION,
  STATS_RECORD_KEY,
  STREAK_LEADERBOARD_ID,
} from './types';

/** Wins leaderboard — descending by total wins, incr operator. */
export var LEADERBOARD_ID = 'tic_tac_toe_wins';

// ─── Initialisation ───────────────────────────────────────────────────────────

export function initLeaderboard(nk: nkruntime.Nakama, logger: nkruntime.Logger): void {
  try {
    nk.leaderboardCreate(LEADERBOARD_ID, true, 'desc', 'incr', '', {});
    logger.info('TicTacToe: leaderboard ' + LEADERBOARD_ID + ' initialised');
  } catch (e) {
    logger.warn('TicTacToe: leaderboard create skipped: ' + String(e));
  }
  try {
    // 'best' operator: only updates when new score exceeds the stored record.
    nk.leaderboardCreate(STREAK_LEADERBOARD_ID, true, 'desc', 'best', '', {});
    logger.info('TicTacToe: leaderboard ' + STREAK_LEADERBOARD_ID + ' initialised');
  } catch (e) {
    logger.warn('TicTacToe: streak leaderboard create skipped: ' + String(e));
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function readPlayerStats(nk: nkruntime.Nakama, userId: string): PlayerStats {
  try {
    var records = nk.storageRead([{
      collection: STATS_COLLECTION,
      key: STATS_RECORD_KEY,
      userId: userId,
    }]);
    if (records.length > 0 && records[0].value) {
      var v = records[0].value as Record<string, unknown>;
      return {
        wins:          typeof v.wins          === 'number' ? v.wins          : 0,
        losses:        typeof v.losses        === 'number' ? v.losses        : 0,
        draws:         typeof v.draws         === 'number' ? v.draws         : 0,
        currentStreak: typeof v.currentStreak === 'number' ? v.currentStreak : 0,
        bestStreak:    typeof v.bestStreak    === 'number' ? v.bestStreak    : 0,
        gamesPlayed:   typeof v.gamesPlayed   === 'number' ? v.gamesPlayed   : 0,
      };
    }
  } catch (_e) { /* new player — use defaults */ }
  return { wins: 0, losses: 0, draws: 0, currentStreak: 0, bestStreak: 0, gamesPlayed: 0 };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * updatePlayerStats
 *
 * Called once per game-over. Updates persistent stats in Nakama storage and
 * both leaderboards for every player who was in the match.
 *
 * Tracked per player:
 *   • wins / losses / draws
 *   • currentStreak  — consecutive wins; resets on loss or draw
 *   • bestStreak     — highest streak ever achieved (never decreases)
 *   • gamesPlayed    — total completed games
 *
 * Leaderboards updated:
 *   • tic_tac_toe_wins   — incremented by 1 for winner; 0 for others (updates metadata)
 *   • tic_tac_toe_streak — best streak ever, using Nakama 'best' operator
 */
export function updatePlayerStats(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  state: TicTacToeState
): void {
  var winner = state.winner;
  if (winner === null) return; // match abandoned before any outcome

  var isDraw = winner === 'draw';

  // Prefer presences; fall back to usernames map if all players have already left.
  var uids = Object.keys(state.presences);
  if (uids.length === 0) uids = Object.keys(state.usernames);

  for (var i = 0; i < uids.length; i++) {
    var uid = uids[i];
    var username = state.usernames[uid] || '';
    var isWinner = !isDraw && winner === uid;

    // ── Read current stats ────────────────────────────────────────────────
    var stats = readPlayerStats(nk, uid);

    // ── Apply outcome ─────────────────────────────────────────────────────
    stats.gamesPlayed++;
    if (isDraw) {
      stats.draws++;
      stats.currentStreak = 0;
    } else if (isWinner) {
      stats.wins++;
      stats.currentStreak++;
      if (stats.currentStreak > stats.bestStreak) {
        stats.bestStreak = stats.currentStreak;
      }
    } else {
      stats.losses++;
      stats.currentStreak = 0;
    }

    // ── Persist to Nakama storage (source of truth) ───────────────────────
    try {
      nk.storageWrite([{
        collection: STATS_COLLECTION,
        key: STATS_RECORD_KEY,
        userId: uid,
        value: stats,
        permissionRead: 2,  // public readable so leaderboard queries can access it
        permissionWrite: 0, // server-only writes
      }]);
    } catch (e) {
      logger.warn('TicTacToe: failed to write stats for ' + uid + ': ' + String(e));
    }

    // ── Update wins leaderboard ───────────────────────────────────────────
    // Non-winners add 0 so their metadata (losses, draws, streaks) stays current.
    try {
      nk.leaderboardRecordWrite(LEADERBOARD_ID, uid, username, isWinner ? 1 : 0, 0, stats, 'incr');
    } catch (e) {
      logger.warn('TicTacToe: failed to write wins leaderboard for ' + uid + ': ' + String(e));
    }

    // ── Update streak leaderboard ─────────────────────────────────────────
    // 'best' operator only persists the score when it exceeds the stored value.
    try {
      nk.leaderboardRecordWrite(STREAK_LEADERBOARD_ID, uid, username, stats.bestStreak, 0, stats, 'best');
    } catch (e) {
      logger.warn('TicTacToe: failed to write streak leaderboard for ' + uid + ': ' + String(e));
    }

    logger.debug(
      'TicTacToe: stats updated for ' + uid +
      ' — W:' + stats.wins + ' L:' + stats.losses + ' D:' + stats.draws +
      ' streak:' + stats.currentStreak + ' best:' + stats.bestStreak
    );
  }
}
