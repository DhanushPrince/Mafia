import { describe, it, expect } from 'vitest';
import {
  createRoom, join, rename, disconnect, setReady, updateSettings, kick, start, pickCard, markSeen, forceNight,
  tick, cueDone, nightSelect, castVote, tallyVotes, viewFor, nextAlarm, rematch, backToLobby, pickedCardOf,
  randomRoomCode, isRoomCode, onlineTiming, HOST_GRACE_MS, LOBBY_GRACE_MS, IDLE_EXPIRE_MS, isExpired, alarmTime, MIN_ALARM_DELAY_MS,
} from './roomLogic';
import { PHASES } from '../game/engine';

// seeded PRNG so deals are reproducible
const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

const NAMES = ['Arjun', 'Priya', 'Karthik', 'Meena', 'Ravi'];
let T = 1_000_000;
const now = () => (T += 10);

function lobby(n = 5, settings = { fast: true }) {
  let room = createRoom('KQTZ', now(), settings);
  for (let i = 0; i < n; i++) room = join(room, `s${i}`, NAMES[i], now()).room;
  for (let i = 1; i < n; i++) room = setReady(room, `s${i}`, true, now());
  return room;
}

function dealt(n = 5, rand = seeded(7)) {
  let room = start(lobby(n), 's0', now(), rand).room;
  room.deal.seats.forEach((s, i) => {
    room = pickCard(room, s, i, now()).room;
  });
  return room;
}

function inGame(n = 5) {
  let room = dealt(n);
  room.deal.seats.forEach((s) => { room = markSeen(room, s, now()); });
  return room;
}

const roleOf = (room, seat) => room.game.players.find((p) => p.name === seat).role;
const seatsWith = (room, role) => room.game.players.filter((p) => p.role === role).map((p) => p.name);

/** Fire alarms until the step changes to `step` (or the phase to END). */
function runUntil(room, pred, max = 200) {
  let r = room;
  for (let i = 0; i < max && !pred(r); i++) {
    T = Math.max(T + 10, r.flow?.deadline ?? T + 10);
    r = tick(r, T);
  }
  return r;
}

describe('room codes', () => {
  it('are 4 letters without look-alikes', () => {
    for (let i = 0; i < 50; i++) expect(isRoomCode(randomRoomCode())).toBe(true);
    expect(isRoomCode('KQ0Z')).toBe(false);
    expect(isRoomCode('ABCI')).toBe(false);
  });
});

describe('lobby', () => {
  it('first member is host; join rejects a duplicate name with suggestions', () => {
    let room = createRoom('KQTZ', now());
    room = join(room, 'a', 'Karthik', now()).room;
    expect(room.hostSeat).toBe('a');
    const dup = join(room, 'b', '  KARTHIK ', now());
    expect(dup.error.code).toBe('name_taken');
    expect(dup.error.suggestions.length).toBeGreaterThanOrEqual(2);
    expect(dup.room.members).toHaveLength(1);
    const ok = join(room, 'b', dup.error.suggestions[0], now());
    expect(ok.error).toBeUndefined();
    expect(ok.room.members.map((m) => m.name)).toEqual(['Karthik', dup.error.suggestions[0]]);
  });

  it('a reconnect with the same seat keeps seat and name and is not a duplicate', () => {
    let room = lobby(4);
    room = disconnect(room, 's2', now());
    expect(room.members.find((m) => m.seat === 's2').connected).toBe(false);
    const back = join(room, 's2', 'Karthik', now());
    expect(back.error).toBeUndefined();
    expect(back.room.members.filter((m) => m.name === 'Karthik')).toHaveLength(1);
    expect(back.room.members.find((m) => m.seat === 's2').connected).toBe(true);
  });

  it('rename works in the lobby only and checks uniqueness (Tamil, case)', () => {
    let room = lobby(4);
    room = rename(room, 's1', 'கார்த்திக்', now()).room;
    expect(rename(room, 's2', 'கார்த்திக்'.normalize('NFD'), now()).error.code).toBe('name_taken');
    expect(rename(room, 's2', 'arjun', now()).error.code).toBe('name_taken');
    expect(rename(room, 's0', 'ARJUN', now()).error).toBeUndefined(); // re-casing your own name
    expect(rename(room, 's2', '😀', now()).error.code).toBe('name_invalid');
    const started = start(room, 's0', now(), seeded(3)).room;
    expect(rename(started, 's1', 'Someone', now()).error.code).toBe('rename_locked');
  });

  it('only the host changes settings, kicks and starts; start needs 4 ready players', () => {
    let room = lobby(4);
    expect(updateSettings(room, 's1', { lang: 'en' }, now()).settings.lang).toBe('ta');
    room = updateSettings(room, 's0', { lang: 'en', voice: 'heart', turnSec: 30, discussMin: 99 }, now());
    expect(room.settings).toMatchObject({ lang: 'en', voice: 'heart', turnSec: 30, discussMin: 3 });
    expect(start(room, 's1', now()).error.code).toBe('not_allowed');
    const notReady = setReady(room, 's3', false, now());
    expect(start(notReady, 's0', now()).error.code).toBe('cannot_start');
    const kicked = kick(room, 's0', 's3', now());
    expect(kicked.members).toHaveLength(3);
    expect(join(kicked, 's3', 'Meena', now()).error.code).toBe('kicked');
    expect(start(kicked, 's0', now()).error.code).toBe('cannot_start');
  });

  it('host moves to the next connected member after the grace period', () => {
    let room = lobby(4);
    room = disconnect(room, 's0', 1000);
    room = { ...room, lastActivity: 1000 };
    expect(nextAlarm(room)).toBe(1000 + HOST_GRACE_MS);
    room = tick(room, 1000 + HOST_GRACE_MS);
    expect(room.hostSeat).toBe('s1');
    room = tick(room, 1000 + LOBBY_GRACE_MS);
    expect(room.members.some((m) => m.seat === 's0')).toBe(false);
  });
});

describe('card pick', () => {
  it('server owns the deck; a taken card is greyed out for everyone and cannot be taken twice', () => {
    let room = start(lobby(5), 's0', now(), seeded(5)).room;
    expect(room.status).toBe('deal');
    room = pickCard(room, 's2', 3, now()).room;
    const clash = pickCard(room, 's4', 3, now());
    expect(clash.error.code).toBe('card_taken');
    expect(pickCard(room, 's2', 1, now()).error.code).toBe('already_picked');
    const v4 = viewFor(room, 's4');
    expect(v4.deal.cards[3].takenBy).toBe('s2');
    expect(v4.deal.myRole).toBeNull();
    // the deck never leaves the server: no role in the cards list
    expect(JSON.stringify(v4.deal.cards)).not.toMatch(/mafia|doctor|detective|villager/);
    const v2 = viewFor(room, 's2');
    expect(v2.deal.myCard).toBe(3);
    expect(v2.deal.myRole).toBe(room.deal.deck[3]);
  });

  it('night starts when everyone has seen their card (or the host forces it)', () => {
    let room = dealt(5);
    room = markSeen(room, 's0', now());
    expect(room.status).toBe('deal');
    expect(forceNight(room, 's1', now()).status).toBe('deal');
    const forced = forceNight(room, 's0', now());
    expect(forced.status).toBe('game');
    expect(forced.game.phase).toBe(PHASES.NIGHT_INTRO);
    room.deal.seats.slice(1).forEach((s) => { room = markSeen(room, s, now()); });
    expect(room.status).toBe('game');
    // role = the card the player tapped
    room.deal.seats.forEach((s) => expect(roleOf(room, s)).toBe(room.deal.deck[pickedCardOf(room, s)]));
  });
});

describe('per-player views', () => {
  it('never send other roles (except Mafia teammates) before the end', () => {
    const room = inGame(5);
    room.game.players.forEach(({ name: seat, role }) => {
      const v = viewFor(room, seat);
      v.game.players.forEach((p) => {
        if (p.seat === seat) expect(p.role).toBe(role);
        else if (role === 'mafia' && roleOf(room, p.seat) === 'mafia') expect(p.role).toBe('mafia');
        else expect(p.role).toBeNull();
      });
    });
  });

  it('targets and picks go only to the awake role while its window is open', () => {
    let room = runUntil(inGame(5), (r) => r.game.phase === PHASES.MAFIA_TURN && r.flow.step === 'open');
    const [mafia] = seatsWith(room, 'mafia');
    const victim = room.game.players.find((p) => p.role === 'villager').name;
    room = nightSelect(room, mafia, victim, now()).room;
    const vm = viewFor(room, mafia);
    expect(vm.game.myTurn).toBe(true);
    expect(vm.game.targets.map((t) => t.seat)).not.toContain(mafia);
    expect(vm.game.mafiaPicks).toEqual({ [mafia]: victim });
    room.game.players.filter((p) => p.role !== 'mafia').forEach((p) => {
      const v = viewFor(room, p.name);
      expect(v.game.targets).toEqual([]);
      expect(v.game.mafiaPicks).toBeNull();
      expect(v.game.mySelection).toBeNull();
      expect(JSON.stringify(v)).not.toContain('"mafiaPicks":{');
    });
    // a non-Mafia tap is refused
    const doc = seatsWith(room, 'doctor')[0];
    expect(nightSelect(room, doc, victim, now()).error.code).toBe('not_your_turn');
  });

  it('the Detective answer is only in the Detective view', () => {
    let room = runUntil(inGame(5), (r) => r.game.phase === PHASES.DETECTIVE_TURN && r.flow.step === 'open');
    const det = seatsWith(room, 'detective')[0];
    const [mafia] = seatsWith(room, 'mafia');
    room = nightSelect(room, det, mafia, now()).room;
    expect(viewFor(room, det).game.detectiveResult).toEqual({ target: mafia, isMafia: true });
    room.game.players.filter((p) => p.name !== det).forEach((p) => expect(viewFor(room, p.name).game.detectiveResult).toBeNull());
  });

  it('spectators and non-members get no roles', () => {
    let room = inGame(5);
    room = join(room, 'late', 'Latecomer', now()).room;
    const v = viewFor(room, 'late');
    expect(v.members.find((m) => m.seat === 'late').spectator).toBe(true);
    expect(v.game.me).toBeNull();
    expect(v.game.players.every((p) => p.role === null)).toBe(true);
    expect(viewFor(room, 'stranger').game).toBeNull();
  });
});

describe('votes', () => {
  const at = (room, votes) => ({ ...room, votes });
  const game = (players) => ({ game: { players: players.map(([name, alive = true]) => ({ name, role: 'villager', alive })) } });

  it('plurality wins; ties and no votes mean nobody is out', () => {
    const r = game([['a'], ['b'], ['c'], ['d'], ['e', false]]);
    expect(tallyVotes(at(r, { a: 'b', b: 'c', c: 'b', d: 'skip' }))).toBe('b');
    expect(tallyVotes(at(r, { a: 'b', b: 'c' }))).toBeNull();
    expect(tallyVotes(at(r, {}))).toBeNull();
    expect(tallyVotes(at(r, { a: 'skip', b: 'skip' }))).toBeNull();
  });
  it('ignores dead voters and dead targets', () => {
    const r = game([['a'], ['b'], ['c'], ['e', false]]);
    expect(tallyVotes(at(r, { e: 'a', a: 'b', b: 'e', c: 'e' }))).toBe('b');
  });

  it('votes are open and the vote closes early when every alive player voted', () => {
    let room = runUntil(inGame(5), (r) => r.game.phase === PHASES.VOTE && r.flow.step === 'voting');
    const alive = room.game.players.filter((p) => p.alive).map((p) => p.name);
    const target = alive[0];
    alive.slice(0, -1).forEach((s) => { room = castVote(room, s, s === target ? alive[1] : target, now()).room; });
    expect(viewFor(room, alive[1]).game.votes[alive[2]]).toBe(target);
    expect(room.flow.step).toBe('voting');
    room = castVote(room, alive.at(-1), target, now()).room;
    expect(room.flow.step).toBe('voteResult');
    expect(room.game.vote).toEqual({ out: target, tie: false });
    expect(room.game.players.find((p) => p.name === target).alive).toBe(false);
  });
});

describe('timeline', () => {
  it('host cueDone ends a narration step early; other seats cannot', () => {
    let room = inGame(5);
    expect(room.flow.step).toBe('intro');
    const id = room.flow.cue.id;
    expect(cueDone(room, 's3', id, now()).flow.step).toBe('intro');
    expect(cueDone(room, 's0', id + 1, now()).flow.step).toBe('intro');
    expect(cueDone(room, 's0', id, now()).flow.step).toBe('introGap');
  });

  it('never narrates "pass the phone" online', () => {
    const room = inGame(5);
    expect(room.flow.cue.clips).not.toContain('pass_hint');
  });

  it('plays a whole game to a win on alarms alone, with Mafia killing and the village voting', () => {
    let room = inGame(5);
    const mafia = seatsWith(room, 'mafia');
    for (let guard = 0; guard < 400 && room.game.phase !== PHASES.END; guard++) {
      const g = room.game;
      if (g.phase === PHASES.MAFIA_TURN && room.flow.step === 'open' && !g.night.selections.mafia) {
        const victim = g.players.find((p) => p.alive && p.role !== 'mafia');
        room = nightSelect(room, mafia[0], victim.name, now()).room;
      }
      if (g.phase === PHASES.VOTE && room.flow.step === 'voting') {
        const alive = g.players.filter((p) => p.alive);
        const suspect = alive.find((p) => p.role === 'mafia') || alive[0];
        alive.forEach((p) => { room = castVote(room, p.name, p.name === suspect.name ? alive.find((x) => x.name !== p.name).name : suspect.name, now()).room; });
        continue;
      }
      T = Math.max(T + 10, room.flow?.deadline ?? T + 10);
      room = tick(room, T);
    }
    expect(room.game.phase).toBe(PHASES.END);
    expect(['mafia', 'villagers']).toContain(room.game.winner);
    // at END everyone sees all roles and the log
    const v = viewFor(room, 's1');
    expect(v.game.players.every((p) => p.role)).toBe(true);
    expect(v.game.log.length).toBeGreaterThan(0);
    // rematch: same room, fresh deal for the same players
    expect(rematch(room, 's1', now()).status).toBe('game');
    const re = rematch(room, 's0', now(), seeded(9));
    expect(re.status).toBe('deal');
    expect(re.deal.seats.sort()).toEqual(['s0', 's1', 's2', 's3', 's4']);
    expect(backToLobby(room, 's0', now()).status).toBe('lobby');
  });

  it('real timers follow the room settings', () => {
    expect(onlineTiming({ turnSec: 30, discussMin: 2, voteSec: 45 })).toMatchObject({ turnMs: 30000, discussMs: 120000, voteMs: 45000 });
  });
});

describe('alarm scheduling (Durable Object rows_written budget)', () => {
  // After the alarm runs tick(), nextAlarm must point strictly into the future (or be null),
  // otherwise the Durable Object re-arms the alarm immediately and loops, writing rows each time.
  const settled = (room, at) => {
    const r = tick(room, at);
    const next = nextAlarm(r, at);
    return { r, next };
  };
  const expectFuture = (next, at) => { if (next !== null) expect(next).toBeGreaterThan(at); };

  it('host offline past grace during a game with nobody else online does not re-arm in the past', () => {
    let room = inGame(5);
    const t0 = now();
    room.members.forEach((m) => { room = disconnect(room, m.seat, t0); });
    const at = t0 + HOST_GRACE_MS + 5;
    const { r, next } = settled(room, at);
    expect(r.hostSeat).toBe('s0'); // nobody to hand the host to
    expectFuture(next, at);
    // only idle expiry (or a still-running step deadline) remains
    expect(next).toBeLessThanOrEqual(r.lastActivity + IDLE_EXPIRE_MS);
  });

  it('host offline past grace in the deal with nobody else online does not re-arm in the past', () => {
    let room = dealt(5);
    const t0 = now();
    room.members.forEach((m) => { room = disconnect(room, m.seat, t0); });
    const at = t0 + HOST_GRACE_MS + 5;
    const { next } = settled(room, at);
    expect(next).toBe(room.lastActivity + IDLE_EXPIRE_MS);
  });

  it('lobby: everyone offline, between host grace and lobby grace, does not re-arm in the past', () => {
    let room = lobby(3);
    const t0 = now();
    room.members.forEach((m) => { room = disconnect(room, m.seat, t0); });
    const at = t0 + HOST_GRACE_MS + 5;
    const { next } = settled(room, at);
    expect(next).toBe(t0 + LOBBY_GRACE_MS); // member drop is the next real event
  });

  it('idle time passed while someone is still connected does not re-arm in the past', () => {
    let room = lobby(3);
    const at = room.lastActivity + IDLE_EXPIRE_MS + 5;
    const { next } = settled(room, at);
    expect(next).toBeNull(); // nothing scheduled; disconnect re-arms expiry
    // once everybody is gone the room is due for deletion
    let gone = room;
    gone.members.forEach((m) => { gone = disconnect(gone, m.seat, at); });
    expect(isExpired(gone, at)).toBe(true);
    expect(nextAlarm(gone, at)).toBe(at);
  });

  it('a condition that becomes actionable (someone reconnects while host is gone) is due now', () => {
    let room = inGame(5);
    const t0 = now();
    room.members.forEach((m) => { room = disconnect(room, m.seat, t0); });
    const at = t0 + HOST_GRACE_MS + 5;
    room = tick(room, at);
    room = join(room, 's2', 'Karthik', at).room;
    expect(nextAlarm(room, at)).toBe(at);
    expect(tick(room, at).hostSeat).toBe('s2');
  });

  it('a full game: after every tick the next alarm is in the future', () => {
    let room = inGame(5);
    const mafia = seatsWith(room, 'mafia');
    for (let guard = 0; guard < 400 && room.game.phase !== PHASES.END; guard++) {
      const g = room.game;
      if (g.phase === PHASES.MAFIA_TURN && room.flow.step === 'open' && !g.night.selections.mafia) {
        const victim = g.players.find((p) => p.alive && p.role !== 'mafia');
        room = nightSelect(room, mafia[0], victim.name, now()).room;
      }
      T = Math.max(T + 10, room.flow?.deadline ?? T + 10);
      room = tick(room, T);
      expectFuture(nextAlarm(room, T), T);
    }
    expect(room.game.phase).toBe(PHASES.END);
    room = tick(room, T + 60_000);
    expect(room.flow.step).toBe('over');
    expectFuture(nextAlarm(room, T + 60_000), T + 60_000);
  });
});

describe('alarmTime safety net', () => {
  it('keeps future deadlines exact and pushes due or past targets out by MIN_ALARM_DELAY_MS', () => {
    expect(alarmTime(5000, 1000)).toBe(5000);
    expect(alarmTime(1001, 1000)).toBe(1001);
    expect(alarmTime(1000, 1000)).toBe(1000 + MIN_ALARM_DELAY_MS);
    expect(alarmTime(10, 1000)).toBe(1000 + MIN_ALARM_DELAY_MS);
    expect(alarmTime(null, 1000)).toBeNull();
    expect(alarmTime(Infinity, 1000)).toBeNull();
    expect(MIN_ALARM_DELAY_MS).toBeGreaterThanOrEqual(1000);
  });
});
