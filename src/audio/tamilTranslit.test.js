import { describe, it, expect } from 'vitest';
import { toTamilScript } from './tamilTranslit';

describe('toTamilScript', () => {
  it.each([
    ['Karthik', 'கார்த்திக்'],
    ['Priya', 'பிரியா'],
    ['Divya', 'திவ்யா'],
    ['Meena', 'மீனா'],
    ['Suresh', 'சுரேஷ்'],
    ['Anitha', 'அனிதா'],
    ['Deepa', 'தீபா'],
    ['Dhanush', 'தனுஷ்'],
    ['Vignesh', 'விக்னேஷ்'],
    ['Lakshmi Narayanan', 'லட்சுமி நாராயணன்'],
    ['Gopal', 'கோபால்'],
    ['Chandrasekharan K', 'சந்திரசேகரன் கே'],
    ['Subramaniam Iyer', 'சுப்பிரமணியம் ஐயர்'],
    ['Bartholomew-Smith', 'பார்த்தோலோமியூ ஸ்மித்'],
  ])('%s -> %s', (latin, tamil) => expect(toTamilScript(latin)).toBe(tamil));

  it('leaves Tamil and non-Latin text alone', () => {
    expect(toTamilScript('கார்த்திக்')).toBe('கார்த்திக்');
    expect(toTamilScript('  ')).toBe('');
    expect(toTamilScript('42')).toBe('42');
  });

  it('keeps digits and converts every Latin letter', () => {
    const out = toTamilScript('Player 3');
    expect(out).toMatch(/ 3$/);
    expect(out).not.toMatch(/[A-Za-z]/);
    ['Maximilian Alexander', 'Zoe', 'Farah', 'Xavier', 'Quincy'].forEach((n) => expect(toTamilScript(n)).not.toMatch(/[A-Za-z]/));
  });
});
