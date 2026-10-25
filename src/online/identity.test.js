// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { loadIdentity, saveIdentity } from './identity.js';

const KEY = 'mafia.online.guest';
beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('guest identity', () => {
  it('creates and stores a random 24-char secret id on first use', () => {
    const id = loadIdentity();
    expect(id.gid).toMatch(/^[0-9a-z]{24}$/);
    expect(id.name).toBe('');
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual(id);
    expect(loadIdentity()).toEqual(id); // same device, same seat
  });

  it('gives different devices different ids', () => {
    const a = loadIdentity();
    localStorage.clear();
    expect(loadIdentity().gid).not.toBe(a.gid);
  });

  it('round-trips the display name and stores only gid + name', () => {
    saveIdentity({ gid: 'abcdefghijklmnopqr', name: 'Priya', extra: 'x' });
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual({ gid: 'abcdefghijklmnopqr', name: 'Priya' });
    expect(loadIdentity()).toEqual({ gid: 'abcdefghijklmnopqr', name: 'Priya' });
  });

  it('replaces corrupt, too-short or nameless records safely', () => {
    localStorage.setItem(KEY, '{broken');
    expect(loadIdentity().gid).toHaveLength(24);
    localStorage.setItem(KEY, JSON.stringify({ gid: 'short', name: 'X' }));
    expect(loadIdentity().gid).not.toBe('short');
    localStorage.setItem(KEY, JSON.stringify({ gid: 'abcdefghijklmnopqr', name: 42 }));
    expect(loadIdentity()).toEqual({ gid: 'abcdefghijklmnopqr', name: '' });
  });

  it('still works when storage is unavailable (private mode)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => saveIdentity({ gid: 'abcdefghijklmnopqr', name: 'a' })).not.toThrow();
    expect(loadIdentity().gid).toHaveLength(24);
  });
});
