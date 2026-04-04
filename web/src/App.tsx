import { useState } from 'react';
import { NicknameGate } from './components/NicknameGate';
import { LobbyScreen } from './components/LobbyScreen';
import { MatchmakingScreen } from './components/MatchmakingScreen';
import { GameScreen } from './components/GameScreen';
import { LeaderboardScreen } from './components/LeaderboardScreen';
import { hasCompletedNicknameForThisTab } from './nakamaEnv';
import { useTicTacToeNakama } from './useTicTacToeNakama';

type FlowScreen = 'play' | 'leaderboard';

export default function App() {
  const [nicknameGateDone, setNicknameGateDone] = useState(hasCompletedNicknameForThisTab);
  const [flow, setFlow] = useState<FlowScreen>('play');

  const game = useTicTacToeNakama();

  if (!nicknameGateDone) {
    return (
      <NicknameGate
        onDone={() => setNicknameGateDone(true)}
        onSubmit={(username) => game.completeNicknameGate(username)}
      />
    );
  }

  if (flow === 'leaderboard' && game.phase === 'lobby') {
    return (
      <LeaderboardScreen
        client={game.client}
        session={game.session}
        ensureSession={game.ensureSession}
        onBack={() => setFlow('play')}
      />
    );
  }

  if (game.phase === 'waiting') {
    return (
      <MatchmakingScreen
        busy={game.busy}
        onCancel={() => {
          game.leaveRoom();
        }}
      />
    );
  }

  if (game.phase === 'playing' || game.phase === 'ended') {
    return (
      <GameScreen
        userId={game.userId}
        displayName={game.displayName}
        players={game.players!}
        displayUsernames={game.displayUsernames}
        board={game.board}
        marks={game.marks}
        currentTurn={game.currentTurn}
        playing={game.playing}
        gameOver={game.gameOver}
        winningLine={game.winningLine}
        mySymbol={game.mySymbol}
        status={game.status}
        statusErr={game.statusErr}
        turnSecondsLeft={game.turnSecondsLeft}
        busy={game.busy}
        onCellClick={game.sendMove}
        onLeave={game.leaveRoom}
        onViewLeaderboard={() => {
          game.leaveRoom();
          setFlow('leaderboard');
        }}
        onPlayAgain={() => {
          game.leaveRoom();
          setFlow('play');
        }}
      />
    );
  }

  return (
    <LobbyScreen
      busy={game.busy}
      joiningMatch={game.joiningMatch}
      status={game.status}
      statusErr={game.statusErr}
      displayName={game.displayName}
      openMatches={game.openMatches}
      onFindMatch={game.runFindMatch}
      onCreateMatch={game.runCreateMatch}
      onListOpen={game.runListOpen}
      onJoinListed={game.joinListed}
      onOpenLeaderboard={() => setFlow('leaderboard')}
    />
  );
}
