import { describe, it, expect } from 'vitest';
import {
  PHASES,
  createInitialState,
  reducer,
  selectTargets,
  computeWinner,
  entryClips,
  exitClips,
  voteClip,
  isRoleAlive,
  nightOrderFor,
  serialize,
  deserialize,
  isResumable,
  ENGINE_VERSION,
  allClipIds,
  morningClips,
  voteClips,
} from './engine';
import { ROLE_DEFS } from './roles';

const FOUR = [
  { name: 'Alice', role: 'mafia' },
  { name: 'Bob', role: 'villager' },
  { name: 'Carol', role: 'doctor' },
  { name: 'Dave', role: 'detective' },
];

const run = (state, ...actions) => actions.reduce(reducer, state);
const start = (players = FOUR, rules) =>
  run(createInitialState(rules), { type: 'NEW_GAME' }, { type: 'START_NIGHT', players });

/** From NIGHT_INTRO, play a full night with the given taps and land in MORNING. */
function night(state, { kill, save, check } = {}) {
  let s = reducer(state, { type: 'ADVANCE' }); // -> MAFIA_TURN
  expect(s.phase).toBe(PHASES.MAFIA_TURN);
  if (kill) s = reducer(s, { type: 'SELECT', name: kill });
  s = reducer(s, { type: 'ADVANCE' }); // -> DOCTOR_TURN
  expect(s.phase).toBe(PHASES.DOCTOR_TURN);
  if (save) s = reducer(s, { type: 'SELECT', name: save });
  s = reducer(s, { type: 'ADVANCE' }); // -> DETECTIVE_TURN
  expect(s.phase).toBe(PHASES.DETECTIVE_TURN);
  if (check) s = reducer(s, { type: 'SELECT', name: check });
  s = reducer(s, { type: 'ADVANCE' }); // -> MORNING
  expect(s.phase).toBe(PHASES.MORNING);
  return s;
}

/** MORNING -> CHECK_WIN -> DAY_DISCUSS -> VOTE -> vote -> CHECK_WIN -> next phase */
function day(state, voteName) {
  let s = run(state, { type: 'ADVANCE' });
  expect(s.phase).toBe(PHASES.CHECK_WIN);
  s = reducer(s, { type: 'ADVANCE' });
  if (s.phase === PHASES.END) return s;
  expect(s.phase).toBe(PHASES.DAY_DISCUSS);
  s = run(s, { type: 'ADVANCE' });
  expect(s.phase).toBe(PHASES.VOTE);
  s = reducer(s, { type: 'VOTE', name: voteName });
  s = run(s, { type: 'ADVANCE' });
  expect(s.phase).toBe(PHASES.CHECK_WIN);
  return reducer(s, { type: 'ADVANCE' });
}

describe('phase flow', () => {
  it('SETUP -> DEAL -> NIGHT_INTRO with round 1', () => {
    let s = createInitialState();
    expect(s.phase).toBe(PHASES.SETUP);
    s = reducer(s, { type: 'NEW_GAME' });
    expect(s.phase).toBe(PHASES.DEAL);
    s = reducer(s, { type: 'START_NIGHT', players: FOUR });
    expect(s.phase).toBe(PHASES.NIGHT_INTRO);
    expect(s.round).toBe(1);
    expect(s.players.every((p) => p.alive)).toBe(true);
    expect(entryClips(s)).toEqual(['pass_hint', 'night_start']);
  });

  it('turns do not advance on tap, only on ADVANCE (timeout)', () => {
    let s = run(start(), { type: 'ADVANCE' });
    s = reducer(s, { type: 'SELECT', name: 'Bob' });
    expect(s.phase).toBe(PHASES.MAFIA_TURN);
    expect(s.night.selections.mafia ?? null).toBe('Bob');
  });

  it('no tap by timeout means no kill / no save / no result', () => {
    const s = night(start());
    expect(s.morning).toEqual({ victim: null, attacked: false, saved: false, detectiveFoundMafia: false });
    expect(s.players.every((p) => p.alive)).toBe(true);
    expect(s.night.result).toBeNull();
    expect(entryClips(s)).toEqual(['morning', 'saved']);
  });

  it('second night skips pass_hint and increments the round', () => {
    const s = day(night(start(), { kill: 'Bob', save: 'Dave' }), null);
    expect(s.phase).toBe(PHASES.NIGHT_INTRO);
    expect(s.round).toBe(2);
    expect(entryClips(s)).toEqual(['night_start']);
  });

  it('sleep clips per turn', () => {
    expect(exitClips(PHASES.MAFIA_TURN)).toEqual(['mafia_sleep']);
    expect(exitClips(PHASES.DOCTOR_TURN)).toEqual(['doctor_sleep']);
    expect(exitClips(PHASES.DETECTIVE_TURN)).toEqual(['detective_sleep']);
  });
});

describe('kill vs save', () => {
  it('kill target != save -> victim dies', () => {
    const s = night(start(), { kill: 'Bob', save: 'Dave' });
    expect(s.morning.victim).toBe('Bob');
    expect(s.players.find((p) => p.name === 'Bob').alive).toBe(false);
    expect(entryClips(s)).toEqual(['morning', 'killed']);
    expect(s.log[0]).toMatchObject({ round: 1, mafiaTarget: 'Bob', doctorSave: 'Dave', killed: 'Bob', saved: false });
  });

  it('kill target == save -> nobody dies', () => {
    const s = night(start(), { kill: 'Bob', save: 'Bob' });
    expect(s.morning).toEqual({ victim: null, attacked: true, saved: true, detectiveFoundMafia: false });
    expect(s.players.every((p) => p.alive)).toBe(true);
    expect(entryClips(s)).toEqual(['morning', 'saved']);
    expect(s.log[0]).toMatchObject({ killed: null, saved: true });
  });

  it('last mafia tap wins', () => {
    let s = run(start(), { type: 'ADVANCE' }, { type: 'SELECT', name: 'Bob' }, { type: 'SELECT', name: 'Carol' });
    expect(s.night.selections.mafia ?? null).toBe('Carol');
  });
});

describe('mafia cannot target mafia', () => {
  it('mafia targets exclude mafia and dead players', () => {
    const s = run(start(), { type: 'ADVANCE' });
    expect(selectTargets(s).map((t) => t.name)).toEqual(['Bob', 'Carol', 'Dave']);
  });

  it('selecting a mafia member is ignored', () => {
    const six = [
      { name: 'A', role: 'mafia' },
      { name: 'B', role: 'mafia' },
      ...FOUR.slice(1),
      { name: 'Eve', role: 'villager' },
    ];
    let s = run(start(six), { type: 'ADVANCE' }, { type: 'SELECT', name: 'B' });
    expect(s.night.selections.mafia ?? null).toBeNull();
    s = reducer(s, { type: 'SELECT', name: 'A' });
    expect(s.night.selections.mafia ?? null).toBeNull();
  });
});

describe('doctor repeat-save rule', () => {
  const toSecondDoctorTurn = (rules) => {
    let s = night(start(FOUR, rules), { save: 'Dave' });
    s = day(s, null); // tie
    return run(s, { type: 'ADVANCE' }, { type: 'ADVANCE' }); // -> DOCTOR_TURN of night 2
  };

  it('on by default: cannot save the same person two nights in a row', () => {
    let s = toSecondDoctorTurn();
    expect(s.phase).toBe(PHASES.DOCTOR_TURN);
    expect(s.lastSave).toBe('Dave');
    expect(selectTargets(s).find((t) => t.name === 'Dave')).toMatchObject({ disabled: true });
    s = reducer(s, { type: 'SELECT', name: 'Dave' });
    expect(s.night.selections.doctor ?? null).toBeNull();
    s = reducer(s, { type: 'SELECT', name: 'Carol' });
    expect(s.night.selections.doctor ?? null).toBe('Carol');
  });

  it('house rule off: repeat save allowed', () => {
    let s = toSecondDoctorTurn({ noRepeatSave: false });
    expect(selectTargets(s).find((t) => t.name === 'Dave').disabled).toBe(false);
    s = reducer(s, { type: 'SELECT', name: 'Dave' });
    expect(s.night.selections.doctor ?? null).toBe('Dave');
  });

  it('no save last night -> no restriction', () => {
    let s = day(night(start()), null);
    s = run(s, { type: 'ADVANCE' }, { type: 'ADVANCE' });
    expect(s.lastSave).toBeNull();
    expect(selectTargets(s).every((t) => !t.disabled)).toBe(true);
  });

  it('doctor can save themselves', () => {
    const s = run(start(), { type: 'ADVANCE' }, { type: 'ADVANCE' });
    expect(selectTargets(s).map((t) => t.name)).toContain('Carol');
  });
});

describe('dead roles still get their turn', () => {
  const six = [
    { name: 'M', role: 'mafia' },
    { name: 'Doc', role: 'doctor' },
    { name: 'Det', role: 'detective' },
    { name: 'V1', role: 'villager' },
    { name: 'V2', role: 'villager' },
    { name: 'V3', role: 'villager' },
  ];

  it('dead doctor: DOCTOR_TURN still happens, but the save is ignored', () => {
    let s = night(start(six), { kill: 'Doc' });
    expect(isRoleAlive(s, 'doctor')).toBe(false);
    s = day(s, null);
    s = run(s, { type: 'ADVANCE' }, { type: 'SELECT', name: 'V1' }, { type: 'ADVANCE' });
    expect(s.phase).toBe(PHASES.DOCTOR_TURN);
    s = reducer(s, { type: 'SELECT', name: 'V1' }); // dummy tap
    s = run(s, { type: 'ADVANCE' });
    expect(s.phase).toBe(PHASES.DETECTIVE_TURN);
    s = reducer(s, { type: 'ADVANCE' });
    expect(s.morning.victim).toBe('V1');
    expect(s.morning.saved).toBe(false);
  });

  it('dead detective: DETECTIVE_TURN still happens, no result', () => {
    let s = night(start(six), { kill: 'Det' });
    s = day(s, null);
    s = run(s, { type: 'ADVANCE' }, { type: 'ADVANCE' }, { type: 'ADVANCE' });
    expect(s.phase).toBe(PHASES.DETECTIVE_TURN);
    s = reducer(s, { type: 'SELECT', name: 'M' });
    expect(s.night.result).toBeNull();
  });
});

describe('detective', () => {
  it('learns isMafia(target), once per night, never themselves', () => {
    let s = run(start(), { type: 'ADVANCE' }, { type: 'ADVANCE' }, { type: 'ADVANCE' });
    expect(selectTargets(s).map((t) => t.name)).toEqual(['Alice', 'Bob', 'Carol']);
    s = reducer(s, { type: 'SELECT', name: 'Alice' });
    expect(s.night.result).toBe(true);
    s = reducer(s, { type: 'SELECT', name: 'Bob' });
    expect(s.night.selections.detective).toBe('Alice');
    const t = run(start(), { type: 'ADVANCE' }, { type: 'ADVANCE' }, { type: 'ADVANCE' }, { type: 'SELECT', name: 'Bob' });
    expect(t.night.result).toBe(false);
    s = reducer(s, { type: 'ADVANCE' });
    expect(s.log[0].detectiveCheck).toEqual({ target: 'Alice', isMafia: true });
  });
});

describe('morning: detective found a Mafia', () => {
  it('correct guess + kill -> killed, then detective_found (no name)', () => {
    const s = night(start(), { kill: 'Bob', save: 'Carol', check: 'Alice' });
    expect(s.morning).toMatchObject({ victim: 'Bob', detectiveFoundMafia: true });
    expect(entryClips(s)).toEqual(['morning', 'killed', 'detective_found']);
  });

  it('correct guess + save -> saved, then detective_found', () => {
    const s = night(start(), { kill: 'Bob', save: 'Bob', check: 'Alice' });
    expect(s.morning).toMatchObject({ victim: null, saved: true, detectiveFoundMafia: true });
    expect(entryClips(s)).toEqual(['morning', 'saved', 'detective_found']);
  });

  it('wrong guess -> nothing about the detective', () => {
    const k = night(start(), { kill: 'Bob', save: 'Carol', check: 'Carol' });
    expect(k.morning.detectiveFoundMafia).toBe(false);
    expect(entryClips(k)).toEqual(['morning', 'killed']);
    const v = night(start(), { kill: 'Bob', save: 'Bob', check: 'Bob' });
    expect(entryClips(v)).toEqual(['morning', 'saved']);
  });

  it('no check -> nothing about the detective', () => {
    const s = night(start(), { kill: 'Bob' });
    expect(s.morning.detectiveFoundMafia).toBe(false);
    expect(entryClips(s)).toEqual(['morning', 'killed']);
  });

  it('detective killed tonight still reports a check made while alive', () => {
    const s = night(start(), { kill: 'Dave', save: 'Carol', check: 'Alice' });
    expect(s.morning).toMatchObject({ victim: 'Dave', detectiveFoundMafia: true });
    expect(entryClips(s)).toEqual(['morning', 'killed', 'detective_found']);
  });

  it('dead detective (dummy turn) tapping a Mafia -> not announced', () => {
    const six = [
      { name: 'M', role: 'mafia' },
      { name: 'Doc', role: 'doctor' },
      { name: 'Det', role: 'detective' },
      { name: 'V1', role: 'villager' },
      { name: 'V2', role: 'villager' },
      { name: 'V3', role: 'villager' },
    ];
    let s = night(start(six), { kill: 'Det' });
    s = day(s, null);
    // night 2: kill V1, doctor saves V1, dead detective taps the real Mafia
    s = run(s, { type: 'ADVANCE' }, { type: 'SELECT', name: 'V1' }, { type: 'ADVANCE' }, { type: 'SELECT', name: 'V1' }, { type: 'ADVANCE' });
    expect(s.phase).toBe(PHASES.DETECTIVE_TURN);
    s = run(s, { type: 'SELECT', name: 'M' }, { type: 'ADVANCE' });
    expect(s.phase).toBe(PHASES.MORNING);
    expect(s.morning).toMatchObject({ saved: true, detectiveFoundMafia: false });
    expect(entryClips(s)).toEqual(['morning', 'saved']);
    // and with a kill
    let k = night(start(six), { kill: 'Det' });
    k = day(k, null);
    k = run(k, { type: 'ADVANCE' }, { type: 'SELECT', name: 'V2' }, { type: 'ADVANCE' }, { type: 'ADVANCE' }, { type: 'SELECT', name: 'M' }, { type: 'ADVANCE' });
    expect(k.morning).toMatchObject({ victim: 'V2', detectiveFoundMafia: false });
    expect(entryClips(k)).toEqual(['morning', 'killed']);
  });

  it('flag resets on the next night', () => {
    let s = night(start(), { kill: 'Bob', save: 'Carol', check: 'Alice' });
    s = day(s, null); // tie -> next night
    expect(s.phase).toBe(PHASES.NIGHT_INTRO);
    expect(s.morning).toBeNull();
  });
});

describe('narration sequence builder (names)', () => {
  const yes = { canSayName: () => true };
  const no = { canSayName: () => false };
  it('killed with name: pre + {name} + post', () => {
    expect(morningClips({ victim: 'Arjun', saved: false }, yes)).toEqual(['morning', 'killed_pre', { name: 'Arjun' }, 'killed_post']);
  });
  it('killed, name not speakable -> old "Look at the screen" line', () => {
    expect(morningClips({ victim: 'Arjun' }, no)).toEqual(['morning', 'killed']);
    expect(morningClips({ victim: 'Arjun' })).toEqual(['morning', 'killed']); // no opts
  });
  it('only names that can be said are said', () => {
    const only = { canSayName: (n) => n === 'Priya' };
    expect(morningClips({ victim: 'Arjun' }, only)).toEqual(['morning', 'killed']);
    expect(morningClips({ victim: 'Priya' }, only)).toEqual(['morning', 'killed_pre', { name: 'Priya' }, 'killed_post']);
  });
  it('saved never says a name', () => {
    expect(morningClips({ victim: null, saved: true }, yes)).toEqual(['morning', 'saved']);
  });
  it('detective_found follows the kill / save line, with or without names', () => {
    expect(morningClips({ victim: 'Arjun', detectiveFoundMafia: true }, yes)).toEqual(['morning', 'killed_pre', { name: 'Arjun' }, 'killed_post', 'detective_found']);
    expect(morningClips({ victim: 'Arjun', detectiveFoundMafia: true }, no)).toEqual(['morning', 'killed', 'detective_found']);
    expect(morningClips({ victim: null, saved: true, detectiveFoundMafia: true }, yes)).toEqual(['morning', 'saved', 'detective_found']);
  });
  it('entryClips(MORNING) uses the builder with the given opts', () => {
    const s = night(start(), { kill: 'Bob', save: 'Carol', check: 'Alice' });
    expect(entryClips(s, yes)).toEqual(['morning', 'killed_pre', { name: 'Bob' }, 'killed_post', 'detective_found']);
    expect(entryClips(s)).toEqual(['morning', 'killed', 'detective_found']);
  });
  it('voted out with name / fallback / tie / before the vote', () => {
    const base = start();
    expect(voteClips({ ...base, vote: { out: 'Alice', tie: false } }, yes)).toEqual(['voted_out_pre', { name: 'Alice' }, 'voted_out_post']);
    expect(voteClips({ ...base, vote: { out: 'Alice', tie: false } }, no)).toEqual(['voted_out']);
    expect(voteClips({ ...base, vote: { out: null, tie: true } }, yes)).toEqual(['tie']);
    expect(voteClips({ ...base, vote: null }, yes)).toBeNull();
  });
});

describe('win checks', () => {
  const mk = (roles, deadIdx = []) => roles.map((role, i) => ({ name: `P${i}`, role, alive: !deadIdx.includes(i) }));

  it('4 players (1 mafia)', () => {
    const r = ['mafia', 'villager', 'doctor', 'detective'];
    expect(computeWinner(mk(r)).winner).toBeNull();
    expect(computeWinner(mk(r, [1])).winner).toBeNull(); // 1 v 2
    expect(computeWinner(mk(r, [1, 2])).winner).toBe('mafia'); // 1 v 1
    expect(computeWinner(mk(r, [0])).winner).toBe('villagers');
  });

  it('6 players (1 mafia)', () => {
    const r = ['mafia', 'villager', 'villager', 'villager', 'doctor', 'detective'];
    expect(computeWinner(mk(r, [1, 2, 3])).winner).toBeNull(); // 1 v 2
    expect(computeWinner(mk(r, [1, 2, 3, 4])).winner).toBe('mafia'); // 1 v 1
    expect(computeWinner(mk(r, [0, 1])).winner).toBe('villagers');
  });

  it('7 players (2 mafia)', () => {
    const r = ['mafia', 'mafia', 'villager', 'villager', 'villager', 'doctor', 'detective'];
    expect(computeWinner(mk(r)).winner).toBeNull(); // 2 v 5
    expect(computeWinner(mk(r, [2, 3])).winner).toBeNull(); // 2 v 3
    expect(computeWinner(mk(r, [2, 3, 4])).winner).toBe('mafia'); // 2 v 2
    expect(computeWinner(mk(r, [0])).winner).toBeNull(); // 1 v 5
    expect(computeWinner(mk(r, [0, 1])).winner).toBe('villagers');
  });

  it('morning kill can end the game (mafia win)', () => {
    // 4 players, villager voted out on day 1, then mafia kills -> 1 v 1
    let s = night(start(), {});
    s = day(s, 'Bob');
    expect(s.phase).toBe(PHASES.NIGHT_INTRO);
    s = night(s, { kill: 'Carol' });
    s = run(s, { type: 'ADVANCE' }, { type: 'ADVANCE' });
    expect(s.phase).toBe(PHASES.END);
    expect(s.winner).toBe('mafia');
    expect(entryClips(s)).toEqual(['mafia_win']);
  });

  it('voting out the only mafia -> villagers win', () => {
    let s = night(start(), { kill: 'Bob', save: 'Dave' });
    s = day(s, 'Alice');
    expect(s.phase).toBe(PHASES.END);
    expect(s.winner).toBe('villagers');
    expect(entryClips(s)).toEqual(['villagers_win']);
    expect(s.log).toEqual([
      expect.objectContaining({ round: 1, killed: 'Bob', doctorSave: 'Dave', votedOut: 'Alice', tie: false }),
    ]);
  });
});

describe('vote', () => {
  it('tie vote -> no elimination, tie clip, next night', () => {
    let s = night(start(), { kill: 'Bob', save: 'Dave' });
    s = run(s, { type: 'ADVANCE' }, { type: 'ADVANCE' }, { type: 'ADVANCE' });
    expect(s.phase).toBe(PHASES.VOTE);
    expect(entryClips(s)).toEqual(['vote']);
    expect(reducer(s, { type: 'ADVANCE' })).toBe(s); // can't skip the vote
    s = reducer(s, { type: 'VOTE', name: null });
    expect(s.vote).toEqual({ out: null, tie: true });
    expect(voteClip(s)).toBe('tie');
    expect(s.players.filter((p) => p.alive)).toHaveLength(3);
    s = run(s, { type: 'ADVANCE' }, { type: 'ADVANCE' });
    expect(s.phase).toBe(PHASES.NIGHT_INTRO);
    expect(s.round).toBe(2);
    expect(s.log[0].tie).toBe(true);
  });

  it('voted out player dies; only one vote per day; dead players cannot be voted', () => {
    let s = night(start(), { kill: 'Bob' });
    s = run(s, { type: 'ADVANCE' }, { type: 'ADVANCE' }, { type: 'ADVANCE' });
    expect(selectTargets(s).map((t) => t.name)).not.toContain('Bob');
    expect(reducer(s, { type: 'VOTE', name: 'Bob' })).toBe(s);
    s = reducer(s, { type: 'VOTE', name: 'Carol' });
    expect(voteClip(s)).toBe('voted_out');
    expect(reducer(s, { type: 'VOTE', name: 'Dave' })).toBe(s);
  });
});

describe('night order from ROLE_DEFS', () => {
  it('orders turns by nightOrder and only includes dealt roles', () => {
    expect(nightOrderFor(['villager', 'detective', 'mafia', 'doctor'])).toEqual(['mafia', 'doctor', 'detective']);
    expect(nightOrderFor(['villager', 'mafia'])).toEqual(['mafia']);
  });

  it('a new role is picked up from the table (e.g. a Sheriff between Mafia and Doctor)', () => {
    const defs = { ...ROLE_DEFS, sheriff: { id: 'sheriff', team: 'village', nightOrder: 1.5, wakeClip: 'x', sleepClip: 'y', targetRule: 'alive', action: 'kill' } };
    expect(nightOrderFor(['mafia', 'sheriff', 'doctor', 'detective'], defs)).toEqual(['mafia', 'sheriff', 'doctor', 'detective']);
  });

  it('engine walks the phases in that order and uses the table clips', () => {
    let s = start();
    expect(s.nightOrder).toEqual(['mafia', 'doctor', 'detective']);
    const seen = [];
    s = reducer(s, { type: 'ADVANCE' });
    while (s.phase.endsWith('_TURN')) {
      seen.push([s.phase, entryClips(s)[0], exitClips(s.phase)[0]]);
      s = reducer(s, { type: 'ADVANCE' });
    }
    expect(seen).toEqual([
      ['MAFIA_TURN', ROLE_DEFS.mafia.wakeClip, ROLE_DEFS.mafia.sleepClip],
      ['DOCTOR_TURN', ROLE_DEFS.doctor.wakeClip, ROLE_DEFS.doctor.sleepClip],
      ['DETECTIVE_TURN', ROLE_DEFS.detective.wakeClip, ROLE_DEFS.detective.sleepClip],
    ]);
    expect(s.phase).toBe(PHASES.MORNING);
  });

  it('a game dealt without a doctor skips DOCTOR_TURN', () => {
    let s = start([{ name: 'A', role: 'mafia' }, { name: 'B', role: 'villager' }, { name: 'C', role: 'villager' }, { name: 'D', role: 'detective' }]);
    s = run(s, { type: 'ADVANCE' }, { type: 'ADVANCE' });
    expect(s.phase).toBe(PHASES.DETECTIVE_TURN);
  });

  it('allClipIds covers every narrator clip', () => {
    expect(allClipIds().sort()).toEqual(
      ['detective_result', 'detective_sleep', 'detective_wake', 'discuss', 'doctor_sleep', 'doctor_wake', 'killed', 'mafia_sleep', 'mafia_wake', 'mafia_win', 'morning', 'night_start', 'pass_hint', 'saved', 'detective_found', 'killed_pre', 'killed_post', 'voted_out_pre', 'voted_out_post', 'tie', 'villagers_win', 'vote', 'voted_out'].sort()
    );
  });
});

describe('save / restore', () => {
  it('round-trips a mid-night state', () => {
    const s = run(start(), { type: 'ADVANCE' }, { type: 'SELECT', name: 'Bob' }, { type: 'ADVANCE' });
    const restored = deserialize(serialize(s));
    expect(restored).toEqual(s);
    expect(restored.phase).toBe(PHASES.DOCTOR_TURN);
    expect(isResumable(restored)).toBe(true);
    // the restored game continues normally
    const m = run(restored, { type: 'SELECT', name: 'Dave' }, { type: 'ADVANCE' }, { type: 'ADVANCE' });
    expect(m.morning.victim).toBe('Bob');
  });

  it('RESTORE action loads a saved game', () => {
    const s = night(start(), { kill: 'Bob' });
    const r = reducer(createInitialState(), { type: 'RESTORE', saved: serialize(s) });
    expect(r).toEqual(s);
  });

  it('discards incompatible or corrupt saves', () => {
    const s = start();
    expect(deserialize(JSON.stringify({ ...s, version: ENGINE_VERSION + 1 }))).toBeNull();
    expect(deserialize(JSON.stringify({ ...s, version: undefined }))).toBeNull();
    expect(deserialize('{not json')).toBeNull();
    expect(deserialize(JSON.stringify({ ...s, phase: 'BOGUS' }))).toBeNull();
    expect(deserialize(JSON.stringify({ ...s, players: [{ name: 'X', role: 'wizard', alive: true }] }))).toBeNull();
    expect(deserialize(null)).toBeNull();
    const bad = createInitialState();
    expect(reducer(bad, { type: 'RESTORE', saved: 'garbage' })).toBe(bad);
  });

  it('only in-progress games are resumable', () => {
    expect(isResumable(createInitialState())).toBe(false);
    expect(isResumable(reducer(createInitialState(), { type: 'NEW_GAME' }))).toBe(false);
    expect(isResumable(start())).toBe(true);
    const end = day(night(start(), { kill: 'Bob', save: 'Dave' }), 'Alice');
    expect(end.phase).toBe(PHASES.END);
    expect(isResumable(end)).toBe(false);
  });
});

describe('stale ADVANCE guard', () => {
  it('ignores ADVANCE whose `from` does not match the current phase', () => {
    const s = start();
    expect(reducer(s, { type: 'ADVANCE', from: PHASES.MORNING })).toBe(s);
    const t = reducer(s, { type: 'ADVANCE', from: PHASES.NIGHT_INTRO });
    expect(t.phase).toBe(PHASES.MAFIA_TURN);
    expect(reducer(t, { type: 'ADVANCE', from: PHASES.NIGHT_INTRO })).toBe(t);
  });
});
