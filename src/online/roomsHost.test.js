import { describe, it, expect } from 'vitest';
import { normalizeHost } from './roomsHost.js';

describe('normalizeHost', () => {
  it('strips scheme and path', () => {
    expect(normalizeHost('https://mafia-dealer.a.workers.dev/')).toBe('mafia-dealer.a.workers.dev');
    expect(normalizeHost(' localhost:5180 ')).toBe('localhost:5180');
    expect(normalizeHost('')).toBe('');
  });
});
