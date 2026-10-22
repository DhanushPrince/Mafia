import { MIN_PLAYERS, MAX_PLAYERS } from './roles';

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
