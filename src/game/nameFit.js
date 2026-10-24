// Player names can be up to 20 characters (NamesScreen maxLength). Small name slots (card labels,
// 3-column player tiles, the 2-column name picker) show the whole name: long names get a smaller
// font and wrap at spaces (a single very long word may still break as a last resort) instead of
// being cut off with an ellipsis.
export const LONG_NAME = 12;

/** Longest single word, so "Lakshmi Narayanan" (wraps at the space) is treated differently from "Venkataraghavan". */
const longestWord = (name) => Math.max(0, ...String(name).split(/\s+/).map((w) => w.length));

/**
 * Tailwind classes for a name in a narrow slot.
 * @param {string} name
 * @param {{ normal: string, long: string, veryLong?: string }} sizes font-size classes
 */
export function nameFitClass(name, { normal, long, veryLong = long }) {
  const n = String(name ?? '').trim();
  const size = longestWord(n) > 14 ? veryLong : n.length > LONG_NAME ? long : normal;
  return `${size} leading-tight break-words [overflow-wrap:anywhere]`;
}
