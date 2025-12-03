import './EndScreen.css';

function EndScreen({ onRestart }) {
  return (
    <div className="end-screen">
      <div className="end-panel">
        <h2 className="end-title">🎉 All Roles Assigned!</h2>
        <p className="end-subtitle">Game is ready to begin</p>
        <button onClick={onRestart} className="btn btn-restart">
          Start New Game
        </button>
      </div>
    </div>
  );
}

export default EndScreen;
