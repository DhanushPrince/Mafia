/**
 * Display-name rules for online rooms. Shared by the app (instant feedback) and the room
 * Durable Object (the authority). Players are identified by seat id; names are labels only.
 *
 *  - normalizeName: NFC, trim, collapse runs of whitespace to one space
 *  - validateName:  2-16 characters (grapheme clusters, so Tamil letters with vowel signs count once),
 *                   letters / marks / digits / space . ' - only, at least one letter (no blank or emoji-only)
 *  - nameKey:       case-insensitive comparison key (Unicode lower case of the normalized name)
 */
export const NAME_MIN = 2;
export const NAME_MAX = 16;

export function normalizeName(raw) {
  return String(raw ?? '')
    .normalize('NFC')
    .replace(/[\u200B\uFEFF]/gu, '') // zero-width space / BOM (ZWJ and ZWNJ are kept: Indic scripts use them)
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/ {2,}/g, ' ');
}

const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
export const nameLength = (name) => (segmenter ? [...segmenter.segment(name)].length : [...name].length);

const ALLOWED = /^[\p{L}\p{M}\p{N} .'\u2019\-\u200C\u200D]+$/u;
const HAS_LETTER = /\p{L}/u;

/** { ok: true, name } with the normalized name, or { ok: false, error } with a short message. */
export function validateName(raw) {
  const name = normalizeName(raw);
  if (!name) return { ok: false, error: 'Enter a name' };
  const len = nameLength(name);
  if (len < NAME_MIN) return { ok: false, error: `At least ${NAME_MIN} characters` };
  if (len > NAME_MAX) return { ok: false, error: `At most ${NAME_MAX} characters` };
  if (!HAS_LETTER.test(name)) return { ok: false, error: 'Use at least one letter' };
  if (!ALLOWED.test(name)) return { ok: false, error: 'Letters, numbers, spaces, . \' - only' };
  return { ok: true, name };
}

export const nameKey = (raw) => normalizeName(raw).toLowerCase();

/** True when another member (not `exceptSeat`) already uses this name, ignoring case and spacing. */
export function isNameTaken(members, raw, exceptSeat = null) {
  const key = nameKey(raw);
  return members.some((m) => m.seat !== exceptSeat && nameKey(m.name) === key);
}

export const FUN_NAMES = [
  'Midnight Mango', 'Silent Owl', 'Sneaky Tiger', 'Masala Ninja', 'Filter Kaapi', 'Lucky Lotus', 'Moonlit Fox',
  'Shadow Parrot', 'Jolly Jackfruit', 'Rapid Rasam', 'Captain Idli', 'Quiet Peacock', 'Velvet Cobra', 'Golden Gecko',
  'குட்டி புலி', 'மின்னல்', 'நிலா', 'மயில்', 'சிங்கம்', 'கருப்பு பூனை',
];

export function randomFunName(rand = Math.random, avoid = []) {
  const avoidKeys = new Set(avoid.map(nameKey));
  const free = FUN_NAMES.filter((n) => !avoidKeys.has(nameKey(n)));
  const pool = free.length ? free : FUN_NAMES;
  return pool[Math.floor(rand() * pool.length)];
}

/** Cut a name to `max` graphemes (keeps Tamil clusters whole). */
function clip(name, max) {
  if (nameLength(name) <= max) return name;
  const parts = segmenter ? [...segmenter.segment(name)].map((s) => s.segment) : [...name];
  return parts.slice(0, max).join('').trim();
}

/**
 * Up to `count` free names close to the one that was taken, e.g. 'Karthik K', 'Karthik 2', plus a random fun name.
 * Every suggestion passes validateName and is free in `members`.
 */
export function suggestNames(members, raw, { count = 3, rand = Math.random } = {}) {
  const base = normalizeName(raw) || 'Player';
  const out = [];
  const free = (n) => validateName(n).ok && !isNameTaken(members, n) && !out.some((o) => nameKey(o) === nameKey(n));
  const letters = 'ABCDEFGHJKMNPRSTVW';
  const first = [...base][0]?.toUpperCase();
  const initials = [first, ...letters].filter((l) => l && /\p{Lu}/u.test(l));
  for (const l of initials) {
    const n = `${clip(base, NAME_MAX - 2)} ${l}`;
    if (free(n)) { out.push(n); break; }
  }
  for (let i = 2; i < 100 && out.length < count - 1; i++) {
    const suffix = ` ${i}`;
    const n = `${clip(base, NAME_MAX - suffix.length)}${suffix}`;
    if (free(n)) out.push(n);
  }
  for (let tries = 0; tries < 20 && out.length < count; tries++) {
    const n = randomFunName(rand, [...members.map((m) => m.name), ...out]);
    if (free(n)) out.push(n);
  }
  return out.slice(0, count);
}
