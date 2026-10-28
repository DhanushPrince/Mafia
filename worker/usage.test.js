import { describe, it, expect } from 'vitest';
import { usageEvents, recordUsage, guestHash, dayOf, EVENTS } from './usage.js';

const room = (over = {}) => ({ code: 'KQTZ', status: 'lobby', settings: { fast: false }, members: [], game: null, ...over });
const m = (seat) => ({ seat, name: `Name-${seat}` });
const game = (phase, n = 4) => ({ phase, players: Array.from({ length: n }, (_, i) => ({ name: `s${i}` })) });

describe('usageEvents', () => {
  it('a new room is a create plus a join per first members', () => {
    expect(usageEvents(null, room({ members: [m('s0')] }))).toEqual([
      { event: EVENTS.CREATE, players: 0 },
      { event: EVENTS.JOIN, seat: 's0', players: 1 },
    ]);
  });

  it('only seats that were not members before count as joins', () => {
    const before = room({ members: [m('s0')] });
    expect(usageEvents(before, room({ members: [m('s0'), m('s1')] }))).toEqual([{ event: EVENTS.JOIN, seat: 's1', players: 2 }]);
    expect(usageEvents(before, room({ members: [{ ...m('s0'), connected: false }] }))).toEqual([]);
  });

  it('game start is the move into status game; game end is reaching END, once', () => {
    const deal = room({ status: 'deal' });
    const night = room({ status: 'game', game: game('NIGHT_INTRO', 5) });
    const end = room({ status: 'game', game: game('END', 5) });
    expect(usageEvents(deal, night)).toEqual([{ event: EVENTS.START, players: 5 }]);
    expect(usageEvents(night, night)).toEqual([]);
    expect(usageEvents(night, end)).toEqual([{ event: EVENTS.END, players: 5 }]);
    expect(usageEvents(end, end)).toEqual([]);
    // rematch: END -> deal -> game again
    expect(usageEvents(end, deal)).toEqual([]);
    expect(usageEvents(deal, night)).toHaveLength(1);
    // everyone but one left during the card pick: the game starts already over
    expect(usageEvents(deal, room({ status: 'game', game: game('END', 3) })).map((e) => e.event)).toEqual([EVENTS.START, EVENTS.END]);
  });

  it('ignores e2e rooms and a deleted room', () => {
    expect(usageEvents(null, room({ settings: { fast: true }, members: [m('s0')] }))).toEqual([]);
    expect(usageEvents(room(), null)).toEqual([]);
  });
});

describe('recordUsage', () => {
  it('writes one data point per event with hashed guests and no names', async () => {
    const points = [];
    const env = { USAGE: { writeDataPoint: (p) => points.push(p) } };
    const n = await recordUsage(env, 'KQTZ', null, room({ members: [m('abc123')] }), Date.UTC(2026, 9, 27, 20)); // 01:30 IST on the 28th
    expect(n).toBe(2);
    expect(points[1]).toEqual({ indexes: ['KQTZ'], blobs: ['join', 'KQTZ', await guestHash('abc123'), '2026-10-28'], doubles: [1] });
    expect(points[0].blobs[2]).toBe('');
    expect(JSON.stringify(points)).not.toMatch(/Name-|abc123/);
  });

  it('is a no-op without the binding', async () => {
    expect(await recordUsage({}, 'KQTZ', null, room())).toBe(0);
    expect(await recordUsage(undefined, 'KQTZ', null, room())).toBe(0);
  });

  it('guestHash is stable, 16 hex chars, and differs per seat', async () => {
    expect(await guestHash('a')).toMatch(/^[0-9a-f]{16}$/);
    expect(await guestHash('a')).toBe(await guestHash('a'));
    expect(await guestHash('a')).not.toBe(await guestHash('b'));
  });

  it('dayOf uses Asia/Kolkata', () => {
    expect(dayOf(Date.UTC(2026, 9, 27, 18, 29))).toBe('2026-10-27');
    expect(dayOf(Date.UTC(2026, 9, 27, 18, 30))).toBe('2026-10-28');
  });
});
