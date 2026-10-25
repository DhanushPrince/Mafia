import { describe, it, expect } from 'vitest';
import { normalizeName, validateName, nameKey, isNameTaken, suggestNames, nameLength, FUN_NAMES } from './names';

const members = [
  { seat: 's1', name: 'Karthik' },
  { seat: 's2', name: 'கார்த்திக்' },
  { seat: 's3', name: 'Priya Raman' },
];

describe('normalizeName', () => {
  it('trims, collapses spaces and tabs, drops zero-width spaces', () => {
    expect(normalizeName('  Priya \t  Raman ')).toBe('Priya Raman');
    expect(normalizeName('Ra\u200Bvi')).toBe('Ravi');
  });
  it('NFC-normalizes (decomposed Tamil equals composed Tamil)', () => {
    const composed = 'கொ'; // U+0BCA
    const decomposed = '\u0B95\u0BC6\u0BBE'; // க + ெ + ா
    expect(normalizeName(decomposed)).toBe(normalizeName(composed));
  });
});

describe('validateName', () => {
  it('accepts Latin and Tamil names of 2-16 characters', () => {
    expect(validateName('Ravi')).toEqual({ ok: true, name: 'Ravi' });
    expect(validateName('  கார்த்திக்  ராஜா ')).toEqual({ ok: true, name: 'கார்த்திக் ராஜா' });
    expect(validateName("D'Souza-Lee Jr.").ok).toBe(true);
  });
  it('counts Tamil letters with vowel signs as one character each', () => {
    expect(nameLength('கார்த்திக்')).toBe(5);
    expect(validateName('கா').ok).toBe(false); // 2 code points, 1 letter: too short
    expect(validateName('ரவி').ok).toBe(true); // 2 letters
  });
  it('rejects blank, too short, too long, emoji-only and symbols', () => {
    expect(validateName('   ').ok).toBe(false);
    expect(validateName('A').ok).toBe(false);
    expect(validateName('A'.repeat(17)).ok).toBe(false);
    expect(validateName('😀😀').ok).toBe(false);
    expect(validateName('1234').ok).toBe(false);
    expect(validateName('Ravi 😀').ok).toBe(false);
    expect(validateName('<b>Ravi</b>').ok).toBe(false);
  });
});

describe('uniqueness', () => {
  it('is case-insensitive and ignores extra spaces', () => {
    expect(isNameTaken(members, 'KARTHIK')).toBe(true);
    expect(isNameTaken(members, '  karthik ')).toBe(true);
    expect(isNameTaken(members, 'priya   raman')).toBe(true);
    expect(nameKey('PRIYA  Raman')).toBe(nameKey('priya raman'));
  });
  it('matches Tamil names regardless of Unicode composition', () => {
    expect(isNameTaken(members, 'கார்த்திக்'.normalize('NFD'))).toBe(true);
    expect(isNameTaken(members, ' கார்த்திக் ')).toBe(true);
    expect(isNameTaken(members, 'கார்த்திகா')).toBe(false);
  });
  it('a member keeping (or re-casing) their own name is not a duplicate', () => {
    expect(isNameTaken(members, 'karthik', 's1')).toBe(false);
    expect(isNameTaken(members, 'Karthik', 's2')).toBe(true);
  });
  it('different names are free', () => {
    expect(isNameTaken(members, 'Karthi')).toBe(false);
  });
});

describe('suggestNames', () => {
  it('offers up to 3 free, valid names close to the taken one', () => {
    const s = suggestNames(members, 'Karthik', { rand: () => 0 });
    expect(s).toHaveLength(3);
    expect(s[0]).toBe('Karthik K');
    expect(s[1]).toBe('Karthik 2');
    s.forEach((n) => {
      expect(validateName(n).ok).toBe(true);
      expect(isNameTaken(members, n)).toBe(false);
    });
  });
  it('skips suggestions that are already taken', () => {
    const more = [...members, { seat: 's4', name: 'Karthik K' }, { seat: 's5', name: 'karthik 2' }];
    const s = suggestNames(more, 'Karthik', { rand: () => 0 });
    expect(s).not.toContain('Karthik K');
    expect(s).not.toContain('Karthik 2');
    s.forEach((n) => expect(isNameTaken(more, n)).toBe(false));
  });
  it('works for Tamil names and keeps suggestions within 16 characters', () => {
    const s = suggestNames(members, 'கார்த்திக்', { rand: () => 0.5 });
    expect(s.length).toBeGreaterThanOrEqual(2);
    s.forEach((n) => expect(validateName(n).ok).toBe(true));
    const long = suggestNames([{ seat: 'x', name: 'Venkataraghavan R' }], 'Venkataraghavan R');
    long.forEach((n) => expect(nameLength(n)).toBeLessThanOrEqual(16));
  });
  it('every fun name is itself valid', () => {
    FUN_NAMES.forEach((n) => expect(validateName(n).ok).toBe(true));
  });
});
