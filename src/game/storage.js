import { MIN_PLAYERS, MAX_PLAYERS } from './roles';
import { DEFAULT_TIMERS, normalizeTimers } from './timing';

const KEY = 'mafia-dealer:last-game';

export function loadLastGame() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const count = Number(data?.count);
    if (!Number.isInteger(count) || count < MIN_PLAYERS || count > MAX_PLAYERS) return null;
    const names = Array.isArray(data.names) ? data.names.filter((n) => typeof n === 'string') : [];
    return { count, names };
  } catch {
    return null;
  }
}

export function saveLastGame(count, names) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ count, names }));
  } catch {
    // storage unavailable (private mode etc.) - App state still keeps the values
  }
}

/** Build a list of exactly `count` names, reusing saved ones and filling with "Player N". */
export function namesForCount(count, savedNames = []) {
  const result = [];
  const used = new Set();
  for (const raw of savedNames) {
    if (result.length >= count) break;
    const name = raw.trim();
    if (!name || used.has(name.toLowerCase())) continue;
    result.push(name);
    used.add(name.toLowerCase());
  }
  // Fill empty seats with "Player N" (N = seat number when free, otherwise the next free number)
  let fallback = 1;
  while (result.length < count) {
    let candidate = `Player ${result.length + 1}`;
    while (used.has(candidate.toLowerCase())) candidate = `Player ${fallback++}`;
    result.push(candidate);
    used.add(candidate.toLowerCase());
  }
  return result;
}

const SETTINGS_KEY = 'mafia-dealer:settings';

export const DEFAULT_SETTINGS = Object.freeze({
  mode: 'human', // 'human' = Human Game Master, 'narrator' = App is Game Master
  voice: 'george', // 'george' | 'heart'
  muted: false,
  ambient: true,
  noRepeatSave: true,
  turnSec: DEFAULT_TIMERS.turnSec, // night role turn length (narrator mode)
  discussMin: DEFAULT_TIMERS.discussMin, // day discussion length (narrator mode)
});

export function loadSettings() {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return {
      mode: data.mode === 'narrator' ? 'narrator' : 'human',
      voice: data.voice === 'heart' ? 'heart' : 'george',
      muted: data.muted === true,
      ambient: data.ambient !== false,
      noRepeatSave: data.noRepeatSave !== false,
      ...normalizeTimers(data),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable
  }
}

// ---------- narrator game save (engine state, see engine.serialize/deserialize) ----------
const GAME_KEY = 'mafia-dealer:narrator-game';

export function loadSavedGameRaw() {
  try {
    return window.localStorage.getItem(GAME_KEY);
  } catch {
    return null;
  }
}

export function saveGameRaw(raw) {
  try {
    window.localStorage.setItem(GAME_KEY, raw);
  } catch {
    // ignore
  }
}

export function clearSavedGame() {
  try {
    window.localStorage.removeItem(GAME_KEY);
  } catch {
    // ignore
  }
}

const HINT_KEY = 'mafia-dealer:volume-hint-seen';
export const volumeHintSeen = () => {
  try {
    return window.localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
};
export const markVolumeHintSeen = () => {
  try {
    window.localStorage.setItem(HINT_KEY, '1');
  } catch {
    // ignore
  }
};
