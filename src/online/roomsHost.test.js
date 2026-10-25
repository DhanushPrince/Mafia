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
