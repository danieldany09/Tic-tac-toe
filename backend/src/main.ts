import {
  matchInit,
  matchJoinAttempt,
  matchJoin,
  matchLeave,
  matchLoop,
  matchTerminate,
  matchSignal,
} from './matchHandler';
import { initLeaderboard } from './leaderboard';
import { findMatch, createMatch, listOpenMatches, rejoinMatch, clearActiveMatch } from './rpcFunctions';

// Plain function declaration — required by Nakama's goja JS runtime.
// goja makes top-level function declarations available on the global object,
// which is how Nakama discovers and calls InitModule.
// Do NOT use globalThis, module.exports, or any wrapper — they break this.
function InitModule(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer
): void {
  logger.info('TicTacToe: initialising module');

  initLeaderboard(nk, logger);

  // Use explicit key: value — goja (Nakama's JS engine) panics on shorthand properties
  initializer.registerMatch('tictactoe', {
    matchInit: matchInit,
    matchJoinAttempt: matchJoinAttempt,
    matchJoin: matchJoin,
    matchLeave: matchLeave,
    matchLoop: matchLoop,
    matchTerminate: matchTerminate,
    matchSignal: matchSignal,
  });

  initializer.registerRpc('find_match', findMatch);
  initializer.registerRpc('create_match', createMatch);
  initializer.registerRpc('list_open_matches', listOpenMatches);
  initializer.registerRpc('rejoin_match', rejoinMatch);
  initializer.registerRpc('clear_active_match', clearActiveMatch);

  logger.info('TicTacToe: module ready');
}
