import { Component } from 'react';
import { PrimaryButton } from './ui';

/** Catches render errors in the game screens and offers to resume from the saved game. */
export default class GameErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    // keep a trace for debugging without crashing the page
    console.warn('Game screen crashed:', error?.message);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const { canResume, onResume, onReset } = this.props;
    return (
      <div role="alert" className="min-h-screen flex flex-col items-center justify-center gap-6 p-6 text-center">
        <h2 className="text-3xl font-bold text-white">Something went wrong</h2>
        <p className="text-violet-200/70 max-w-sm">
          {canResume ? 'Your game was saved. You can pick up where you left off.' : 'Sorry about that.'}
        </p>
        <div className="w-full max-w-xs flex flex-col gap-3">
          {canResume && (
            <PrimaryButton type="button" onClick={() => { this.setState({ error: null }); onResume(); }}>
              Resume game
            </PrimaryButton>
          )}
          <button
            type="button"
            onClick={() => { this.setState({ error: null }); onReset(); }}
            className="py-3 rounded-lg border border-white/15 text-violet-200"
          >
            Start over
          </button>
        </div>
      </div>
    );
  }
}
