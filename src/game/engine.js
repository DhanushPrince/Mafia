/**
 * Narrator-mode ("App is Game Master") game engine.
 *
 * A pure finite state machine: `reducer(state, action) -> state` plus selectors.
 * No React, no timers, no audio - the UI drives time (turn windows, clips) and
 * dispatches actions. Everything here is deterministic and unit-testable.
 *
 * Phases:
 *   SETUP -> DEAL -> NIGHT_INTRO -> <night turns from ROLE_DEFS by nightOrder>
 *   (MAFIA_TURN -> DOCTOR_TURN -> DETECTIVE_TURN) -> MORNING -> CHECK_WIN
 *   -> DAY_DISCUSS -> VOTE -> CHECK_WIN -> NIGHT_INTRO ...;  CHECK_WIN -> END on a win.
 *
 * Detective catch (house rule): when the Detective's check hits a real Mafia, that Mafia is
 * caught and dies at the morning resolution. Order: the night kill (minus the Doctor's save),
 * then the catch, then the win check - so catching the last Mafia always wins for the village,
 * even when the same night's kill would otherwise have given the Mafia parity.
 *
 * Night turns are data-driven: every role in ROLE_DEFS with a nightOrder that was
 * dealt this game gets a turn (even when all its players are dead, so nobody learns that).
 */
import { ROLE_DEFS } from './roles';
import { normalizeTimers } from './timing';

export const ENGINE_VERSION = 1;

export const PHASES = Object.freeze({
  SETUP: 'SETUP',
  DEAL: 'DEAL',
  NIGHT_INTRO: 'NIGHT_INTRO',
  MAFIA_TURN: 'MAFIA_TURN',
  DOCTOR_TURN: 'DOCTOR_TURN',
  DETECTIVE_TURN: 'DETECTIVE_TURN',
  MORNING: 'MORNING',
  CHECK_WIN: 'CHECK_WIN',
  DAY_DISCUSS: 'DAY_DISCUSS',
  VOTE: 'VOTE',
  END: 'END',
});

/** Turn phase name for a role id, e.g. 'mafia' -> 'MAFIA_TURN'. */
export const turnPhase = (roleId) => `${roleId.toUpperCase()}_TURN`;
export const isTurnPhase = (phase) => typeof phase === 'string' && phase.endsWith('_TURN');
/** Role id for a turn phase, e.g. 'DOCTOR_TURN' -> 'doctor'. */
export const turnRole = (phase) => (isTurnPhase(phase) ? phase.slice(0, -'_TURN'.length).toLowerCase() : null);

export const DEFAULT_RULES = Object.freeze({
  /** House rule: the Doctor cannot save the same person two nights in a row. */
  noRepeatSave: true,
});

/** Role ids that get a night turn, in nightOrder, limited to roles dealt in this game. */
export function nightOrderFor(dealtRoles, defs = ROLE_DEFS) {
  const present = new Set(dealtRoles);
  return Object.values(defs)
    .filter((d) => d.nightOrder != null && present.has(d.id))
    .sort((a, b) => a.nightOrder - b.nightOrder)
    .map((d) => d.id);
}

const emptyNight = () => ({ selections: {}, result: null });

/** Narrator language saved with the game: 'ta' (Tamil, the default) | 'en'. */
export const GAME_LANGS = ['ta', 'en'];
export const normalizeGameLang = (lang, fallback = 'ta') => (GAME_LANGS.includes(lang) ? lang : fallback);

export function createInitialState(rules = {}, timers = undefined, lang = undefined) {
  return {
    version: ENGINE_VERSION,
    phase: PHASES.SETUP,
    rules: { ...DEFAULT_RULES, ...rules },
    timers: normalizeTimers(timers), // { turnSec, discussMin } chosen at setup; saved with the game
    lang: normalizeGameLang(lang), // narrator language chosen at setup; saved with the game
    players: [], // [{ name, role, alive }]
    nightOrder: [], // role ids with a night turn this game
    round: 0, // night/day counter, 1-based once the first night starts
    night: emptyNight(), // selections: { [roleId]: name }, result: detective answer
    lastSave: null, // who the Doctor saved last night (repeat-save rule)
    morning: null, // { victim, attacked, saved, detectiveFoundMafia, caught }
    vote: null, // { out, tie } once the village has voted this day
    resumeTo: null, // where CHECK_WIN goes when nobody has won
    winner: null, // 'villagers' | 'mafia'
    log: [],
  };
}

const newLogEntry = (round) => ({
  round,
  mafiaTarget: null,
  doctorSave: null,
  detectiveCheck: null, // { target, isMafia }
  killed: null,
  saved: false,
  caught: null, // Mafia caught by the Detective this night
  votedOut: null,
  tie: false,
});

// ---------- selectors ----------

export const defFor = (roleId) => ROLE_DEFS[roleId] || null;
export const teamOf = (role) => defFor(role)?.team || 'village';
export const alivePlayers = (state) => state.players.filter((p) => p.alive);
export const findPlayer = (state, name) => state.players.find((p) => p.name === name) || null;
export const isMafia = (state, name) => teamOf(findPlayer(state, name)?.role) === 'mafia';
export const isRoleAlive = (state, role) => state.players.some((p) => p.role === role && p.alive);
/** Role awake in the current phase (or null). */
export const currentTurnRole = (state) => (isTurnPhase(state.phase) ? turnRole(state.phase) : null);

/** Win check on a player list ({ role, alive }). */
export function computeWinner(players) {
  const alive = players.filter((p) => p.alive);
  const mafiaAlive = alive.filter((p) => teamOf(p.role) === 'mafia').length;
  const othersAlive = alive.length - mafiaAlive;
  let winner = null;
  if (mafiaAlive === 0) winner = 'villagers';
  else if (mafiaAlive >= othersAlive) winner = 'mafia';
  return { mafiaAlive, othersAlive, winner };
}
export const selectWinner = (state) => computeWinner(state.players).winner;

const ok = (p) => ({ name: p.name, disabled: false, reason: null });

/** Who a role may tap at night. (state, def) -> [{ name, disabled, reason }] */
export const TARGET_RULES = {
  alive: (state) => alivePlayers(state).map(ok),
  aliveNotOwnTeam: (state, def) => alivePlayers(state).filter((p) => teamOf(p.role) !== def.team).map(ok),
  aliveExceptSelf: (state, def) => alivePlayers(state).filter((p) => p.role !== def.id).map(ok),
  aliveNoRepeatSave: (state) =>
    alivePlayers(state).map((p) => {
      const blocked = state.rules.noRepeatSave && state.lastSave === p.name;
      return { name: p.name, disabled: blocked, reason: blocked ? 'Saved last night' : null };
    }),
};

/**
 * What a night tap does.
 *  select(state, def, target) -> partial night patch (or null to ignore the tap)
 *  resolve(ctx, { state, def, target, roleAlive }) collects effects for the morning.
 */
export const ACTIONS = {
  kill: {
    select: () => ({}), // last tap wins
    resolve: (ctx, { target }) => {
      if (target) ctx.attacks.push(target);
      ctx.log.mafiaTarget = target || null;
    },
  },
  save: {
    select: () => ({}),
    resolve: (ctx, { target, roleAlive }) => {
      // a dead Doctor's dummy turn is recorded but ignored
      const save = roleAlive ? target || null : null;
      if (save) ctx.protects.push(save);
      ctx.lastSave = save;
      ctx.log.doctorSave = save;
    },
  },
  investigate: {
    lockOnFirst: true, // one investigation per night
    select: (state, def, target, roleAlive) => ({ result: roleAlive ? teamOf(target.role) === 'mafia' : null }),
    resolve: (ctx, { state, target }) => {
      ctx.log.detectiveCheck =
        target && state.night.result !== null ? { target, isMafia: state.night.result } : null;
      // only a real (alive at dusk) Detective who checked an actual Mafia: that Mafia is caught
      ctx.detectiveFoundMafia = Boolean(target) && state.night.result === true;
      if (ctx.detectiveFoundMafia) ctx.catches.push(target);
    },
  },
};

/** Tap targets for the current phase: [{ name, disabled, reason }]. */
export function selectTargets(state) {
  if (state.phase === PHASES.VOTE) return alivePlayers(state).map(ok);
  const def = defFor(currentTurnRole(state));
  if (!def || !TARGET_RULES[def.targetRule]) return [];
  return TARGET_RULES[def.targetRule](state, def);
}

/** What the current night turn has selected (for highlighting). */
export const selectCurrentSelection = (state) => state.night.selections[currentTurnRole(state)] ?? null;
export const selectSelection = (state, roleId) => state.night.selections[roleId] ?? null;
/** Detective's answer this night: true (Mafia) / false (not Mafia) / null. */
export const selectDetectiveResult = (state) => state.night.result;

/**
 * Narration items are clip ids (strings) or { name } for a synthesised player name.
 * `opts.canSayName(name)` says whether the name can be spoken right now (Kokoro clip ready or
 * speechSynthesis available); otherwise the old "Look at the screen" lines are used.
 */
const sayName = (opts, name) => Boolean(name && opts && typeof opts.canSayName === 'function' && opts.canSayName(name));

/**
 * Morning summary: Mafia/Doctor outcome, then (only on a correct check) the Detective's catch:
 * "The Detective found one of the Mafia last night. <name> has been eliminated." Nothing is said
 * about a wrong check. Without a speakable name only the first sentence is said (the screen names them).
 */
export function morningClips(morning, opts = {}) {
  const victim = morning?.victim;
  const caught = morning?.caught;
  let outcome;
  if (victim) outcome = sayName(opts, victim) ? ['killed_pre', { name: victim }, 'killed_post'] : ['killed'];
  else outcome = ['saved'];
  let detective = [];
  if (caught && sayName(opts, caught)) detective = ['detective_found', { name: caught }, 'voted_out_post'];
  else if (caught || morning?.detectiveFoundMafia) detective = ['detective_found'];
  return ['morning', ...outcome, ...detective];
}

/** Vote outcome narration (array), or null before the vote. */
export function voteClips(state, opts = {}) {
  if (!state.vote) return null;
  if (state.vote.tie || !state.vote.out) return ['tie'];
  return sayName(opts, state.vote.out) ? ['voted_out_pre', { name: state.vote.out }, 'voted_out_post'] : ['voted_out'];
}

/** Clip ids the narrator says when the current phase is entered. */
export function entryClips(state, opts = {}) {
  const def = defFor(currentTurnRole(state));
  if (def) return def.wakeClip ? [def.wakeClip] : [];
  switch (state.phase) {
    case PHASES.NIGHT_INTRO:
      return state.round === 1 ? ['pass_hint', 'night_start'] : ['night_start'];
    case PHASES.MORNING:
      return morningClips(state.morning, opts);
    case PHASES.DAY_DISCUSS:
      return ['discuss'];
    case PHASES.VOTE:
      return ['vote'];
    case PHASES.END:
      return [state.winner === 'mafia' ? 'mafia_win' : 'villagers_win'];
    default:
      return [];
  }
}

/** Clip ids said when a night turn's window ends. */
export function exitClips(phase) {
  const def = defFor(turnRole(phase));
  return def?.sleepClip ? [def.sleepClip] : [];
}

export const voteClip = (state) => (state.vote ? (state.vote.tie ? 'tie' : 'voted_out') : null);

/** Every clip id the game can use (for preloading). */
export function allClipIds() {
  const ids = new Set(['pass_hint', 'night_start', 'morning', 'killed', 'saved', 'discuss', 'vote', 'voted_out', 'tie', 'villagers_win', 'mafia_win', 'detective_found', 'killed_pre', 'killed_post', 'voted_out_pre', 'voted_out_post']);
  Object.values(ROLE_DEFS).forEach((d) => [d.wakeClip, d.sleepClip, d.resultClip].forEach((c) => c && ids.add(c)));
  return [...ids];
}

// ---------- reducer helpers ----------

function updateLog(state, round, patch) {
  return state.log.some((e) => e.round === round)
    ? state.log.map((e) => (e.round === round ? { ...e, ...patch } : e))
    : [...state.log, { ...newLogEntry(round), ...patch }];
}

const killPlayer = (players, name) => players.map((p) => (p.name === name ? { ...p, alive: false } : p));

function startNight(state) {
  const round = state.round + 1;
  return {
    ...state,
    phase: PHASES.NIGHT_INTRO,
    round,
    night: emptyNight(),
    morning: null,
    vote: null,
    resumeTo: null,
    log: updateLog(state, round, {}),
  };
}

/**
 * Run every turn's action resolver, then apply deaths: first the night kill (attacked and not
 * protected), then the Detective's catch (the Doctor's save does not stop a catch). The win
 * check comes after, in CHECK_WIN.
 */
function resolveNight(state) {
  const ctx = { attacks: [], protects: [], catches: [], lastSave: null, detectiveFoundMafia: false, log: {} };
  state.nightOrder.forEach((roleId) => {
    const def = defFor(roleId);
    const action = def && ACTIONS[def.action];
    if (!action) return;
    action.resolve(ctx, { state, def, target: state.night.selections[roleId] ?? null, roleAlive: isRoleAlive(state, roleId) });
  });
  const deaths = [...new Set(ctx.attacks.filter((t) => !ctx.protects.includes(t)))];
  const victim = deaths[0] || null;
  const attacked = ctx.attacks.length > 0;
  const saved = attacked && deaths.length === 0;
  const afterKill = deaths.reduce(killPlayer, state.players);
  // a catch needs a living Mafia after the kill (Mafia never target Mafia; guard anyway)
  const caught = ctx.catches.find((t) => isMafia(state, t) && afterKill.some((p) => p.name === t && p.alive)) || null;
  return {
    ...state,
    phase: PHASES.MORNING,
    players: caught ? killPlayer(afterKill, caught) : afterKill,
    morning: { victim, attacked, saved, detectiveFoundMafia: ctx.detectiveFoundMafia, caught },
    lastSave: ctx.lastSave,
    log: updateLog(state, state.round, { ...ctx.log, killed: victim, saved, caught }),
  };
}

function nextAfterTurn(state) {
  const i = state.nightOrder.indexOf(currentTurnRole(state));
  const next = state.nightOrder[i + 1];
  return next ? { ...state, phase: turnPhase(next) } : resolveNight(state);
}

function select(state, name) {
  const roleId = currentTurnRole(state);
  const def = defFor(roleId);
  const action = def && ACTIONS[def.action];
  const target = findPlayer(state, name);
  if (!action || !target || !target.alive) return state;
  const allowed = selectTargets(state).find((t) => t.name === name);
  if (!allowed || allowed.disabled) return state;
  if (action.lockOnFirst && state.night.selections[roleId]) return state;
  const patch = action.select(state, def, target, isRoleAlive(state, roleId));
  if (!patch) return state;
  return { ...state, night: { ...state.night, ...patch, selections: { ...state.night.selections, [roleId]: name } } };
}

// ---------- reducer ----------

export function reducer(state, action) {
  switch (action.type) {
    case 'RESET':
      return createInitialState({ ...state.rules, ...(action.rules || {}) });

    case 'NEW_GAME': // SETUP -> DEAL
      return { ...createInitialState({ ...state.rules, ...(action.rules || {}) }, action.timers ?? state.timers, action.lang ?? state.lang), phase: PHASES.DEAL };

    case 'RESTORE': {
      const restored = deserialize(action.saved);
      return restored || state;
    }

    case 'START_NIGHT': {
      if (state.phase !== PHASES.DEAL) return state;
      const players = (action.players || []).map((p) => ({ name: p.name, role: p.role, alive: true }));
      if (players.length === 0) return state;
      const nightOrder = nightOrderFor(players.map((p) => p.role));
      return startNight({ ...state, players, nightOrder, round: 0, log: [] });
    }

    case 'SELECT':
      return select(state, action.name);

    case 'VOTE': {
      // name = voted-out player, or null for a tie / no elimination
      if (state.phase !== PHASES.VOTE || state.vote) return state;
      if (action.name == null) {
        return { ...state, vote: { out: null, tie: true }, log: updateLog(state, state.round, { tie: true }) };
      }
      const target = findPlayer(state, action.name);
      if (!target || !target.alive) return state;
      return {
        ...state,
        players: killPlayer(state.players, action.name),
        vote: { out: action.name, tie: false },
        log: updateLog(state, state.round, { votedOut: action.name }),
      };
    }

    case 'ADVANCE':
      // `from` guards against stale timers / double taps advancing twice
      if (action.from && action.from !== state.phase) return state;
      if (isTurnPhase(state.phase)) return nextAfterTurn(state);
      switch (state.phase) {
        case PHASES.NIGHT_INTRO:
          return state.nightOrder.length ? { ...state, phase: turnPhase(state.nightOrder[0]) } : resolveNight(state);
        case PHASES.MORNING:
          return { ...state, phase: PHASES.CHECK_WIN, resumeTo: PHASES.DAY_DISCUSS };
        case PHASES.DAY_DISCUSS:
          return { ...state, phase: PHASES.VOTE };
        case PHASES.VOTE:
          return state.vote ? { ...state, phase: PHASES.CHECK_WIN, resumeTo: PHASES.NIGHT_INTRO } : state;
        case PHASES.CHECK_WIN: {
          const winner = selectWinner(state);
          if (winner) return { ...state, phase: PHASES.END, winner, resumeTo: null };
          if (state.resumeTo === PHASES.NIGHT_INTRO) return startNight(state);
          return { ...state, phase: state.resumeTo || PHASES.DAY_DISCUSS, resumeTo: null };
        }
        default:
          return state;
      }

    default:
      return state;
  }
}

// ---------- persistence ----------

/** Only games that have started (players dealt) and not ended are worth resuming. */
export const isResumable = (state) =>
  Boolean(state) && state.players?.length > 0 && ![PHASES.SETUP, PHASES.DEAL, PHASES.END].includes(state.phase);

export function serialize(state) {
  return JSON.stringify({ ...state, version: ENGINE_VERSION });
}

const KNOWN_PHASES = new Set(Object.values(PHASES));

/** Parse + validate a saved game; returns null for anything incompatible or corrupt. */
export function deserialize(raw) {
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data || data.version !== ENGINE_VERSION) return null;
    if (!KNOWN_PHASES.has(data.phase) && !(isTurnPhase(data.phase) && defFor(turnRole(data.phase)))) return null;
    if (!Array.isArray(data.players) || !data.players.every((p) => p && typeof p.name === 'string' && defFor(p.role) && typeof p.alive === 'boolean')) return null;
    if (!Array.isArray(data.nightOrder) || !data.nightOrder.every((r) => defFor(r))) return null;
    if (!data.night || typeof data.night.selections !== 'object' || !Array.isArray(data.log)) return null;
    // saves from before Tamil narration were English games
    const base = createInitialState(data.rules, data.timers, normalizeGameLang(data.lang, 'en'));
    // saves from before configurable timers have no `timers`: they get the defaults
    return { ...base, ...data, rules: { ...base.rules, ...(data.rules || {}) }, timers: base.timers, lang: base.lang };
  } catch {
    return null;
  }
}
