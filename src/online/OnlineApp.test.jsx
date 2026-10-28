// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { linesFor } from '../audio/narrator';

// ---------------------------------------------------------------- mocks
// useRoom: the test owns the socket state; `room.set(patch)` re-renders the Room with it.
const room = vi.hoisted(() => ({ value: null, thenValue: null, set: null, args: [] }));
vi.mock('./useRoom', async () => {
  const { useState } = await import('react');
  return {
    default: function useRoomMock(args) {
      // each Room mount starts a fresh connection: a one-shot value (e.g. a join error) applies to the first only
      const [v, setV] = useState(() => { const first = room.value; if (room.thenValue) { room.value = room.thenValue; room.thenValue = null; } return first; });
      room.set = (patch) => { room.value = { ...room.value, ...patch }; setV(room.value); };
      room.args.push(args);
      return v;
    },
  };
});

const media = vi.hoisted(() => ({ meshes: [], result: { stream: null, error: null }, fail: null }));
vi.mock('./video', () => ({
  getLocalMedia: vi.fn(async () => {
    if (media.fail) throw media.fail;
    return media.result;
  }),
  Mesh: class FakeMesh {
    constructor(opts) {
      this.opts = opts;
      this.onSignal = vi.fn();
      this.sync = vi.fn();
      this.setMedia = vi.fn();
      this.check = vi.fn();
      this.close = vi.fn();
      this.streams = vi.fn(() => ({}));
      media.meshes.push(this);
    }
  },
}));

const audio = vi.hoisted(() => ({ subs: [] }));
vi.mock('../audio/narrator', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    narrator: {
      setVoice: vi.fn(),
      subscribe: vi.fn((fn) => { audio.subs.push(fn); return () => {}; }),
      say: vi.fn(async () => {}),
      stop: vi.fn(),
      unlock: vi.fn(),
    },
  };
});
vi.mock('../audio/nameVoice', () => ({ nameVoice: { prepare: vi.fn(async () => {}) }, speakName: vi.fn() }));
vi.mock('../audio/ambient', () => ({ unlockAmbient: vi.fn() }));
vi.mock('../hooks/useWakeLock', () => ({ default: vi.fn() }));

const { default: OnlineApp, isOnlinePath } = await import('./OnlineApp.jsx');
const { narrator } = await import('../audio/narrator');
const { nameVoice } = await import('../audio/nameVoice');
const { getLocalMedia } = await import('./video');

// ---------------------------------------------------------------- fixtures
const KEY = 'mafia.online.guest';
const GID = 'abcdefghijklmnopqrst';
const SETTINGS = { lang: 'en', voice: 'george', turnSec: 15, discussMin: 3, voteSec: 60, fast: true };
const M = (seat, name, extra = {}) => ({ seat, name, ready: false, connected: true, spectator: false, ...extra });
const MEMBERS = [M('s1', 'Arjun'), M('s2', 'Priya'), M('s3', 'Karthik'), M('s4', 'Meena')];
const names = Object.fromEntries(MEMBERS.map((m) => [m.seat, m.name]));

function lobbyView(extra = {}) {
  return {
    code: 'KQTZ', you: 's1', joined: true, isHost: true, hostSeat: 's1', status: 'lobby', settings: SETTINGS,
    members: MEMBERS, canStart: { ok: false }, serverNow: Date.now(), deal: null, game: null, flow: null, ...extra,
  };
}
function gameView(game, flow, extra = {}) {
  return lobbyView({
    status: 'game', canStart: null, flow,
    game: {
      phase: 'DAY', round: 1, winner: null, night: false, turnRole: null,
      players: MEMBERS.map((m) => ({ seat: m.seat, alive: true, role: null })),
      me: { seat: 's1', role: 'villager', alive: true },
      awake: false, myTurn: false, targets: [], mySelection: null, mafiaPicks: null,
      detectiveLog: null, morning: null, votes: null, vote: null, log: null, ...game,
    },
    ...extra,
  });
}

const fns = () => ({ send: vi.fn(), leave: vi.fn(), retry: vi.fn(), clearError: vi.fn(), serverNow: () => Date.now() });
function setRoom(patch = {}) {
  room.value = { view: null, error: null, fatal: null, online: true, unreachable: false, ...fns(), ...patch };
}
const send = () => room.value.send;
const sent = () => send().mock.calls.map((c) => c[0]);

function named(name = 'Arjun') { localStorage.setItem(KEY, JSON.stringify({ gid: GID, name })); }
async function renderAt(path, view = lobbyView(), patch = {}) {
  window.history.replaceState({}, '', path);
  setRoom({ view, ...patch });
  const r = render(<OnlineApp onExit={vi.fn()} />);
  await act(async () => {}); // let the config fetch + video start settle
  return r;
}

beforeEach(() => {
  localStorage.clear();
  room.args.length = 0;
  room.thenValue = null;
  media.meshes.length = 0;
  media.result = { stream: null, error: null };
  media.fail = null;
  audio.subs.length = 0;
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ google: false, iceServers: [{ urls: 'stun:test' }] }) })));
  window.history.replaceState({}, '', '/online');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

// ---------------------------------------------------------------- routing / name / home
describe('OnlineApp routing', () => {
  it('recognises /online and /r/CODE paths only', () => {
    expect(isOnlinePath('/online')).toBe(true);
    expect(isOnlinePath('/r/KQTZ')).toBe(true);
    expect(isOnlinePath('/r/KQTZ/')).toBe(true);
    expect(isOnlinePath('/r/KQ')).toBe(false);
    expect(isOnlinePath('/')).toBe(false);
  });
});

describe('name screen', () => {
  it('asks a new guest for a name, validates it, and saves it to the device', async () => {
    render(<OnlineApp onExit={vi.fn()} />);
    const input = screen.getByTestId('name-input');
    fireEvent.change(input, { target: { value: '😀' } });
    fireEvent.click(screen.getByTestId('name-save'));
    expect(screen.getByTestId('name-error')).toBeTruthy();
    fireEvent.change(input, { target: { value: 'Priya' } });
    expect(screen.queryByTestId('name-error')).toBeNull(); // typing clears the error
    fireEvent.click(screen.getByTestId('name-save'));
    expect(screen.getByTestId('my-name').textContent).toBe('Priya');
    expect(JSON.parse(localStorage.getItem(KEY)).name).toBe('Priya');
  });

  it('the dice suggests a valid name', () => {
    render(<OnlineApp onExit={vi.fn()} />);
    fireEvent.click(screen.getByTestId('dice'));
    const v = screen.getByTestId('name-input').value;
    expect(v.length).toBeGreaterThan(1);
    fireEvent.click(screen.getByTestId('name-save'));
    expect(screen.getByTestId('my-name').textContent).toBe(v);
  });

  it('offers Google sign-in when the server has it configured', async () => {
    fetch.mockResolvedValue({ json: async () => ({ google: true }) });
    render(<OnlineApp onExit={vi.fn()} />);
    expect(await screen.findByText('Sign in with Google instead')).toBeTruthy();
  });
});

describe('home', () => {
  beforeEach(() => named('Arjun'));

  it('goes back to the local game with the back arrow', () => {
    const onExit = vi.fn();
    render(<OnlineApp onExit={onExit} />);
    fireEvent.click(screen.getByLabelText('Back'));
    expect(onExit).toHaveBeenCalled();
  });

  it('renames the guest from home', () => {
    render(<OnlineApp onExit={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Change name'));
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'Ravi' } });
    fireEvent.click(screen.getByTestId('name-save'));
    expect(screen.getByTestId('my-name').textContent).toBe('Ravi');
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual({ gid: GID, name: 'Ravi' });
  });

  it('cleans the join code and joins /r/CODE as a guest', () => {
    setRoom();
    render(<OnlineApp onExit={vi.fn()} />);
    const input = screen.getByTestId('join-code');
    fireEvent.change(input, { target: { value: 'kq1tzz' } });
    expect(input.value).toBe('KQTZ');
    fireEvent.change(input, { target: { value: 'KQ' } });
    expect(screen.getByTestId('join-btn').disabled).toBe(true);
    fireEvent.submit(input.closest('form'));
    expect(room.args).toHaveLength(0); // incomplete code: nothing happens
    fireEvent.change(input, { target: { value: 'KQTZ' } });
    fireEvent.click(screen.getByTestId('join-btn'));
    expect(window.location.pathname).toBe('/r/KQTZ');
    expect(room.args.at(-1)).toMatchObject({ code: 'KQTZ', gid: GID, name: 'Arjun' });
    expect(room.args.at(-1).create).toBeFalsy();
  });

  it('creates a room with a fresh code (fast flag from the URL)', () => {
    setRoom();
    window.history.replaceState({}, '', '/online?fast=1');
    render(<OnlineApp onExit={vi.fn()} />);
    fireEvent.click(screen.getByTestId('create-room'));
    const args = room.args.at(-1);
    expect(args).toMatchObject({ create: true, fast: true });
    expect(args.code).toMatch(/^[A-Z]{4}$/);
    expect(window.location.pathname).toBe(`/r/${args.code}`);
    expect(window.location.search).toBe('?fast=1');
  });

  it('browser back to /online returns home', async () => {
    await renderAt('/r/KQTZ');
    expect(screen.getByTestId('room')).toBeTruthy();
    window.history.replaceState({}, '', '/online');
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(screen.getByTestId('create-room')).toBeTruthy();
  });

  it('unlocks audio on the first tap', () => {
    render(<OnlineApp onExit={vi.fn()} />);
    fireEvent.pointerDown(document.body);
    expect(narrator.unlock).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- room states
describe('room connection states', () => {
  beforeEach(() => named('Arjun'));

  it('shows connecting / joining until the first view arrives', async () => {
    await renderAt('/r/KQTZ', null, { online: false });
    expect(screen.getByTestId('connecting').textContent).toBe('Connecting…');
    act(() => room.set({ online: true }));
    expect(screen.getByTestId('connecting').textContent).toBe('Joining…');
  });

  it('explains an unreachable server and retries', async () => {
    await renderAt('/r/KQTZ', null, { online: false, unreachable: true });
    expect(screen.getByTestId('server-unreachable').getAttribute('role')).toBe('alert');
    fireEvent.click(screen.getByTestId('server-retry'));
    expect(room.value.retry).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByTestId('create-room')).toBeTruthy();
  });

  it('a taken name on join offers suggestions and rejoins with the picked one', async () => {
    await renderAt('/r/KQTZ', { ...lobbyView(), joined: false }, { error: { action: 'join', code: 'name_taken', suggestions: ['Arjun K', 'Arjun 2'], at: 1 } });
    expect(screen.getByTestId('join-name-error')).toBeTruthy();
    expect(screen.getByTestId('name-error').textContent).toBe('That name is already taken in this room.');
    fireEvent.click(screen.getAllByTestId('name-suggestion')[1]);
    expect(room.value.clearError).toHaveBeenCalled();
    expect(sent()).toContainEqual({ t: 'join', name: 'Arjun 2' });
    expect(room.args.at(-1).name).toBe('Arjun 2'); // reconnects use the new name
  });

  it('join error Back goes home', async () => {
    await renderAt('/r/KQTZ', { ...lobbyView(), joined: false }, { error: { action: 'join', code: 'room_full', at: 1 } });
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByTestId('create-room')).toBeTruthy();
  });

  it('a create that collided with an existing room retries with a new code', async () => {
    named('Arjun');
    window.history.replaceState({}, '', '/r/KQTZ');
    setRoom({ error: { action: 'join', code: 'room_exists', at: 1 } });
    room.thenValue = { ...room.value, error: null };
    render(<OnlineApp onExit={vi.fn()} />);
    await waitFor(() => expect(window.location.pathname).not.toBe('/r/KQTZ'));
    expect(window.location.pathname).toMatch(/^\/r\/[A-Z]{4}$/);
  });

  it('being kicked returns home with the reason', async () => {
    await renderAt('/r/KQTZ');
    act(() => room.set({ fatal: 'kicked' }));
    expect(screen.getByTestId('home-notice').textContent).toBe('The host removed you from this room.');
    expect(window.location.pathname).toBe('/online');
  });

  it('keeps the shareable URL and the stored name in sync with the room', async () => {
    await renderAt('/r/kqtz', lobbyView({ members: [M('s1', 'Arjun K'), ...MEMBERS.slice(1)] }));
    expect(window.location.pathname).toBe('/r/KQTZ');
    expect(JSON.parse(localStorage.getItem(KEY)).name).toBe('Arjun K');
  });

  it('shows a short-lived toast for action errors', async () => {
    await renderAt('/r/KQTZ', lobbyView(), { error: { action: 'pick', code: 'card_taken', at: Date.now() } });
    expect(screen.getByTestId('toast').textContent).toBe('Someone just took that card. Pick another one.');
  });
});

// ---------------------------------------------------------------- lobby
describe('lobby', () => {
  beforeEach(() => named('Arjun'));

  it('host sees players, invite link + QR, settings, and can remove a player', async () => {
    await renderAt('/r/KQTZ', lobbyView({ members: [...MEMBERS.slice(0, 3), M('s4', 'Meena', { connected: false })] }));
    const rows = screen.getAllByTestId('lobby-player');
    expect(rows.map((r) => r.dataset.name)).toEqual(['Arjun', 'Priya', 'Karthik', 'Meena']);
    expect(rows[0].textContent).toContain('(you)');
    expect(rows[3].textContent).toContain('offline');
    expect(screen.getByTestId('room-code').textContent).toBe('KQTZ');
    expect(screen.getByTestId('invite-qr').innerHTML).toContain('<svg');
    fireEvent.click(screen.getByLabelText('Remove Priya'));
    expect(sent()).toContainEqual({ t: 'kick', seat: 's2' });
    fireEvent.change(screen.getByTestId('set-vote'), { target: { value: '90' } });
    fireEvent.change(screen.getByTestId('set-lang'), { target: { value: 'ta' } });
    expect(sent()).toContainEqual({ t: 'settings', patch: { voteSec: 90 } });
    expect(sent()).toContainEqual({ t: 'settings', patch: { lang: 'ta' } });
    expect(screen.getByTestId('start-game').textContent).toBe('Waiting for everyone to be ready');
  });

  it('start is enabled only when the room can start', async () => {
    await renderAt('/r/KQTZ', lobbyView({ members: MEMBERS.slice(0, 2) }));
    expect(screen.getByTestId('start-game').textContent).toBe('Waiting for 4+ players');
    act(() => room.set({ view: lobbyView({ canStart: { ok: true } }) }));
    fireEvent.click(screen.getByTestId('start-game'));
    expect(sent()).toContainEqual({ t: 'start' });
  });

  it('copies the invite link', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    await renderAt('/r/KQTZ');
    await act(async () => { fireEvent.click(screen.getByTestId('copy-link')); });
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/r/KQTZ`);
    expect(screen.getByTestId('copy-link').textContent).toContain('Copied');
  });

  it('a player toggles ready and settings are read-only', async () => {
    await renderAt('/r/KQTZ', lobbyView({ you: 's2', isHost: false }));
    fireEvent.click(screen.getByTestId('ready-toggle'));
    expect(sent()).toContainEqual({ t: 'ready', ready: true });
    expect(screen.getByTestId('set-vote').disabled).toBe(true);
    expect(screen.queryByTestId('start-game')).toBeNull();
    expect(screen.queryByTestId('kick')).toBeNull();
    act(() => room.set({ view: lobbyView({ you: 's2', isHost: false, members: [M('s1', 'Arjun'), M('s2', 'Priya', { ready: true })] }) }));
    expect(screen.getByTestId('ready-toggle').textContent).toBe("I'm ready ✓");
    fireEvent.click(screen.getByTestId('ready-toggle'));
    expect(sent()).toContainEqual({ t: 'ready', ready: false });
  });

  it('renames in the lobby, and shows the server\'s rename error with suggestions', async () => {
    await renderAt('/r/KQTZ');
    fireEvent.click(screen.getByTestId('rename'));
    expect(room.value.clearError).toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'Ravi' } });
    fireEvent.click(screen.getByTestId('name-save'));
    expect(sent()).toContainEqual({ t: 'rename', name: 'Ravi' });
    expect(screen.queryByTestId('name-input')).toBeNull();
    fireEvent.click(screen.getByTestId('rename'));
    act(() => room.set({ error: { action: 'rename', code: 'name_taken', suggestions: ['Ravi K'], at: Date.now() } }));
    expect(screen.getByTestId('name-error').textContent).toBe('That name is already taken in this room.');
    fireEvent.click(screen.getByTestId('name-suggestion'));
    expect(sent()).toContainEqual({ t: 'rename', name: 'Ravi K' });
  });
});

// ---------------------------------------------------------------- leave
describe('leave room', () => {
  beforeEach(() => named('Arjun'));

  it('asks first: Stay, Escape and a backdrop tap keep you in the room', async () => {
    await renderAt('/r/KQTZ');
    fireEvent.click(screen.getByTestId('leave'));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('You can join again later with the room code.');
    expect(document.activeElement).toBe(screen.getByTestId('leave-stay')); // safe default focused
    fireEvent.click(screen.getByTestId('leave-stay'));
    await waitFor(() => expect(screen.queryByTestId('leave-confirm')).toBeNull());
    fireEvent.click(screen.getByTestId('leave'));
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('leave-confirm')).toBeNull());
    fireEvent.click(screen.getByTestId('leave'));
    fireEvent.click(within(screen.getByTestId('leave-confirm')).getByText('Leave room?')); // inside the panel: stays open
    expect(screen.getByTestId('leave-confirm')).toBeTruthy();
    fireEvent.click(screen.getByTestId('leave-confirm'));
    await waitFor(() => expect(screen.queryByTestId('leave-confirm')).toBeNull());
    expect(room.value.leave).not.toHaveBeenCalled();
  });

  it('Leave tells the server, hangs up video and narration, and goes home keeping the identity', async () => {
    await renderAt('/r/KQTZ');
    await waitFor(() => expect(media.meshes).toHaveLength(1));
    fireEvent.click(screen.getByTestId('leave'));
    fireEvent.click(screen.getByTestId('leave-confirm-btn'));
    expect(room.value.leave).toHaveBeenCalledTimes(1);
    expect(media.meshes[0].close).toHaveBeenCalled();
    expect(narrator.stop).toHaveBeenCalled();
    expect(window.location.pathname).toBe('/online');
    expect(screen.getByTestId('my-name').textContent).toBe('Arjun');
    expect(screen.queryByTestId('home-notice')).toBeNull();
    expect(JSON.parse(localStorage.getItem(KEY)).gid).toBe(GID);
  });

  it('warns that leaving mid-game counts as being out', async () => {
    await renderAt('/r/KQTZ', gameView({}, { step: 'discuss', deadline: Date.now() + 60_000 }));
    fireEvent.click(screen.getByTestId('leave'));
    expect(screen.getByRole('alertdialog').textContent).toContain("You'll be out of this game");
  });
});

// ---------------------------------------------------------------- deal
describe('card pick', () => {
  beforeEach(() => named('Arjun'));
  const deal = (d) => lobbyView({
    status: 'deal', canStart: null,
    deal: { cards: [0, 1, 2, 3].map((i) => ({ index: i, takenBy: null })), myCard: null, myRole: null, seen: [], seats: ['s1', 's2', 's3', 's4'], allPicked: false, ...d },
  });

  it('spreads face-down cards; taken ones are marked; tapping picks', async () => {
    await renderAt('/r/KQTZ', deal({ cards: [{ index: 0, takenBy: 's2' }, { index: 1, takenBy: null }, { index: 2, takenBy: null }, { index: 3, takenBy: null }] }));
    const cards = screen.getAllByTestId('pick-card');
    expect(cards.map((c) => c.dataset.taken)).toEqual(['1', '0', '0', '0']);
    fireEvent.click(cards[2].firstChild);
    expect(sent()).toContainEqual({ t: 'pick', index: 2 });
    expect(screen.getByText('1/4 cards taken · 0 seen')).toBeTruthy();
  });

  it('press-and-hold reveals the role; then I have seen my card', async () => {
    await renderAt('/r/KQTZ', deal({ myCard: 1, myRole: 'detective' }));
    const card = screen.getByTestId('my-card');
    expect(screen.queryByTestId('seen-btn')).toBeNull();
    fireEvent.pointerDown(card, { pointerId: 1 });
    expect(card.dataset.holding).toBe('1');
    expect(screen.getByTestId('role-name').textContent).toBe('Detective');
    fireEvent.pointerUp(card);
    expect(card.dataset.holding).toBe('0');
    expect(screen.queryByTestId('role-name')).toBeNull();
    fireEvent.click(screen.getByTestId('seen-btn'));
    expect(sent()).toContainEqual({ t: 'seen' });
    act(() => room.set({ view: deal({ myCard: 1, myRole: 'detective', seen: ['s1'] }) }));
    expect(screen.getByTestId('waiting-others')).toBeTruthy();
  });

  it('host can start the night once all cards are picked', async () => {
    await renderAt('/r/KQTZ', deal({ myCard: 0, myRole: 'mafia', allPicked: true, seen: ['s1'] }));
    fireEvent.click(screen.getByTestId('force-night'));
    expect(sent()).toContainEqual({ t: 'forceNight' });
  });

  it('a spectator is told they can play the next game', async () => {
    await renderAt('/r/KQTZ', lobbyView({ status: 'deal', canStart: null, deal: null }));
    expect(screen.getByText(/You're watching this game/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------- game screens
describe('game', () => {
  beforeEach(() => named('Arjun'));

  it('night, not your turn: eyes closed, cameras off note', async () => {
    await renderAt('/r/KQTZ', gameView({ phase: 'MAFIA_TURN', night: true, turnRole: 'mafia' }, { step: 'open', deadline: Date.now() + 15_000 }));
    expect(screen.getByTestId('night-screen').textContent).toContain('The Mafia is awake.');
    expect(screen.getByTestId('night-media-note')).toBeTruthy();
    expect(screen.getByTestId('phase').dataset.phase).toBe('MAFIA_TURN');
    expect(screen.getByTestId('countdown').textContent).toMatch(/^0:1[45]$/);
  });

  it('night, your turn: pick a target; Mafia see each other\'s picks', async () => {
    await renderAt('/r/KQTZ', gameView({
      phase: 'MAFIA_TURN', night: true, turnRole: 'mafia', awake: true, myTurn: true, me: { seat: 's1', role: 'mafia', alive: true },
      targets: [{ seat: 's2', disabled: false }, { seat: 's3', disabled: true, reason: 'Mafia' }], mySelection: 's2', mafiaPicks: { s3: 's2' },
    }, { step: 'open', deadline: Date.now() + 15_000 }));
    expect(screen.getByTestId('night-action').textContent).toContain('Choose who the Mafia kill');
    const [priya, karthik] = screen.getAllByTestId('target');
    expect(priya.textContent).toContain('← Karthik');
    expect(karthik.disabled).toBe(true);
    fireEvent.click(priya);
    expect(sent()).toContainEqual({ t: 'select', target: 's2' });
  });

  it('detective gets only "Choice locked in" at night, never the answer; the day log lists names only', async () => {
    const night = (mySelection) => gameView({
      phase: 'DETECTIVE_TURN', night: true, turnRole: 'detective', awake: true, myTurn: true, me: { seat: 's1', role: 'detective', alive: true },
      targets: [{ seat: 's2', disabled: false }, { seat: 's3', disabled: false }], mySelection,
    }, { step: 'open', deadline: Date.now() + 15_000 });
    await renderAt('/r/KQTZ', night(null));
    expect(screen.queryByTestId('detective-locked')).toBeNull();
    act(() => room.set({ view: night('s2') }));
    expect(screen.getByTestId('detective-locked').textContent).toBe('Choice locked in');
    expect(screen.queryByTestId('detective-result')).toBeNull();
    expect(screen.getByTestId('night-action').textContent).not.toMatch(/IS Mafia|not Mafia/);
    expect(screen.getAllByTestId('target').every((b) => b.disabled)).toBe(true);
    act(() => room.set({ view: gameView({ me: { seat: 's1', role: 'detective', alive: true }, detectiveLog: [{ round: 1, target: 's2' }] }, { step: 'discuss', deadline: Date.now() + 60_000 }) }));
    expect(screen.getByText('Your checks: Priya')).toBeTruthy();
  });

  it('morning news and discussion; host can skip to the vote', async () => {
    await renderAt('/r/KQTZ', gameView({ morning: { victim: 's3' } }, { step: 'morning', deadline: null }));
    expect(screen.getByTestId('morning').textContent).toBe('Karthik was killed in the night.');
    act(() => room.set({ view: gameView({ morning: { victim: null, saved: true } }, { step: 'discuss', deadline: Date.now() + 60_000 }) }));
    expect(screen.getByTestId('morning').textContent).toContain('the Doctor saved them');
    fireEvent.click(screen.getByTestId('skip-discussion'));
    expect(sent()).toContainEqual({ t: 'skipDiscussion' });
  });

  it('morning never names the Mafia the Detective caught (voice only); a wrong guess shows nothing', async () => {
    await renderAt('/r/KQTZ', gameView({ morning: { victim: 's3', caught: 's2' } }, { step: 'morning', deadline: null }));
    expect(screen.queryByTestId('morning-caught')).toBeNull();
    expect(screen.getByTestId('morning').textContent).not.toMatch(/Priya|Detective|caught/);
    act(() => room.set({ view: gameView({ morning: { victim: 's3', caught: null } }, { step: 'morningRead', deadline: null }) }));
    expect(screen.queryByTestId('morning-caught')).toBeNull();
  });

  it('game over straight from the morning says the Detective caught the last Mafia', async () => {
    await renderAt('/r/KQTZ', gameView({ phase: 'END', winner: 'villagers', morning: { victim: null, caught: 's2' }, vote: null }, { step: 'end', deadline: null }));
    expect(screen.getByTestId('winner').textContent).toBe('The village wins');
    expect(screen.getByTestId('end-caught').textContent).toBe('The Detective caught Priya.');
    // a game that ended on a vote does not repeat an older morning's catch
    act(() => room.set({ view: gameView({ phase: 'END', winner: 'villagers', morning: { victim: null, caught: 's2' }, vote: { out: 's4', tie: false } }, { step: 'end', deadline: null }) }));
    expect(screen.queryByTestId('end-caught')).toBeNull();
  });

  it('voting: open votes, vote and skip; you cannot vote for yourself', async () => {
    await renderAt('/r/KQTZ', gameView({ phase: 'VOTE', votes: { s2: 's3', s3: 'skip' } }, { step: 'voting', deadline: Date.now() + 60_000 }));
    const targets = screen.getAllByTestId('vote-target');
    expect(targets.find((b) => b.dataset.name === 'Arjun').disabled).toBe(true);
    expect(targets.find((b) => b.dataset.name === 'Karthik').textContent).toContain('1 vote');
    fireEvent.click(targets.find((b) => b.dataset.name === 'Priya'));
    fireEvent.click(screen.getByTestId('vote-skip'));
    expect(sent()).toEqual(expect.arrayContaining([{ t: 'vote', target: 's2' }, { t: 'vote', target: 'skip' }]));
    expect(screen.getByTestId('vote-list').textContent).toContain('Priya → Karthik');
    expect(screen.getByTestId('vote-list').textContent).toContain('Karthik → skip');
  });

  it('dead players cannot vote and are told to watch', async () => {
    await renderAt('/r/KQTZ', gameView({ phase: 'VOTE', votes: {}, me: { seat: 's1', role: 'villager', alive: false }, players: MEMBERS.map((m) => ({ seat: m.seat, alive: m.seat !== 's1', role: null })) }, { step: 'voting', deadline: Date.now() + 60_000 }));
    expect(screen.getByTestId('you-are-out')).toBeTruthy();
    expect(screen.getByTestId('vote-skip').disabled).toBe(true);
  });

  it('vote result names who is out', async () => {
    await renderAt('/r/KQTZ', gameView({ phase: 'VOTE', vote: { out: 's4' } }, { step: 'voteResult', deadline: null }));
    expect(screen.getByTestId('vote-result').textContent).toBe('Meena is voted out.');
    act(() => room.set({ view: gameView({ phase: 'VOTE', vote: { out: null } }, { step: 'voteRead', deadline: null }) }));
    expect(screen.getByTestId('vote-result').textContent).toBe('No one is voted out.');
  });

  it('game over shows every role; host can rematch or go back to the lobby', async () => {
    const players = MEMBERS.map((m, i) => ({ seat: m.seat, alive: i !== 1, role: i === 1 ? 'mafia' : 'villager' }));
    await renderAt('/r/KQTZ', gameView({ phase: 'END', winner: 'villagers', players }, { step: 'over', deadline: null }));
    expect(screen.getByTestId('winner').textContent).toBe('The village wins');
    fireEvent.click(screen.getByTestId('rematch'));
    fireEvent.click(screen.getByTestId('to-lobby'));
    expect(sent()).toEqual(expect.arrayContaining([{ t: 'rematch' }, { t: 'lobby' }]));
    fireEvent.click(screen.getByTestId('leave'));
    expect(screen.getByRole('alertdialog').textContent).toContain('join again later'); // a finished game: no penalty
  });

  it('players see who won and wait for the host', async () => {
    await renderAt('/r/KQTZ', gameView({ phase: 'END', winner: 'mafia' }, { step: 'over', deadline: null }, { isHost: false, you: 's2' }));
    expect(screen.getByTestId('winner').textContent).toBe('The Mafia win');
    expect(screen.getByText('The host can start a rematch.')).toBeTruthy();
  });

  it('a late joiner is told a game is in progress', async () => {
    await renderAt('/r/KQTZ', lobbyView({ status: 'game', game: null, canStart: null }));
    expect(screen.getByText(/A game is in progress/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------- narration
describe('narration', () => {
  beforeEach(() => named('Arjun'));

  it('the host speaks each cue once and acks it when done', async () => {
    const cue = { id: 7, clips: ['intro', { name: 's2' }] };
    await renderAt('/r/KQTZ', gameView({ phase: 'NIGHT_INTRO', night: true }, { step: 'intro', deadline: null, cue }));
    expect(narrator.say).toHaveBeenCalledWith(['intro', { name: 'Priya' }]);
    expect(sent()).toContainEqual({ t: 'cueDone', id: 7 });
    act(() => room.set({ view: gameView({ phase: 'NIGHT_INTRO', night: true, round: 1 }, { step: 'intro', deadline: null, cue }) }));
    expect(narrator.say).toHaveBeenCalledTimes(1); // same cue id: not replayed
  });

  it('a cue that fails to play is still acked so the table moves on', async () => {
    narrator.say.mockRejectedValueOnce(new Error('autoplay blocked'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await renderAt('/r/KQTZ', gameView({}, { step: 'discussCue', deadline: null, cue: { id: 9, clips: ['x'] } }));
    expect(sent()).toContainEqual({ t: 'cueDone', id: 9 });
    expect(warn).toHaveBeenCalledWith('[narrator] cue failed', expect.any(Error));
  });

  it('players get the caption text instead of audio', async () => {
    const lines = linesFor('george');
    const id = Object.keys(lines).find((k) => typeof lines[k] === 'string');
    await renderAt('/r/KQTZ', gameView({}, { step: 'discussCue', deadline: null, cue: { id: 3, clips: [id, { name: 's3' }] } }, { isHost: false, you: 's2' }));
    expect(narrator.say).not.toHaveBeenCalled();
    expect(screen.getByTestId('caption').textContent).toBe(`${lines[id]} Karthik`.trim());
  });

  it('the host shows its own narrator captions and preloads spoken names (not in fast rooms)', async () => {
    await renderAt('/r/KQTZ', gameView({}, { step: 'discuss', deadline: Date.now() + 1000 }, { settings: { ...SETTINGS, fast: false } }));
    expect(nameVoice.prepare).toHaveBeenCalledWith('george', ['Arjun', 'Priya', 'Karthik', 'Meena']);
    act(() => audio.subs.at(-1)('Night falls'));
    expect(screen.getByTestId('caption').textContent).toBe('Night falls');
  });

  it('a failed name-voice download is only logged', async () => {
    nameVoice.prepare.mockRejectedValueOnce(new Error('offline'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await renderAt('/r/KQTZ', gameView({}, { step: 'discuss', deadline: Date.now() + 1000 }, { settings: { ...SETTINGS, fast: false } }));
    await waitFor(() => expect(warn).toHaveBeenCalledWith('[names] voice prepare failed', expect.any(Error)));
  });
});

// ---------------------------------------------------------------- video wiring
describe('video', () => {
  beforeEach(() => named('Arjun'));
  const cam = () => {
    const t = (kind) => ({ kind, enabled: true, stop: vi.fn() });
    const tracks = [t('audio'), t('video')];
    return { tracks, getTracks: () => tracks, getVideoTracks: () => [tracks[1]], getAudioTracks: () => [tracks[0]] };
  };

  it('starts the mesh with the server ICE config and syncs the connected seats', async () => {
    const stream = cam();
    media.result = { stream, error: null };
    await renderAt('/r/KQTZ', lobbyView({ members: [...MEMBERS.slice(0, 3), M('s4', 'Meena', { connected: false })] }));
    await waitFor(() => expect(media.meshes).toHaveLength(1));
    const mesh = media.meshes[0];
    expect(mesh.opts).toMatchObject({ self: 's1', iceServers: [{ urls: 'stun:test' }] });
    expect(mesh.local).toBe(stream);
    expect(mesh.sync).toHaveBeenLastCalledWith(['s1', 's2', 's3']);
    mesh.opts.send('s2', { sdp: 1 });
    expect(sent()).toContainEqual({ t: 'rtc', to: 's2', data: { sdp: 1 } });
    // the mesh reports a change -> tiles re-read the streams
    act(() => mesh.opts.onChange());
    expect(mesh.streams).toHaveBeenCalled();
  });

  it('queues signals that arrive before the camera is ready, then delivers them in order', async () => {
    let release;
    getLocalMedia.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    await renderAt('/r/KQTZ');
    const { onRtc } = room.args.at(-1);
    onRtc('s2', { n: 1 });
    onRtc('s2', { n: 2 });
    await act(async () => { release({ stream: null, error: null }); });
    const mesh = media.meshes[0];
    expect(mesh.onSignal.mock.calls).toEqual([['s2', { n: 1 }], ['s2', { n: 2 }]]);
    onRtc('s3', { n: 3 });
    expect(mesh.onSignal).toHaveBeenLastCalledWith('s3', { n: 3 });
  });

  it('mic and camera toggles, and night switches both off', async () => {
    media.result = { stream: cam(), error: null };
    await renderAt('/r/KQTZ');
    await waitFor(() => expect(screen.getByTestId('toggle-mic').disabled).toBe(false));
    const mesh = media.meshes[0];
    fireEvent.click(screen.getByTestId('toggle-mic'));
    expect(mesh.setMedia).toHaveBeenLastCalledWith({ cam: true, mic: false });
    fireEvent.click(screen.getByTestId('toggle-cam'));
    expect(mesh.setMedia).toHaveBeenLastCalledWith({ cam: false, mic: false });
    fireEvent.click(screen.getByTestId('toggle-mic'));
    fireEvent.click(screen.getByTestId('toggle-cam'));
    expect(mesh.setMedia).toHaveBeenLastCalledWith({ cam: true, mic: true });
    act(() => room.set({ view: gameView({ phase: 'MAFIA_TURN', night: true }, { step: 'open', deadline: Date.now() + 1000 }) }));
    expect(mesh.setMedia).toHaveBeenLastCalledWith({ cam: false, mic: false });
  });

  it.each([
    ['denied', 'Camera blocked: others can still see you as a name tile'],
    ['no_camera', 'No camera found'],
    ['unavailable', 'Video unavailable'],
  ])('explains media error %s', async (error, text) => {
    media.result = { stream: null, error };
    await renderAt('/r/KQTZ');
    expect((await screen.findByTestId('media-error')).textContent).toBe(text);
    expect(screen.getByTestId('toggle-mic').disabled).toBe(true);
  });

  it('falls back to default ICE when the config fetch fails, and reports a failed start', async () => {
    fetch.mockRejectedValue(new Error('offline'));
    await renderAt('/r/KQTZ');
    await waitFor(() => expect(media.meshes).toHaveLength(1));
    expect(media.meshes[0].opts.iceServers).toBeUndefined();
    cleanup();
    media.fail = new Error('no WebRTC');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await renderAt('/r/KQTZ');
    expect((await screen.findByTestId('media-error')).textContent).toBe('Video unavailable');
    expect(warn).toHaveBeenCalledWith('[video] could not start', media.fail);
  });

  it('stops a camera that arrives after the room was left', async () => {
    const stream = cam();
    let release;
    getLocalMedia.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    await renderAt('/r/KQTZ');
    fireEvent.click(screen.getByTestId('leave'));
    fireEvent.click(screen.getByTestId('leave-confirm-btn'));
    await act(async () => { release({ stream, error: null }); });
    expect(stream.tracks.every((t) => t.stop.mock.calls.length === 1)).toBe(true);
    expect(media.meshes).toHaveLength(0);
  });

  it('runs the connection watchdog every 3 s', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await renderAt('/r/KQTZ');
    await waitFor(() => expect(media.meshes).toHaveLength(1));
    act(() => vi.advanceTimersByTime(3000));
    expect(media.meshes[0].check).toHaveBeenCalledTimes(1);
  });
});
