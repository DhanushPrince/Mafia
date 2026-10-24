import { describe, it, expect } from 'vitest';
import { dealFlow, initialDealFlow, isBusy, availableNames } from './dealFlow';

const run = (actions, s = initialDealFlow) => actions.reduce(dealFlow, s);

describe('dealing flow', () => {
  it('walks one card through pick -> reveal -> hide -> done', () => {
    let s = run([{ type: 'OPEN', index: 2 }]);
    expect(s.picker).toBe(2);
    expect(isBusy(s)).toBe(true);
    s = dealFlow(s, { type: 'CHOOSE', name: 'Ravi' });
    expect(s).toEqual({ picker: null, revealing: { index: 2, name: 'Ravi' }, hiding: null });
    s = dealFlow(s, { type: 'HIDE' });
    expect(s).toEqual({ picker: null, revealing: null, hiding: { index: 2, name: 'Ravi' } });
    s = dealFlow(s, { type: 'DONE', index: 2 });
    expect(s).toEqual(initialDealFlow);
    expect(isBusy(s)).toBe(false);
  });

  it('ignores taps on other cards while busy and on taken cards', () => {
    const s = run([{ type: 'OPEN', index: 0 }, { type: 'OPEN', index: 1 }]);
    expect(s.picker).toBe(0);
    expect(run([{ type: 'OPEN', index: 3, taken: true }]).picker).toBe(null);
  });

  it('auto-hide and a Hide & Pass tap on the same card hide it once', () => {
    let s = run([{ type: 'OPEN', index: 9 }, { type: 'CHOOSE', name: 'Suresh' }, { type: 'HIDE' }, { type: 'HIDE' }]);
    expect(s.hiding).toEqual({ index: 9, name: 'Suresh' });
    s = run([{ type: 'DONE', index: 9 }, { type: 'DONE', index: 9 }], s);
    expect(s).toEqual(initialDealFlow);
  });

  it('a late DONE for the previous card cannot touch the next card', () => {
    // regression: last card of a 10-player deal got stuck on WebKit
    let s = run([{ type: 'OPEN', index: 8 }, { type: 'CHOOSE', name: 'Maximilian Alexander' }, { type: 'HIDE' }, { type: 'DONE', index: 8 }]);
    s = run([{ type: 'OPEN', index: 9 }, { type: 'DONE', index: 8 }, { type: 'HIDE' }], s);
    expect(s.picker).toBe(9);
    expect(s.revealing).toBe(null);
  });

  it('cancel closes the picker; choose without a picker or a name does nothing', () => {
    expect(run([{ type: 'OPEN', index: 1 }, { type: 'CANCEL' }])).toEqual(initialDealFlow);
    expect(run([{ type: 'CHOOSE', name: 'x' }])).toEqual(initialDealFlow);
    expect(run([{ type: 'OPEN', index: 1 }, { type: 'CHOOSE' }]).picker).toBe(1);
  });

  it('the last card always offers the one remaining name', () => {
    const names = Array.from({ length: 10 }, (_, i) => `P${i}`);
    const assignments = Object.fromEntries(names.slice(0, 9).map((n, i) => [i, n]));
    const s = run([{ type: 'OPEN', index: 9 }]);
    expect(availableNames(names, assignments, s)).toEqual(['P9']);
    // a name that is face-up or flipping back is not offered twice
    expect(availableNames(['a', 'b', 'c'], {}, { picker: 1, revealing: null, hiding: { index: 0, name: 'a' } })).toEqual(['b', 'c']);
  });
});
