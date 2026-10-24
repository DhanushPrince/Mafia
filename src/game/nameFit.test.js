import { describe, it, expect } from 'vitest';
import { nameFitClass, LONG_NAME } from './nameFit';

const sizes = { normal: 'text-base', long: 'text-sm', veryLong: 'text-xs' };

describe('nameFitClass (long names are shrunk and wrapped, never truncated)', () => {
  it('short names keep the normal size', () => {
    expect(nameFitClass('Arjun', sizes)).toMatch(/^text-base /);
    expect(nameFitClass('x'.repeat(LONG_NAME), sizes)).toMatch(/^text-base /);
  });
  it('names over 12 chars get the long size', () => {
    expect(nameFitClass('Lakshmi Narayanan', sizes)).toMatch(/^text-sm /);
    expect(nameFitClass('Maximilian Alexander', sizes)).toMatch(/^text-sm /);
  });
  it('a single word over 14 chars gets the very long size', () => {
    expect(nameFitClass('Venkataraghavan', sizes)).toMatch(/^text-xs /);
    expect(nameFitClass('Bartholomew-Smith', sizes)).toMatch(/^text-xs /);
  });
  it('veryLong falls back to long', () => {
    expect(nameFitClass('Venkataraghavan', { normal: 'a', long: 'b' })).toMatch(/^b /);
  });
  it('always wraps and never truncates', () => {
    for (const n of ['A', 'Lakshmi Narayanan', 'Venkataraghavan', 'x'.repeat(20)]) {
      const c = nameFitClass(n, sizes);
      expect(c).toContain('break-words');
      expect(c).toContain('[overflow-wrap:anywhere]');
      expect(c).not.toContain('truncate');
    }
  });
  it('handles empty / missing names', () => {
    expect(nameFitClass('', sizes)).toMatch(/^text-base /);
    expect(nameFitClass(undefined, sizes)).toMatch(/^text-base /);
  });
});
