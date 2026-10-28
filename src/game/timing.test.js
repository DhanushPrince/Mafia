import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_TIMERS, TURN_OPTIONS_SEC, DISCUSS_OPTIONS_MIN, normalizeTimers, timingFor, isFastMode, remainingMs,
} from './timing';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from './storage';
import { reducer, createInitialState, serialize, deserialize, PHASES } from './engine';

describe('timer presets', () => {
  it('defaults to a 15 s night turn and 3 min discussion', () => {
    expect(DEFAULT_TIMERS).toEqual({ turnSec: 15, discussMin: 3 });
    expect(TURN_OPTIONS_SEC).toEqual([10, 15, 20, 30, 45, 60]);
    expect(DISCUSS_OPTIONS_MIN).toEqual([1, 2, 3, 5, 10]);
  });

  it('default timings match the old hard-coded values', () => {
    expect(timingFor(undefined, { fast: false })).toEqual({ fast: false, turnMs: 15000, discussMs: 180000, gapMs: 1200, rate: 1 });
  });

  it('uses the chosen timers', () => {
    const t = timingFor({ turnSec: 30, discussMin: 1 }, { fast: false });
    expect(t.turnMs).toBe(30000);
    expect(t.discussMs).toBe(60000);
  });

  it('has no Detective reading time: the answer is never shown at night (ADR 0013)', () => {
    expect(timingFor({ turnSec: 30, discussMin: 1 }, { fast: false })).not.toHaveProperty('resultMs');
    expect(timingFor(undefined, { fast: true })).not.toHaveProperty('resultMs');
  });

  it('rejects values that are not presets', () => {
    expect(normalizeTimers({ turnSec: 7, discussMin: 99 })).toEqual(DEFAULT_TIMERS);
    expect(normalizeTimers({ turnSec: '45', discussMin: '10' })).toEqual({ turnSec: 45, discussMin: 10 });
    expect(normalizeTimers(null)).toEqual(DEFAULT_TIMERS);
    expect(normalizeTimers({ turnSec: -1, discussMin: 'x' })).toEqual(DEFAULT_TIMERS);
  });

  it('?fast=1 overrides the chosen timers', () => {
    expect(isFastMode('?fast=1&tts=none')).toBe(true);
    expect(isFastMode('?fast=0')).toBe(false);
    expect(isFastMode('')).toBe(false);
    const t = timingFor({ turnSec: 60, discussMin: 10 }, { fast: true });
    expect(t).toMatchObject({ fast: true, turnMs: 3000, discussMs: 4000 });
  });
});

describe('remainingMs', () => {
  it('is the full window before it starts', () => expect(remainingMs(null, 0, 30000)).toBe(30000));
  it('counts down', () => expect(remainingMs(100000, 80000, 30000)).toBe(20000));
  it('never shows more than the window when the clock is stale (regression: "39" for a 30 s turn)', () => {
    expect(remainingMs(100000, 61000, 30000)).toBe(30000);
  });
  it('never goes negative', () => expect(remainingMs(100000, 120000, 30000)).toBe(0));
});

describe('timer persistence', () => {
  let store;
  beforeEach(() => {
    store = new Map();
    globalThis.window = {
      localStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
      },
      location: { search: '' },
    };
  });
  afterEach(() => {
    delete globalThis.window;
  });

  it('settings default to the default timers', () => {
    expect(loadSettings()).toMatchObject({ turnSec: 15, discussMin: 3 });
    expect(DEFAULT_SETTINGS).toMatchObject({ turnSec: 15, discussMin: 3 });
  });

  it('settings keep the chosen timers across reloads', () => {
    saveSettings({ ...loadSettings(), mode: 'narrator', turnSec: 30, discussMin: 1 });
    expect(loadSettings()).toMatchObject({ mode: 'narrator', turnSec: 30, discussMin: 1 });
  });

  it('corrupt stored timers fall back to the defaults', () => {
    store.set('mafia-dealer:settings', JSON.stringify({ turnSec: 999, discussMin: 'soon' }));
    expect(loadSettings()).toMatchObject({ turnSec: 15, discussMin: 3 });
  });
});

describe('timers in the narrator game state', () => {
  const players = [
    { name: 'A', role: 'mafia' }, { name: 'B', role: 'doctor' }, { name: 'C', role: 'detective' }, { name: 'D', role: 'villager' },
  ];

  it('NEW_GAME stores the chosen timers and a resumed game keeps them', () => {
    let s = reducer(createInitialState(), { type: 'NEW_GAME', timers: { turnSec: 45, discussMin: 5 } });
    expect(s.timers).toEqual({ turnSec: 45, discussMin: 5 });
    s = reducer(s, { type: 'START_NIGHT', players });
    expect(s.phase).toBe(PHASES.NIGHT_INTRO);
    const restored = deserialize(serialize(s));
    expect(restored.timers).toEqual({ turnSec: 45, discussMin: 5 });
    expect(timingFor(restored.timers, { fast: false })).toMatchObject({ turnMs: 45000, discussMs: 300000 });
  });

  it('a save without timers (older version) resumes with the defaults', () => {
    let s = reducer(createInitialState(), { type: 'NEW_GAME' });
    s = reducer(s, { type: 'START_NIGHT', players });
    const { timers, ...old } = s;
    expect(timers).toEqual(DEFAULT_TIMERS);
    expect(deserialize(JSON.stringify(old)).timers).toEqual(DEFAULT_TIMERS);
  });

  it('invalid timers in a save are normalised', () => {
    let s = reducer(createInitialState(), { type: 'NEW_GAME', timers: { turnSec: 30, discussMin: 1 } });
    s = reducer(s, { type: 'START_NIGHT', players });
    expect(deserialize(JSON.stringify({ ...s, timers: { turnSec: 1, discussMin: 1 } })).timers).toEqual({ turnSec: 15, discussMin: 1 });
  });
});
