import { useState } from 'react';
import PlayerCountScreen from './components/PlayerCountScreen';
import NamesScreen from './components/NamesScreen';
import DealingScreen from './components/DealingScreen';
import GameMasterScreen from './components/GameMasterScreen';
import Background from './components/Background';
import RulesScreen from './components/RulesScreen';
import { generateDeck } from './game/roles';
import { loadLastGame, saveLastGame, namesForCount } from './game/storage';

function App() {
  const [lastGame] = useState(() => loadLastGame());
  const [screen, setScreen] = useState('playerCount');
  const [playerCount, setPlayerCount] = useState(lastGame?.count ?? 6);
  const [names, setNames] = useState(lastGame?.names ?? []);
  const [deck, setDeck] = useState([]);
  // cardIndex -> player name, filled in as each player picks their name and views their card
  const [assignments, setAssignments] = useState({});
  const [eliminated, setEliminated] = useState([]);

  const goToNames = (count) => {
    // names are kept as-is so going 6 -> 4 -> 6 doesn't lose the last two
    setPlayerCount(count);
    setScreen('names');
  };

  const startDealing = (finalNames) => {
    setNames(finalNames);
    saveLastGame(finalNames.length, finalNames);
    setDeck(generateDeck(finalNames.length));
    setAssignments({});
    setEliminated([]);
    setScreen('dealing');
  };

  const assignCard = (cardIndex, name) => {
    setAssignments((prev) => ({ ...prev, [cardIndex]: name }));
  };

  const toggleEliminated = (name) => {
    setEliminated((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  };

  // Back to the count screen; count + names are kept in state (and localStorage).
  const restartGame = () => {
    setDeck([]);
    setAssignments({});
    setEliminated([]);
    setScreen('playerCount');
  };

  // Players in the order the game master entered them, with their dealt role.
  const players = names
    .map((name) => {
      const entry = Object.entries(assignments).find(([, n]) => n === name);
      return entry ? { name, role: deck[Number(entry[0])] } : null;
    })
    .filter(Boolean);

  return (
    <div className="app relative min-h-screen text-white overflow-hidden">
      <Background />
      <div className="relative z-10">
        {screen === 'rules' && <RulesScreen onClose={() => setScreen('playerCount')} />}
        {screen === 'playerCount' && (
          <PlayerCountScreen
            initialCount={playerCount}
            onStart={goToNames}
            onRules={() => setScreen('rules')}
          />
        )}
        {screen === 'names' && (
          <NamesScreen
            initialNames={namesForCount(playerCount, names)}
            onBack={() => setScreen('playerCount')}
            onConfirm={startDealing}
          />
        )}
        {screen === 'dealing' && (
          <DealingScreen
            deck={deck}
            names={names}
            assignments={assignments}
            onAssign={assignCard}
            onOpenGameMaster={() => setScreen('gm')}
            onRestart={restartGame}
          />
        )}
        {screen === 'gm' && (
          <GameMasterScreen
            players={players}
            eliminated={eliminated}
            onToggle={toggleEliminated}
            onBack={() => setScreen('dealing')}
            onRestart={restartGame}
          />
        )}
      </div>
    </div>
  );
}

export default App;
