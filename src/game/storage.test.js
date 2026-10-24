import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from './storage';

describe('settings: narrator language', () => {
  let store;
  beforeEach(() => {
    store = new Map();
    globalThis.window = { localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } };
  });
  afterEach(() => {
    delete globalThis.window;
  });

  it('defaults to Tamil (also for settings saved before the language option existed)', () => {
    expect(DEFAULT_SETTINGS.lang).toBe('ta');
    expect(loadSettings().lang).toBe('ta');
    store.set('mafia-dealer:settings', JSON.stringify({ mode: 'narrator', voice: 'heart' }));
    expect(loadSettings()).toMatchObject({ lang: 'ta', voice: 'heart', mode: 'narrator' });
  });

  it('persists the chosen language in localStorage', () => {
    saveSettings({ ...loadSettings(), lang: 'en' });
    expect(JSON.parse(store.get('mafia-dealer:settings')).lang).toBe('en');
    expect(loadSettings().lang).toBe('en');
    saveSettings({ ...loadSettings(), lang: 'ta' });
    expect(loadSettings().lang).toBe('ta');
    store.set('mafia-dealer:settings', JSON.stringify({ lang: 'klingon' }));
    expect(loadSettings().lang).toBe('ta');
  });
});
