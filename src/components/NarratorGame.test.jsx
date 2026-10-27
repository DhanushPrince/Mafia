// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useReducer } from 'react';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import NarratorGame from './NarratorGame';
import { reducer, createInitialState, PHASES } from '../game/engine';
import { narrator } from '../audio/narrator';

vi.mock('../audio/narrator', () => ({
  narrator: {
    voice: 'george',
    subscribe: vi.fn(() => () => {}),
    say: vi.fn(async () => {}),
    stop: vi.fn(),
  },
}));
vi.mock('../audio/nameVoice', () => ({ nameVoice: { get: vi.fn(() => null) }, canSpeakName: vi.fn(() => false) }));
vi.mock('../audio/ambient', () => ({ startAmbient: vi.fn(), stopAmbient: vi.fn() }));
vi.mock('../hooks/useWakeLock', () => ({ default: vi.fn() }));

afterEach(cleanup);

const run = (state, ...actions) => actions.reduce(reducer, state);
const start = (players) => run(createInitialState(), { type: 'NEW_GAME' }, { type: 'START_NIGHT', players });
/** NIGHT_INTRO -> MORNING with the given taps. */
const night = (s, { kill, check }) => run(
  s,
  { type: 'ADVANCE' }, { type: 'SELECT', name: kill }, { type: 'ADVANCE' }, { type: 'ADVANCE' },
  { type: 'SELECT', name: check }, { type: 'ADVANCE' },
);

const FOUR = [
  { name: 'Alice', role: 'mafia' },
  { name: 'Bob', role: 'villager' },
  { name: 'Carol', role: 'doctor' },
  { name: 'Dave', role: 'detective' },
];
const SIX = [
  { name: 'M1', role: 'mafia' },
  { name: 'M2', role: 'mafia' },
  { name: 'Doc', role: 'doctor' },
  { name: 'Det', role: 'detective' },
  { name: 'V1', role: 'villager' },
  { name: 'V2', role: 'villager' },
];

/** Real reducer behind the component, so its buttons and CHECK_WIN effect drive the engine. */
function Harness({ initial }) {
  const [state, dispatch] = useReducer(reducer, initial);
  return <NarratorGame state={state} dispatch={dispatch} settings={{ muted: false, ambient: false }} onSettings={() => {}} onRestart={() => {}} />;
}

describe('NarratorGame: detective catch', () => {
  it('the catch is voice-only at morning (no text names the caught Mafia); "See who won" goes straight to the village win and the log shows the catch', async () => {
    const morning = night(start(FOUR), { kill: 'Bob', check: 'Alice' });
    expect(morning.phase).toBe(PHASES.MORNING);
    narrator.say.mockClear();
    render(<Harness initial={morning} />);
    expect(screen.getByTestId('morning-victim').textContent).toBe('Bob');
    // ADR 0013: only the narrator's voice announces the catch
    const panel = screen.getByTestId('morning-result').parentElement.textContent;
    expect(panel).not.toContain('Alice');
    expect(panel).not.toMatch(/Detective|caught|Mafia/);
    expect(screen.queryByTestId('morning-detective-caught')).toBeNull();
    expect(screen.queryByTestId('morning-caught')).toBeNull();
    expect(screen.queryByTestId('morning-detective-found')).toBeNull();
    expect(narrator.say).toHaveBeenCalledWith(expect.arrayContaining(['morning', 'detective_found']));
    expect(screen.queryByRole('button', { name: 'Continue to discussion' })).toBeNull();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'See who won' })); });
    expect(screen.getByTestId('narrator-game').dataset.phase).toBe(PHASES.END);
    expect(screen.getByTestId('winner').dataset.winner).toBe('villagers');
    expect(screen.queryByTestId('discuss-timer')).toBeNull();
    const log = screen.getByTestId('game-log').textContent;
    expect(log).toContain('Mafia killed Bob');
    expect(log).toContain('Detective checked Alice: Mafia - caught and out');
  });

  it('catching one of two Mafia keeps the game going to the discussion', async () => {
    const morning = night(start(SIX), { kill: 'V1', check: 'M2' });
    render(<Harness initial={morning} />);
    expect(screen.queryByTestId('morning-caught')).toBeNull();
    expect(screen.getByTestId('morning-result').parentElement.textContent).not.toContain('M2');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Continue to discussion' })); });
    expect(screen.getByTestId('narrator-game').dataset.phase).toBe(PHASES.DAY_DISCUSS);
    expect(screen.getByTestId('discuss-timer')).toBeTruthy();
  });

  it('a wrong guess shows no Detective panel and the log has no catch', () => {
    const morning = night(start(SIX), { kill: 'V1', check: 'V2' });
    render(<Harness initial={morning} />);
    expect(screen.queryByTestId('morning-detective-caught')).toBeNull();
    expect(screen.queryByTestId('morning-detective-found')).toBeNull();
    cleanup();
    const ended = { ...morning, phase: PHASES.END, winner: 'mafia' };
    render(<Harness initial={ended} />);
    const log = screen.getByTestId('game-log').textContent;
    expect(log).toContain('Detective checked V2: not Mafia');
    expect(log).not.toContain('caught');
  });

  it('a found Mafia who is not caught (already dead) shows no Detective text either; a missing morning shows no one died', () => {
    const base = night(start(SIX), { kill: 'V1', check: 'V2' });
    render(<Harness initial={{ ...base, morning: { victim: 'M1', attacked: true, saved: false, detectiveFoundMafia: true, caught: null } }} />);
    expect(screen.queryByTestId('morning-detective-found')).toBeNull();
    expect(screen.queryByTestId('morning-detective-caught')).toBeNull();
    cleanup();
    render(<Harness initial={{ ...base, morning: null }} />);
    expect(screen.getByTestId('morning-victim').textContent).toBe('No one died');
    expect(screen.getByRole('button', { name: 'Continue to discussion' })).toBeTruthy();
  });
});
