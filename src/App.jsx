import { useState } from 'react';
import PlayerCountScreen from './components/PlayerCountScreen';
import DealingScreen from './components/DealingScreen';
import Background from './components/Background';


function App() {
  const [screen, setScreen] = useState('playerCount');
  const [deck, setDeck] = useState([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);

  const generateDeck = (playerCount) => {
    const roles = [];

    let mafiaCount;
    if (playerCount <= 6) {
      mafiaCount = 1;
    } else if (playerCount <= 9) {
      mafiaCount = 2;
    } else {
      mafiaCount = 3;
    }

    for (let i = 0; i < mafiaCount; i++) {
      roles.push('mafia');
    }

    if (playerCount >= 5) {
      roles.push('doctor');
      roles.push('detective');
    }

    const villagersCount = playerCount - roles.length;
    for (let i = 0; i < villagersCount; i++) {
      roles.push('villager');
    }

    return shuffleDeck(roles);
  };

  const shuffleDeck = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const startGame = (playerCount) => {
    const newDeck = generateDeck(playerCount);
    setDeck(newDeck);
    setScreen('dealing');
  };

  const restartGame = () => {
    setScreen('playerCount');
    setDeck([]);
  };

  return (
    <div className="app relative min-h-screen text-white overflow-hidden">
      <Background />
      <div className="relative z-10">
        {screen === 'playerCount' && (
          <PlayerCountScreen onStart={startGame} />
        )}
        {screen === 'dealing' && (
          <DealingScreen
            deck={deck}
            onRestart={restartGame}
          />
        )}
      </div>
    </div>
  );
}

export default App;
