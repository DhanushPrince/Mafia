/**
 * Online room state machine (pure, no I/O). Runs inside the room Durable Object; unit-tested in Node.
 *
 * A room goes  lobby -> deal (card pick) -> game (engine phases) -> END -> rematch (deal) | lobby.
 * The game itself is `src/game/engine.js` unchanged. Engine player `name` is the player's SEAT ID,
 * so names never collide and are never used as identity; display names live in `room.members`.
 *
 * Time is server-owned: `room.flow` is the current step of the narration timeline
 * ({ step, deadline, cue }). The Durable Object sets an alarm at `nextAlarm(room)` and calls
 * `tick(room, now)`; the host phone acks narration with `cueDone` so a step can end early.
 *
 * Every function returns a new room (or the same object when nothing changed) plus nothing else;
 * what each seat may see is computed by `viewFor(room, seat)`.
 */
import {
  reducer, PHASES, isTurnPhase, currentTurnRole, selectTargets, entryClips, exitClips, voteClips, teamOf, createInitialState,
} from '../game/engine.js';
import { generateDeck, MIN_PLAYERS, MAX_PLAYERS } from '../game/roles.js';
import { normalizeTimers } from '../game/timing.js';
import { validateName, isNameTaken, suggestNames } from './names.js';

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // no I, L, O
export const ROOM_CODE_LENGTH = 4;
export const isRoomCode = (c) => typeof c === 'string' && new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`).test(c);
export function randomRoomCode(rand = Math.random) {
  let s = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) s += ROOM_CODE_ALPHABET[Math.floor(rand() * ROOM_CODE_ALPHABET.length)];
  return s;
}

export const VOTE_OPTIONS_SEC = Object.freeze([30, 45, 60, 90, 120]);
export const DEFAULT_SETTINGS = Object.freeze({ turnSec: 15, discussMin: 3, voteSec: 60, lang: 'ta', voice: 'george', fast: false });

export const LOBBY_GRACE_MS = 60_000; // offline lobby members are dropped after this
export const HOST_GRACE_MS = 30_000; // host role moves on after the host is offline this long
export const IDLE_EXPIRE_MS = 2 * 60 * 60_000; // room storage cleared after 2 h without activity

export const NIGHT_PHASES = new Set([PHASES.NIGHT_INTRO, PHASES.MAFIA_TURN, PHASES.DOCTOR_TURN, PHASES.DETECTIVE_TURN]);

export function normalizeSettings(s = {}, prev = DEFAULT_SETTINGS) {
  const m = { ...prev, ...s };
  const t = normalizeTimers({ turnSec: m.turnSec, discussMin: m.discussMin });
  return {
    turnSec: t.turnSec,
    discussMin: t.discussMin,
    voteSec: VOTE_OPTIONS_SEC.includes(Number(m.voteSec)) ? Number(m.voteSec) : DEFAULT_SETTINGS.voteSec,
    lang: m.lang === 'en' ? 'en' : 'ta',
    voice: m.voice === 'heart' ? 'heart' : 'george',
    fast: Boolean(m.fast),
  };
}

/** Millisecond timings for the server timeline. `fast` is for e2e tests. */
export function onlineTiming(settings) {
  if (settings.fast) return { turnMs: 3500, discussMs: 3000, voteMs: 6000, gapMs: 300, readMs: 1500, clipMs: 900, cuePadMs: 600, dealReadMs: 1500 };
  return {
    turnMs: settings.turnSec * 1000,
    discussMs: settings.discussMin * 60_000,
    voteMs: settings.voteSec * 1000,
    gapMs: 1200,
    readMs: 4000,
    clipMs: 5000,
    cuePadMs: 2000,
    dealReadMs: 3000,
  };
}

export function createRoom(code, now, settings = {}) {
  return {
    code,
    createdAt: now,
    lastActivity: now,
    hostSeat: null,
    status: 'lobby', // lobby | deal | game
    settings: normalizeSettings(settings),
    members: [], // { seat, name, ready, connected, joinedAt, offlineSince, spectator }
    kicked: [],
    deal: null, // { deck: [role], picks: { [cardIndex]: seat }, seen: { [seat]: true }, seats: [seat] }
    game: null, // engine state (player name = seat)
    flow: null, // { step, deadline, cue: { id, clips } | null }
    votes: {}, // { [voterSeat]: targetSeat | 'skip' }
    mafiaPicks: {}, // { [mafiaSeat]: targetSeat }
    cueSeq: 0,
    hostOfflineSince: null,
  };
}

const touch = (room, now) => ({ ...room, lastActivity: now });
const member = (room, seat) => room.members.find((m) => m.seat === seat) || null;
const isHost = (room, seat) => room.hostSeat === seat;
const players = (room) => room.members.filter((m) => !m.spectator);
const updateMember = (room, seat, patch) => ({ ...room, members: room.members.map((m) => (m.seat === seat ? { ...m, ...patch } : m)) });
const err = (room, code, extra = {}) => ({ room, error: { code, ...extra } });

// ---------------------------------------------------------------- membership

/**
 * Seat `seat` connects with a display name. Existing members just come back online (same seat, same
 * name: a reconnect is never a duplicate). New members need a valid, free name.
 * Returns { room, error? } where error = { code: 'name_taken' | 'name_invalid' | 'room_full' | 'kicked', ... }.
 */
export function join(room, seat, rawName, now) {
  const existing = member(room, seat);
  if (existing) {
    let next = updateMember(room, seat, { connected: true, offlineSince: null });
    if (isHost(next, seat)) next = { ...next, hostOfflineSince: null };
    return { room: touch(next, now) };
  }
  if (room.kicked.includes(seat)) return err(room, 'kicked');
  const v = validateName(rawName);
  if (!v.ok) return err(room, 'name_invalid', { message: v.error, suggestions: suggestNames(room.members, rawName) });
  if (isNameTaken(room.members, v.name)) {
    return err(room, 'name_taken', { message: `“${v.name}” is taken in this room`, suggestions: suggestNames(room.members, v.name) });
  }
  if (room.members.length >= MAX_PLAYERS * 2) return err(room, 'room_full');
  const spectator = room.status !== 'lobby' || players(room).length >= MAX_PLAYERS;
  const m = { seat, name: v.name, ready: false, connected: true, joinedAt: now, offlineSince: null, spectator };
  const next = { ...room, members: [...room.members, m], hostSeat: room.hostSeat ?? seat };
  return { room: touch(next, now) };
}

/** Lobby-only rename with the same rules as join. */
export function rename(room, seat, rawName, now) {
  if (!member(room, seat)) return err(room, 'not_member');
  if (room.status !== 'lobby') return err(room, 'rename_locked', { message: 'Names are locked during the game' });
  const v = validateName(rawName);
  if (!v.ok) return err(room, 'name_invalid', { message: v.error });
  if (isNameTaken(room.members, v.name, seat)) {
    return err(room, 'name_taken', { message: `“${v.name}” is taken in this room`, suggestions: suggestNames(room.members.filter((m) => m.seat !== seat), v.name) });
  }
  return { room: touch(updateMember(room, seat, { name: v.name }), now) };
}

export function disconnect(room, seat, now) {
  const m = member(room, seat);
  if (!m) return room;
  let next = updateMember(room, seat, { connected: false, offlineSince: now });
  if (isHost(room, seat)) next = { ...next, hostOfflineSince: now };
  return next;
}

export function setReady(room, seat, ready, now) {
  if (room.status !== 'lobby' || !member(room, seat)) return room;
  return touch(updateMember(room, seat, { ready: Boolean(ready) }), now);
}

export function updateSettings(room, seat, patch, now) {
  if (room.status !== 'lobby' || !isHost(room, seat)) return room;
  return touch({ ...room, settings: normalizeSettings(patch, room.settings) }, now);
}

export function kick(room, seat, target, now) {
  if (!isHost(room, seat) || target === seat || room.status !== 'lobby' || !member(room, target)) return room;
  return touch({ ...room, members: room.members.filter((m) => m.seat !== target), kicked: [...room.kicked, target] }, now);
}

/** Who may start: host, in lobby, MIN_PLAYERS+ connected players, everyone else ready. */
export function canStart(room) {
  const ps = players(room).filter((m) => m.connected);
  if (ps.length < MIN_PLAYERS) return { ok: false, reason: `Need at least ${MIN_PLAYERS} players` };
  const notReady = ps.filter((m) => !m.ready && m.seat !== room.hostSeat);
  if (notReady.length) return { ok: false, reason: `Waiting for ${notReady.length} to be ready` };
  return { ok: true };
}

// ---------------------------------------------------------------- deal (card pick)

function startDeal(room, now, rand = Math.random) {
  const seats = room.members.filter((m) => m.connected).map((m) => m.seat);
  const deck = withRandom(rand, () => generateDeck(seats.length));
  return {
    ...room,
    status: 'deal',
    members: room.members.map((m) => ({ ...m, spectator: !seats.includes(m.seat), ready: false })),
    deal: { deck, picks: {}, seen: {}, seats },
    game: null,
    flow: null,
    votes: {},
    mafiaPicks: {},
    lastActivity: now,
  };
}

// generateDeck uses Math.random; tests pass a seeded rand
function withRandom(rand, fn) {
  if (rand === Math.random) return fn();
  const orig = Math.random;
  Math.random = rand;
  try { return fn(); } finally { Math.random = orig; }
}

export function start(room, seat, now, rand) {
  if (!isHost(room, seat) || room.status !== 'lobby') return err(room, 'not_allowed');
  const c = canStart(room);
  if (!c.ok) return err(room, 'cannot_start', { message: c.reason });
  return { room: startDeal(room, now, rand) };
}

export const pickedCardOf = (room, seat) => {
  if (!room.deal) return null;
  const e = Object.entries(room.deal.picks).find(([, s]) => s === seat);
  return e ? Number(e[0]) : null;
};

/** A dealt player taps face-down card `index`. First tap wins the card; one card per player. */
export function pickCard(room, seat, index, now) {
  const d = room.deal;
  if (room.status !== 'deal' || !d || !d.seats.includes(seat)) return err(room, 'not_allowed');
  if (!Number.isInteger(index) || index < 0 || index >= d.deck.length) return err(room, 'bad_card');
  if (pickedCardOf(room, seat) !== null) return err(room, 'already_picked');
  if (d.picks[index] !== undefined) return err(room, 'card_taken', { message: 'Someone just took that card' });
  return { room: touch({ ...room, deal: { ...d, picks: { ...d.picks, [index]: seat } } }, now) };
}

/** Player has looked at their card. Night starts when every dealt player has. */
export function markSeen(room, seat, now) {
  const d = room.deal;
  if (room.status !== 'deal' || !d || pickedCardOf(room, seat) === null) return room;
  const next = touch({ ...room, deal: { ...d, seen: { ...d.seen, [seat]: true } } }, now);
  return d.seats.every((s) => next.deal.seen[s]) ? beginGame(next, now) : next;
}

/** Host may start the night once every card is picked (someone forgot to tap "I've seen it"). */
export function forceNight(room, seat, now) {
  const d = room.deal;
  if (!isHost(room, seat) || room.status !== 'deal' || !d) return room;
  if (Object.keys(d.picks).length < d.seats.length) return room;
  return beginGame(room, now);
}

function beginGame(room, now) {
  const d = room.deal;
  const roster = d.seats.map((seat) => ({ name: seat, role: d.deck[pickedCardOf(room, seat)] }));
  let game = reducer(createInitialState({}, { turnSec: room.settings.turnSec, discussMin: room.settings.discussMin }, room.settings.lang), { type: 'NEW_GAME' });
  game = reducer(game, { type: 'START_NIGHT', players: roster });
  return enterPhase({ ...room, status: 'game', game, votes: {}, mafiaPicks: {} }, now);
}

// ---------------------------------------------------------------- timeline

const cue = (room, clips) => {
  const id = room.cueSeq + 1;
  return { cueSeq: id, cue: { id, clips } };
};

function setStep(room, step, now, { ms = null, clips = null } = {}) {
  const T = onlineTiming(room.settings);
  if (clips) {
    const list = clips.filter((c) => c !== 'pass_hint'); // "pass the phone" makes no sense online
    if (list.length) {
      const c = cue(room, list);
      return { ...room, cueSeq: c.cueSeq, flow: { step, deadline: now + list.length * T.clipMs + T.cuePadMs, cue: c.cue, startedAt: now } };
    }
    return { ...room, flow: { step, deadline: now, cue: null, startedAt: now } };
  }
  return { ...room, flow: { step, deadline: ms === null ? null : now + ms, cue: null, startedAt: now } };
}

const nameOpts = { canSayName: () => true }; // the host maps { name: seat } to the display name

/** Start the script for the engine's current phase. */
function enterPhase(room, now) {
  const g = room.game;
  if (g.phase === PHASES.CHECK_WIN) return enterPhase({ ...room, game: reducer(g, { type: 'ADVANCE', from: g.phase }) }, now);
  if (g.phase === PHASES.NIGHT_INTRO) return setStep({ ...room, mafiaPicks: {}, votes: {} }, 'intro', now, { clips: entryClips(g) });
  if (isTurnPhase(g.phase)) return setStep(room, 'wake', now, { clips: entryClips(g) });
  if (g.phase === PHASES.MORNING) return setStep(room, 'morning', now, { clips: entryClips(g, nameOpts) });
  if (g.phase === PHASES.DAY_DISCUSS) return setStep(room, 'discussCue', now, { clips: entryClips(g) });
  if (g.phase === PHASES.VOTE) return setStep({ ...room, votes: {} }, 'voteCue', now, { clips: entryClips(g) });
  if (g.phase === PHASES.END) return setStep(room, 'end', now, { clips: entryClips(g) });
  return room;
}

const advance = (room, now) => enterPhase({ ...room, game: reducer(room.game, { type: 'ADVANCE', from: room.game.phase }) }, now);

/** The current step is over (deadline reached, host finished the cue, or voting complete). */
function completeStep(room, now) {
  const T = onlineTiming(room.settings);
  const g = room.game;
  switch (room.flow?.step) {
    case 'intro': return setStep(room, 'introGap', now, { ms: T.gapMs });
    case 'introGap': return advance(room, now);
    case 'wake': return setStep(room, 'open', now, { ms: T.turnMs });
    case 'open': return setStep(room, 'sleep', now, { clips: exitClips(g.phase) });
    case 'sleep': return setStep(room, 'sleepGap', now, { ms: T.gapMs });
    case 'sleepGap': return advance(room, now);
    case 'morning': return setStep(room, 'morningRead', now, { ms: T.readMs });
    case 'morningRead': return advance(room, now);
    case 'discussCue': return setStep(room, 'discuss', now, { ms: T.discussMs });
    case 'discuss': return advance(room, now);
    case 'voteCue': return setStep(room, 'voting', now, { ms: T.voteMs });
    case 'voting': {
      const out = tallyVotes(room);
      const game = reducer(g, { type: 'VOTE', name: out });
      return setStep({ ...room, game }, 'voteResult', now, { clips: voteClips(game, nameOpts) });
    }
    case 'voteResult': return setStep(room, 'voteRead', now, { ms: T.readMs });
    case 'voteRead': return advance(room, now);
    case 'end': return setStep(room, 'over', now);
    default: return room;
  }
}

/** Alarm: finish every step whose deadline has passed; drop stale lobby members; move the host. */
export function tick(room, now) {
  let r = room;
  for (let i = 0; i < 20 && r.status === 'game' && r.flow?.deadline != null && r.flow.deadline <= now; i++) r = completeStep(r, now);
  r = housekeeping(r, now);
  return r;
}

function housekeeping(room, now) {
  let r = room;
  if (r.status === 'lobby') {
    const keep = r.members.filter((m) => m.connected || !m.offlineSince || now - m.offlineSince < LOBBY_GRACE_MS);
    if (keep.length !== r.members.length) r = { ...r, members: keep };
  }
  const host = member(r, r.hostSeat);
  const hostGone = !host || (!host.connected && host.offlineSince && now - host.offlineSince >= HOST_GRACE_MS);
  if (hostGone) {
    const next = r.members.filter((m) => m.connected).sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (next && next.seat !== r.hostSeat) r = { ...r, hostSeat: next.seat, hostOfflineSince: null };
  }
  return r;
}

export const isExpired = (room, now) => now - room.lastActivity >= IDLE_EXPIRE_MS && !room.members.some((m) => m.connected);

/** Earliest time the alarm must fire. */
export function nextAlarm(room) {
  const times = [];
  if (room.status === 'game' && room.flow?.deadline != null) times.push(room.flow.deadline);
  room.members.forEach((m) => {
    if (!m.connected && m.offlineSince) {
      if (room.status === 'lobby') times.push(m.offlineSince + LOBBY_GRACE_MS);
      if (m.seat === room.hostSeat) times.push(m.offlineSince + HOST_GRACE_MS);
    }
  });
  times.push(room.lastActivity + IDLE_EXPIRE_MS);
  return Math.min(...times);
}

/** Host finished playing cue `id`. */
export function cueDone(room, seat, id, now) {
  if (!isHost(room, seat) || room.status !== 'game' || !room.flow?.cue || room.flow.cue.id !== id) return room;
  return tick(completeStep(room, now), now);
}

// ---------------------------------------------------------------- night actions and votes

const gamePlayer = (room, seat) => room.game?.players.find((p) => p.name === seat) || null;

export function canAct(room, seat) {
  const g = room.game;
  if (room.status !== 'game' || !g || !isTurnPhase(g.phase) || room.flow?.step !== 'open') return false;
  const p = gamePlayer(room, seat);
  return Boolean(p && p.alive && p.role === currentTurnRole(g));
}

/** Night tap. Mafia: every Mafia's pick is shown to the team, the latest pick counts (engine: last tap wins). */
export function nightSelect(room, seat, target, now) {
  if (!canAct(room, seat)) return err(room, 'not_your_turn');
  const g = room.game;
  const before = g.night.selections[currentTurnRole(g)] ?? null;
  const game = reducer(g, { type: 'SELECT', name: target });
  if (game === g && before !== target) return err(room, 'bad_target');
  const mafiaPicks = currentTurnRole(g) === 'mafia' ? { ...room.mafiaPicks, [seat]: target } : room.mafiaPicks;
  return { room: touch({ ...room, game, mafiaPicks }, now) };
}

export function castVote(room, seat, target, now) {
  const g = room.game;
  if (room.status !== 'game' || g?.phase !== PHASES.VOTE || room.flow?.step !== 'voting') return err(room, 'not_voting');
  const voter = gamePlayer(room, seat);
  if (!voter?.alive) return err(room, 'not_voter');
  if (target !== 'skip') {
    const t = gamePlayer(room, target);
    if (!t?.alive) return err(room, 'bad_target');
  }
  const next = touch({ ...room, votes: { ...room.votes, [seat]: target } }, now);
  const alive = g.players.filter((p) => p.alive);
  return { room: alive.every((p) => next.votes[p.name] !== undefined) ? tick(completeStep(next, now), now) : next };
}

/** Plurality of alive voters' votes for alive players; a tie or no votes = no elimination (null). */
export function tallyVotes(room) {
  const g = room.game;
  const alive = new Set(g.players.filter((p) => p.alive).map((p) => p.name));
  const counts = {};
  Object.entries(room.votes).forEach(([voter, target]) => {
    if (alive.has(voter) && alive.has(target)) counts[target] = (counts[target] || 0) + 1;
  });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return null;
  if (entries.length > 1 && entries[0][1] === entries[1][1]) return null;
  return entries[0][0];
}

/** Host skips the rest of the day discussion. */
export function skipDiscussion(room, seat, now) {
  if (!isHost(room, seat) || room.flow?.step !== 'discuss') return room;
  return tick(completeStep(room, now), now);
}

export function rematch(room, seat, now, rand) {
  if (!isHost(room, seat) || room.status !== 'game' || room.game?.phase !== PHASES.END) return room;
  const r = startDeal(room, now, rand);
  return r.deal.seats.length >= MIN_PLAYERS ? r : backToLobby(room, seat, now);
}

export function backToLobby(room, seat, now) {
  if (!isHost(room, seat) || room.status === 'lobby') return room;
  return touch({
    ...room, status: 'lobby', deal: null, game: null, flow: null, votes: {}, mafiaPicks: {},
    members: room.members.map((m) => ({ ...m, spectator: false, ready: false })),
  }, now);
}

// ---------------------------------------------------------------- per-seat view

/**
 * Everything seat `seat` may see. The full room never leaves the Durable Object.
 *  - roles: your own; fellow Mafia if you are Mafia; everyone's only at END
 *  - targets / current selection: only to the role that is awake, only while its window is open
 *  - Mafia picks: only to alive Mafia during the Mafia turn
 *  - Detective answers: only to the Detective
 *  - votes are open (everyone sees who voted whom) - a room default, see ONLINE_PROGRESS.md
 *  - dead players and spectators get the public view plus their own role
 */
export function viewFor(room, seat, now = Date.now()) {
  const me = member(room, seat);
  const base = {
    code: room.code,
    you: seat,
    joined: Boolean(me),
    isHost: isHost(room, seat),
    hostSeat: room.hostSeat,
    status: room.status,
    settings: room.settings,
    members: room.members.map(({ seat: s, name, ready, connected, spectator }) => ({ seat: s, name, ready, connected, spectator })),
    canStart: room.status === 'lobby' ? canStart(room) : null,
    serverNow: now,
    deal: null,
    game: null,
    flow: room.flow ? { step: room.flow.step, deadline: room.flow.deadline, cue: room.flow.cue, startedAt: room.flow.startedAt } : null,
  };
  if (!me) return base;

  if (room.status === 'deal' && room.deal) {
    const d = room.deal;
    const myCard = pickedCardOf(room, seat);
    base.deal = {
      cards: d.deck.map((_, i) => ({ index: i, takenBy: d.picks[i] ?? null })),
      myCard,
      myRole: myCard === null ? null : d.deck[myCard],
      seen: Object.keys(d.seen),
      seats: d.seats,
      allPicked: Object.keys(d.picks).length === d.seats.length,
    };
  }

  const g = room.game;
  if (room.status === 'game' && g) {
    const mine = gamePlayer(room, seat);
    const myRole = mine?.role ?? null;
    const iAmMafia = teamOf(myRole) === 'mafia' && Boolean(mine);
    const ended = g.phase === PHASES.END;
    const turn = currentTurnRole(g);
    const myTurn = canAct(room, seat);
    const awake = Boolean(mine?.alive && turn && myRole === turn);
    const night = NIGHT_PHASES.has(g.phase);
    base.game = {
      phase: g.phase,
      round: g.round,
      winner: g.winner,
      night,
      turnRole: turn,
      players: g.players.map((p) => ({
        seat: p.name,
        alive: p.alive,
        role: ended || p.name === seat || (iAmMafia && teamOf(p.role) === 'mafia') ? p.role : null,
      })),
      me: mine ? { seat, role: myRole, alive: mine.alive } : null,
      awake,
      myTurn,
      targets: awake ? selectTargets(g).map((t) => ({ seat: t.name, disabled: t.disabled, reason: t.reason })) : [],
      mySelection: awake ? g.night.selections[turn] ?? null : null,
      mafiaPicks: awake && turn === 'mafia' ? room.mafiaPicks : null,
      detectiveResult: awake && turn === 'detective' && g.night.selections.detective
        ? { target: g.night.selections.detective, isMafia: g.night.result }
        : null,
      detectiveLog: myRole === 'detective'
        ? g.log.filter((e) => e.detectiveCheck && (e.round < g.round || !night)).map((e) => ({ round: e.round, ...e.detectiveCheck }))
        : null,
      morning: !night ? g.morning : null,
      votes: g.phase === PHASES.VOTE ? room.votes : null,
      vote: g.vote,
      log: ended ? g.log : null,
    };
  }
  return base;
}
