import { describe, it, expect } from 'vitest';
import { normalizeHost, resolveRoomsHost, DEFAULT_WORKER_HOST } from './roomsHost.js';

describe('normalizeHost', () => {
  it('strips scheme and path', () => {
    expect(normalizeHost('https://mafia-dealer.a.workers.dev/')).toBe('mafia-dealer.a.workers.dev');
    expect(normalizeHost(' localhost:5180 ')).toBe('localhost:5180');
    expect(normalizeHost('')).toBe('');
  });
});

describe('resolveRoomsHost', () => {
  it('uses the Worker for the Pages site and its previews when unset', () => {
    for (const h of ['mafia-dealer.pages.dev', 'online-rooms.mafia-dealer.pages.dev', '3e5bae30.mafia-dealer.pages.dev', 'Online-Rooms.Mafia-Dealer.pages.dev']) {
      expect(resolveRoomsHost('', h)).toBe(DEFAULT_WORKER_HOST);
    }
  });
  it('stays same-origin on the Worker, localhost and other hosts', () => {
    for (const h of [DEFAULT_WORKER_HOST, 'localhost:5173', '127.0.0.1:5180', 'mafia-dealer.pages.dev.evil.com', 'a.b.mafia-dealer.pages.dev']) {
      expect(resolveRoomsHost('', h)).toBe('');
    }
  });
  it('VITE_ROOMS_HOST always wins', () => {
    expect(resolveRoomsHost('https://rooms.example.com/', 'mafia-dealer.pages.dev')).toBe('rooms.example.com');
    expect(resolveRoomsHost('localhost:8787', 'localhost:5173')).toBe('localhost:8787');
  });
});

describe('normalizeHost edge cases (results identical to the previous regex version)', () => {
  it('handles schemes, paths, ports and odd input', () => {
    const cases = {
      'http://localhost:8787': 'localhost:8787',
      'HTTPS://Rooms.Example.com/api/x?y=1': 'Rooms.Example.com',
      'wss://mafia-dealer.dhanushprince.workers.dev': 'mafia-dealer.dhanushprince.workers.dev',
      'mafia-dealer.dhanushprince.workers.dev/parties/room/ABCD': 'mafia-dealer.dhanushprince.workers.dev',
      '  rooms.example.com  ': 'rooms.example.com',
      'h2c+x://host/path': 'h2c+x:',
      '://host': ':',
      'a/b://c': 'a',
      'ab://x://y': 'x:',
      '/just/a/path': '',
    };
    for (const [input, out] of Object.entries(cases)) {
      expect(normalizeHost(input)).toBe(out);
    }
    expect(normalizeHost(undefined)).toBe('');
    expect(normalizeHost(null)).toBe('');
  });

  it('is fast on long adversarial input (no backtracking)', () => {
    const evil = `${'a'.repeat(50_000)}:${'/'.repeat(50_000)}`;
    const t0 = performance.now();
    normalizeHost(evil);
    expect(performance.now() - t0).toBeLessThan(100);
  });
});

describe('resolveRoomsHost hosts', () => {
  it('workers.dev and localhost pages talk to their own origin', () => {
    expect(resolveRoomsHost('', 'mafia-dealer.dhanushprince.workers.dev')).toBe('');
    expect(resolveRoomsHost('', 'other.workers.dev')).toBe('');
    expect(resolveRoomsHost('', 'localhost')).toBe('');
    expect(resolveRoomsHost('', 'mafia-dealer.pages.dev:443')).toBe(DEFAULT_WORKER_HOST);
  });
  it('VITE_ROOMS_HOST override is normalised and beats previews', () => {
    expect(resolveRoomsHost('https://rooms.example.com/x', 'feature.mafia-dealer.pages.dev')).toBe('rooms.example.com');
    expect(resolveRoomsHost('   ', 'mafia-dealer.pages.dev')).toBe(DEFAULT_WORKER_HOST);
  });
});
