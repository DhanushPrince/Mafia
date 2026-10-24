import { useEffect, useReducer, useState } from 'react';
import PlayerCountScreen from './components/PlayerCountScreen';
import NamesScreen from './components/NamesScreen';
import DealingScreen from './components/DealingScreen';
import GameMasterScreen from './components/GameMasterScreen';
import NarratorGame from './components/NarratorGame';
import GameErrorBoundary from './components/GameErrorBoundary';
import Background from './components/Background';
import RulesScreen from './components/RulesScreen';
import { generateDeck } from './game/roles';
import {
  loadLastGame, saveLastGame, namesForCount, loadSettings, saveSettings,
  loadSavedGameRaw, saveGameRaw, clearSavedGame, volumeHintSeen, markVolumeHintSeen,
} from './game/storage';
import { reducer as engineReducer, createInitialState, serialize, deserialize, isResumable, isTurnPhase, PHASES, allClipIds } from './game/engine';
import { narrator } from './audio/narrator';
import { nameVoice } from './audio/nameVoice';
import { unlockAmbient } from './audio/ambient';
import { TIMING } from './game/timing';

const loadResumable = () => {
  const saved = deserialize(loadSavedGameRaw());
  if (saved && isResumable(saved)) return saved;
  if (loadSavedGameRaw()) clearSavedGame(); // incompatible / finished -> discard
  return null;
};

const describeSaved = (s) => {
  if (!s) return null;
  const night = s.phase === PHASES.NIGHT_INTRO || isTurnPhase(s.phase);
  return `${night ? 'Night' : 'Day'} ${s.round}`;
};

function App() {
  const [lastGame] = useState(() => loadLastGame());
  const [settings, setSettings] = useState(() => loadSettings());
  const [screen, setScreen] = useState('playerCount');
  const [playerCount, setPlayerCount] = useState(lastGame?.count ?? 6);
  const [names, setNames] = useState(lastGame?.names ?? []);
  const [deck, setDeck] = useState([]);
  // cardIndex -> player name, filled in as each player picks their name and views their card
  const [assignments, setAssignments] = useState({});
  const [eliminated, setEliminated] = useState([]);
  // narrator mode
  const [game, dispatch] = useReducer(engineReducer, undefined, () => createInitialState());
  const [savedGame, setSavedGame] = useState(() => loadResumable());
  const [showVolumeHint, setShowVolumeHint] = useState(() => !volumeHintSeen());
  const [boundaryKey, setBoundaryKey] = useState(0);

  const updateSettings = (patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  };

  // narrator follows settings
  useEffect(() => {
    narrator.setVoice(settings.voice);
    narrator.setMuted(settings.muted);
    narrator.setRate(TIMING.rate);
  }, [settings.voice, settings.muted]);

  // unlock audio on the very first tap anywhere (mobile autoplay policies)
  useEffect(() => {
    const unlock = () => {
      narrator.unlock();
      unlockAmbient();
    };
    window.addEventListener('pointerdown', unlock, { once: true, capture: true });
    return () => window.removeEventListener('pointerdown', unlock, { capture: true });
  }, []);

  // persist the narrator game after every action; clear it when it ends
  useEffect(() => {
    if (isResumable(game)) {
      const raw = serialize(game);
      saveGameRaw(raw);
    } else if (game.phase === PHASES.END) {
      clearSavedGame();
      setSavedGame(null);
    }
  }, [game]);

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
    if (settings.mode === 'narrator') {
      dispatch({
        type: 'NEW_GAME',
        rules: { noRepeatSave: settings.noRepeatSave },
        timers: { turnSec: settings.turnSec, discussMin: settings.discussMin },
      });
      // names are known now: load the in-browser voice and synthesise them while the cards are dealt
      nameVoice.prepare(settings.voice, finalNames);
    }
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
    dispatch({ type: 'RESET' });
    clearSavedGame();
    setSavedGame(null);
    narrator.stop();
    setScreen('playerCount');
  };

  // Players in the order the game master entered them, with their dealt role.
  const players = names
    .map((name) => {
      const entry = Object.entries(assignments).find(([, n]) => n === name);
      return entry ? { name, role: deck[Number(entry[0])] } : null;
    })
    .filter(Boolean);

  const prepareAudio = () => {
    // runs inside the user's tap: unlock the shared audio element + Web Audio, then warm the cache
    narrator.unlock();
    unlockAmbient();
    narrator.setVoice(settings.voice);
    narrator.preload(allClipIds());
  };

  const startNight = () => {
    prepareAudio();
    if (showVolumeHint) {
      markVolumeHintSeen();
      setShowVolumeHint(false);
    }
    dispatch({ type: 'START_NIGHT', players });
    setScreen('narrator');
  };

  const resumeGame = () => {
    const saved = deserialize(loadSavedGameRaw()) || savedGame;
    if (!saved || !isResumable(saved)) {
      restartGame();
      return;
    }
    prepareAudio();
    nameVoice.prepare(settings.voice, saved.players.map((p) => p.name));
    dispatch({ type: 'RESTORE', saved });
    setBoundaryKey((k) => k + 1);
    setScreen('narrator');
  };

  const canResume = Boolean(deserialize(loadSavedGameRaw()));

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
            settings={settings}
            onSettings={updateSettings}
            resume={describeSaved(savedGame)}
            onResume={resumeGame}
          />
        )}
        {screen === 'names' && (
          <NamesScreen
            initialNames={namesForCount(playerCount, names)}
            mode={settings.mode}
            onBack={() => setScreen('playerCount')}
            onConfirm={startDealing}
          />
        )}
        <GameErrorBoundary key={boundaryKey} canResume={canResume} onResume={resumeGame} onReset={restartGame}>
          {screen === 'dealing' && (
            <DealingScreen
              deck={deck}
              names={names}
              assignments={assignments}
              onAssign={assignCard}
              onOpenGameMaster={() => setScreen('gm')}
              onRestart={restartGame}
              mode={settings.mode}
              onStartNight={startNight}
              showVolumeHint={showVolumeHint}
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
          {screen === 'narrator' && (
            <NarratorGame state={game} dispatch={dispatch} settings={settings} onSettings={updateSettings} onRestart={restartGame} />
          )}
        </GameErrorBoundary>
      </div>
    </div>
  );
}

export default App;
