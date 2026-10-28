/**
 * Narrator timings.
 *
 * The night-turn and discussion lengths are chosen on the setup screen (saved in settings and in the
 * narrator game itself, so a resumed game keeps its timers). `?fast=1` overrides everything with short
 * values for e2e tests.
 */

/** Night role turn presets (seconds) and day discussion presets (minutes). */
export const TURN_OPTIONS_SEC = Object.freeze([10, 15, 20, 30, 45, 60]);
export const DISCUSS_OPTIONS_MIN = Object.freeze([1, 2, 3, 5, 10]);

export const DEFAULT_TIMERS = Object.freeze({ turnSec: 15, discussMin: 3 });

const FAST = Object.freeze({ turnMs: 3000, discussMs: 4000, gapMs: 150, rate: 3 });
const NORMAL_GAP_MS = 1200;

/** `?fast=1` in the given query string (defaults to the current page). */
export function isFastMode(search) {
  const q = search ?? (typeof window !== 'undefined' ? window.location.search : '');
  try {
    return new URLSearchParams(q).get('fast') === '1';
  } catch {
    return false;
  }
}

/** Keep only preset values; anything else falls back to the default. */
export function normalizeTimers(timers) {
  const t = timers && typeof timers === 'object' ? timers : {};
  const turnSec = Number(t.turnSec);
  const discussMin = Number(t.discussMin);
  return {
    turnSec: TURN_OPTIONS_SEC.includes(turnSec) ? turnSec : DEFAULT_TIMERS.turnSec,
    discussMin: DISCUSS_OPTIONS_MIN.includes(discussMin) ? discussMin : DEFAULT_TIMERS.discussMin,
  };
}

/** Concrete millisecond timings for a game. `fast` (default: `?fast=1`) overrides the chosen timers. */
export function timingFor(timers, { fast = isFastMode() } = {}) {
  if (fast) return { fast: true, ...FAST };
  const { turnSec, discussMin } = normalizeTimers(timers);
  const turnMs = turnSec * 1000;
  return { fast: false, turnMs, discussMs: discussMin * 60000, gapMs: NORMAL_GAP_MS, rate: 1 };
}

/** Time left in a window of `totalMs` ending at `endsAt` (never more than the window, never negative). */
export function remainingMs(endsAt, now, totalMs) {
  if (!endsAt) return totalMs;
  return Math.max(0, Math.min(totalMs, endsAt - now));
}

/** Default timings (still used for the playback rate and the e2e crash hook). */
export const TIMING = timingFor(DEFAULT_TIMERS);

export const formatTurn = (sec) => `${sec}s`;
export const formatDiscuss = (min) => `${min} min`;
