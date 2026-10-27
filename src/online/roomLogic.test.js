import { describe, it, expect } from 'vitest';
import {
  createRoom, join, rename, disconnect, setReady, updateSettings, kick, start, pickCard, markSeen, forceNight,
  tick, cueDone, nightSelect, castVote, tallyVotes, viewFor, nextAlarm, rematch, backToLobby, pickedCardOf, leave,
  randomRoomCode, isRoomCode, onlineTiming, HOST_GRACE_MS, LOBBY_GRACE_MS, IDLE_EXPIRE_MS, isExpired, alarmTime, MIN_ALARM_DELAY_MS,
} from './roomLogic';
import { PHASES } from '../game/engine';

// seeded PRNG so deals are reproducible
const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

const NAMES = ['Arjun', 'Priya', 'Karthik', 'Meena', 'Ravi', 'Divya', 'Suresh'];
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

describe('detective catch (online)', () => {
  const TURNS = [['mafia', 'kill', PHASES.MAFIA_TURN], ['doctor', 'save', PHASES.DOCTOR_TURN], ['detective', 'check', PHASES.DETECTIVE_TURN]];
  const aliveSeat = (room, role) => room.game.players.find((p) => p.role === role && p.alive)?.name;
  const isAlive = (room, seat) => room.game.players.find((p) => p.name === seat).alive;
  /** Play one night from wherever the room is, tapping as each role; stop at the morning narration. */
  function night(room, taps) {
    let r = room;
    for (const [role, key, phase] of TURNS) {
      r = runUntil(r, (x) => x.game.phase === phase && x.flow.step === 'open');
      const seat = aliveSeat(r, role);
      if (taps[key] && seat) {
        const res = nightSelect(r, seat, taps[key], now());
        expect(res.error).toBeUndefined();
        r = res.room;
      }
    }
    return runUntil(r, (x) => x.flow.step === 'morning');
  }
  /** Run on alarms until END or the predicate, recording every phase seen on the way. */
  function phasesUntil(room, pred) {
    const seen = new Set();
    const r = runUntil(room, (x) => { seen.add(x.game.phase); return pred(x); });
    return { room: r, seen };
  }

  it('catching the only Mafia: caught and named at morning, then straight to END with a village win', () => {
    let room = inGame(5);
    const [mafia] = seatsWith(room, 'mafia');
    const villager = seatsWith(room, 'villager')[0];
    room = night(room, { kill: villager, check: mafia });
    expect(room.game.morning).toMatchObject({ victim: villager, caught: mafia });
    expect(isAlive(room, mafia)).toBe(false);
    expect(room.flow.cue.clips).toEqual(['morning', 'killed_pre', { name: villager }, 'killed_post', 'detective_found', { name: mafia }, 'voted_out_post']);
    // every seat sees the catch on the morning screen
    room.game.players.forEach(({ name }) => expect(viewFor(room, name).game.morning.caught).toBe(mafia));
    const { room: end, seen } = phasesUntil(room, (x) => x.game.phase === PHASES.END);
    expect(end.game.winner).toBe('villagers');
    expect(seen.has(PHASES.DAY_DISCUSS) || seen.has(PHASES.VOTE)).toBe(false);
    expect(end.flow.step).toBe('end');
    expect(end.flow.cue.clips).toEqual(['villagers_win']);
    const v = viewFor(end, villager);
    expect(v.game.morning.caught).toBe(mafia);
    expect(v.game.vote).toBeNull();
    expect(v.game.log[0]).toMatchObject({ caught: mafia, detectiveCheck: { target: mafia, isMafia: true } });
  });

  it('catching one of two Mafia: the caught seat is dead and out of play, the game goes on to the day', () => {
    let room = inGame(7);
    const [m1, m2] = seatsWith(room, 'mafia');
    const [v1] = seatsWith(room, 'villager');
    room = night(room, { kill: v1, check: m2 });
    expect(room.game.morning).toMatchObject({ victim: v1, caught: m2 });
    room = runUntil(room, (x) => x.game.phase === PHASES.VOTE && x.flow.step === 'voting');
    expect(room.game.phase).toBe(PHASES.VOTE);
    expect(castVote(room, m2, m1, now()).error?.code).toBe('not_voter');
    expect(castVote(room, m1, m2, now()).error?.code).toBe('bad_target');
    // next night the caught Mafia cannot act; the other one still can
    room = runUntil(room, (x) => x.game.phase === PHASES.MAFIA_TURN && x.flow.step === 'open');
    expect(nightSelect(room, m2, seatsWith(room, 'doctor')[0], now()).error?.code).toBe('not_your_turn');
    expect(viewFor(room, m2).game.myTurn).toBe(false);
    expect(nightSelect(room, m1, seatsWith(room, 'doctor')[0], now()).error).toBeUndefined();
  });

  it('a wrong guess changes nothing and the narrator says nothing about the Detective', () => {
    let room = inGame(5);
    const villagers = seatsWith(room, 'villager');
    room = night(room, { kill: villagers[0], check: villagers[1] });
    expect(room.game.morning).toMatchObject({ victim: villagers[0], caught: null, detectiveFoundMafia: false });
    expect(room.flow.cue.clips).toEqual(['morning', 'killed_pre', { name: villagers[0] }, 'killed_post']);
    expect(runUntil(room, (x) => x.flow.step === 'discussCue').game.phase).toBe(PHASES.DAY_DISCUSS);
  });

  it('doctor save + catch: nobody killed, the Mafia is still caught (the save never blocks a catch)', () => {
    let room = inGame(7);
    const [m1] = seatsWith(room, 'mafia');
    const [v1] = seatsWith(room, 'villager');
    room = night(room, { kill: v1, save: v1, check: m1 });
    expect(room.game.morning).toMatchObject({ victim: null, saved: true, caught: m1 });
    expect(room.flow.cue.clips).toEqual(['morning', 'saved', 'detective_found', { name: m1 }, 'voted_out_post']);
    expect(isAlive(room, v1)).toBe(true);
    expect(isAlive(room, m1)).toBe(false);
  });

  it('kill then catch then win check: the kill reaching parity does not beat catching the last Mafia', () => {
    // 4 players: night 1 leaves Mafia vs Doctor + Detective; night 2 the kill alone would be a Mafia win (1 vs 1)
    let room = inGame(4);
    const [mafia] = seatsWith(room, 'mafia');
    const [doctor] = seatsWith(room, 'doctor');
    const [villager] = seatsWith(room, 'villager');
    room = night(room, { kill: villager, check: doctor });
    expect(room.game.morning.caught).toBeNull();
    room = runUntil(room, (x) => x.game.phase === PHASES.NIGHT_INTRO); // nobody votes: tie
    room = night(room, { kill: doctor, check: mafia });
    expect(room.game.morning).toMatchObject({ victim: doctor, caught: mafia });
    const end = runUntil(room, (x) => x.game.phase === PHASES.END);
    expect(end.game.winner).toBe('villagers');
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

describe('leave (exit button)', () => {
  const alive = (room, seat) => room.game.players.find((p) => p.name === seat).alive;

  it('lobby: the member is removed and the name is free again', () => {
    let room = lobby(4);
    room = leave(room, 's2', now());
    expect(room.members.map((m) => m.seat)).toEqual(['s0', 's1', 's3']);
    expect(room.hostSeat).toBe('s0');
    // someone else can take the name; the leaver can come back as a new member
    expect(join(room, 's9', 'Karthik', now()).error).toBeUndefined();
    expect(join(room, 's2', 'Karthik', now()).room.members.find((m) => m.seat === 's2').spectator).toBe(false);
    expect(leave(room, 'nobody', now())).toBe(room);
  });

  it('host leaving hands the host to the longest-seated connected member', () => {
    let room = lobby(4);
    room = disconnect(room, 's1', now()); // offline members are skipped
    room = leave(room, 's0', now());
    expect(room.hostSeat).toBe('s2');
    expect(viewFor(room, 's2').isHost).toBe(true);
  });

  it('last member leaving empties the room; it expires without a past alarm', () => {
    let room = lobby(1);
    room = leave(room, 's0', now());
    expect(room.members).toHaveLength(0);
    expect(room.hostSeat).toBeNull();
    const at = now();
    const next = nextAlarm(room, at);
    expect(next).toBe(room.lastActivity + IDLE_EXPIRE_MS);
    expect(next).toBeGreaterThan(at);
    expect(isExpired(room, room.lastActivity + IDLE_EXPIRE_MS)).toBe(true);
    // the next person to join becomes host
    expect(join(room, 's5', 'Ravi', now()).room.hostSeat).toBe('s5');
  });

  it('deal: an unpicked card goes to the leaver so the game can still start, and they start out', () => {
    let room = start(lobby(5), 's0', now(), seeded(7)).room;
    ['s0', 's1', 's2', 's3'].forEach((s, i) => { room = pickCard(room, s, i, now()).room; });
    room = leave(room, 's4', now());
    expect(room.status).toBe('deal');
    expect(pickedCardOf(room, 's4')).toBe(4);
    expect(room.members.find((m) => m.seat === 's4')).toMatchObject({ spectator: true, connected: false, left: true });
    // coming back during the deal does not put them back in
    room = join(room, 's4', 'Ravi', now()).room;
    ['s0', 's1', 's2', 's3'].forEach((s) => { room = markSeen(room, s, now()); });
    expect(room.status).toBe('game');
    if (room.game.phase !== PHASES.END) expect(alive(room, 's4')).toBe(false);
    expect(room.game.players.filter((p) => p.alive)).toHaveLength(4);
  });

  it('mid-game: the leaver is out, night picks on them are dropped, and nothing stalls', () => {
    let room = inGame(5);
    room = runUntil(room, (r) => r.game.phase === PHASES.MAFIA_TURN && r.flow.step === 'open');
    const [maf] = seatsWith(room, 'mafia');
    const victim = room.game.players.find((p) => p.role !== 'mafia' && p.name !== 's0').name;
    room = nightSelect(room, maf, victim, now()).room;
    expect(room.game.night.selections.mafia).toBe(victim);
    room = leave(room, victim, now());
    expect(alive(room, victim)).toBe(false);
    expect(room.game.night.selections.mafia).toBeUndefined();
    expect(room.mafiaPicks[maf]).toBeUndefined();
    expect(viewFor(room, 's0').members.find((m) => m.seat === victim)).toMatchObject({ spectator: true, connected: false });
    expect(nightSelect(room, maf, victim, now()).error.code).toBe('bad_target');
    // the timeline keeps going on its own: the game reaches morning without the leaver
    room = runUntil(room, (r) => r.game.phase === PHASES.DAY_DISCUSS || r.game.phase === PHASES.END);
    expect([PHASES.DAY_DISCUSS, PHASES.END]).toContain(room.game.phase);
    // they can watch if they come back, but never play this game again
    room = join(room, victim, 'x', now()).room;
    expect(room.members.find((m) => m.seat === victim).spectator).toBe(true);
    expect(alive(room, victim)).toBe(false);
  });

  it('mid-game: the last Mafia leaving ends the game for the villagers at once', () => {
    let room = inGame(5);
    room = runUntil(room, (r) => r.game.phase === PHASES.DAY_DISCUSS || r.game.phase === PHASES.END);
    if (room.game.phase === PHASES.END) return;
    seatsWith(room, 'mafia').forEach((s) => { room = leave(room, s, now()); });
    expect(room.game.phase).toBe(PHASES.END);
    expect(room.game.winner).toBe('villagers');
    expect(room.flow.step).toBe('end');
    expect(room.flow.cue.clips).toEqual(['villagers_win']);
  });

  it('mid-game: villagers leaving until Mafia equal the rest gives Mafia the win', () => {
    let room = inGame(5);
    const others = room.game.players.filter((p) => p.role !== 'mafia').map((p) => p.name);
    const mafiaCount = seatsWith(room, 'mafia').length;
    let i = 0;
    while (room.game.phase !== PHASES.END) room = leave(room, others[i++], now());
    expect(room.game.winner).toBe('mafia');
    expect(others.length - i).toBe(mafiaCount);
  });

  it('voting: a vote that only waited for the leaver completes; votes for the leaver are cleared', () => {
    let room = inGame(5);
    room = runUntil(room, (r) => (r.game.phase === PHASES.VOTE && r.flow.step === 'voting') || r.game.phase === PHASES.END);
    if (room.game.phase === PHASES.END) return;
    const aliveSeats = room.game.players.filter((p) => p.alive).map((p) => p.name);
    const leaver = aliveSeats.find((s) => s !== 's0' && roleOf(room, s) !== 'mafia');
    const rest = aliveSeats.filter((s) => s !== leaver);
    // one voter picks the leaver, everyone else (but the leaver) votes skip
    room = castVote(room, rest[0], leaver, now()).room;
    rest.slice(1).forEach((s) => { room = castVote(room, s, 'skip', now()).room; });
    expect(room.flow.step).toBe('voting');
    room = leave(room, leaver, now());
    if (room.game.phase === PHASES.END) return; // the leave itself decided the game
    expect(room.votes[rest[0]]).toBeUndefined(); // must vote again
    expect(room.flow.step).toBe('voting');
    room = castVote(room, rest[0], 'skip', now()).room;
    expect(room.flow.step).not.toBe('voting');
  });

  it('back to lobby drops members who left; rematch deals only connected members', () => {
    let room = inGame(5);
    room = leave(room, 's4', now());
    const lob = backToLobby(room, 's0', now());
    expect(lob.members.map((m) => m.seat)).toEqual(['s0', 's1', 's2', 's3']);
    expect(lob.members.every((m) => !m.left && !m.spectator)).toBe(true);
  });

  it('a socket closing after leave writes nothing more', () => {
    let room = inGame(5);
    room = leave(room, 's3', now());
    expect(disconnect(room, 's3', now())).toBe(room);
    const lob = leave(lobby(3), 's1', now());
    expect(disconnect(lob, 's1', now())).toBe(lob);
  });
});
