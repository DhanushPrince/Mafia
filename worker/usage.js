/**
 * Anonymous usage events (ADR 0014). The Room writes one Analytics Engine data point per event:
 * a room created, a new guest joined, a game started, a game finished. Nothing personal goes in:
 * no display names, no guest secrets, no seat ids. A guest is counted as a salted hash of their
 * seat id, so a day's unique guests can be counted but not linked back to a seat in any room view.
 *
 * Data point layout (dataset `mafia_usage`):
 *   index1 = room code   blob1 = event   blob2 = room code   blob3 = guest hash ('' if none)
 *   blob4 = day (YYYY-MM-DD, Asia/Kolkata)   double1 = player count
 */
import { PHASES } from '../src/game/engine.js';

export const EVENTS = Object.freeze({ CREATE: 'room_create', JOIN: 'join', START: 'game_start', END: 'game_end' });
export const STATS_TZ = 'Asia/Kolkata';
export const STATS_DAYS = 30;

const enc = new TextEncoder();
export async function guestHash(seat) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(`mafia-usage:${seat}`));
  return [...new Uint8Array(digest).slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Calendar day of `ms` in the stats time zone, e.g. '2026-10-28'. */
export const dayOf = (ms, tz = STATS_TZ) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));

const gamePlayers = (room) => room?.game?.players?.length ?? 0;
const ended = (room) => room?.status === 'game' && room.game?.phase === PHASES.END;

/**
 * Events implied by one room transition `before` -> `after` (either may be null).
 * Returns [{ event, seat?, players }]. e2e rooms (settings.fast) are never counted.
 */
export function usageEvents(before, after) {
  if (!after || after.settings?.fast) return [];
  const out = [];
  if (!before) out.push({ event: EVENTS.CREATE, players: 0 });
  const had = new Set((before?.members || []).map((m) => m.seat));
  for (const m of after.members) if (!had.has(m.seat)) out.push({ event: EVENTS.JOIN, seat: m.seat, players: after.members.length });
  if (after.status === 'game' && after.game && before?.status !== 'game') {
    out.push({ event: EVENTS.START, players: gamePlayers(after) });
  }
  if (ended(after) && !ended(before)) out.push({ event: EVENTS.END, players: gamePlayers(after) });
  return out;
}

/** Write the events of one transition. Never throws: stats must not break a room. */
export async function recordUsage(env, code, before, after, now = Date.now()) {
  const ds = env?.USAGE;
  if (!ds?.writeDataPoint) return 0;
  const events = usageEvents(before, after);
  const day = dayOf(now);
  for (const e of events) {
    try {
      ds.writeDataPoint({
        indexes: [code],
        blobs: [e.event, code, e.seat ? await guestHash(e.seat) : '', day],
        doubles: [e.players],
      });
    } catch { /* analytics is best-effort */ }
  }
  return events.length;
}
