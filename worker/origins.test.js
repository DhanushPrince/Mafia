import { describe, it, expect } from 'vitest';
import { originAllowed, corsHeaders } from './origins.js';

const U = 'https://mafia-dealer.acct.workers.dev/parties/room/ABCD';
describe('room server origins', () => {
  it('allows same origin, Pages, Pages previews, localhost and no Origin', () => {
    for (const o of [undefined, '', 'https://mafia-dealer.acct.workers.dev', 'https://mafia-dealer.pages.dev',
      'https://online-rooms.mafia-dealer.pages.dev', 'https://3f2a1b.mafia-dealer.pages.dev', 'http://localhost:5173']) {
      expect(originAllowed(o, U)).toBe(true);
    }
  });
  it('rejects look-alikes and other sites', () => {
    for (const o of ['https://evil.com', 'https://mafia-dealer.pages.dev.evil.com', 'https://evilmafia-dealer.pages.dev',
      'http://mafia-dealer.pages.dev', 'https://a.b.mafia-dealer.pages.dev']) {
      expect(originAllowed(o, U)).toBe(false);
    }
  });
  it('honours ALLOWED_ORIGINS and only sends CORS headers to allowed origins', () => {
    expect(originAllowed('https://mafia.example', U, { ALLOWED_ORIGINS: 'https://x.y, https://mafia.example' })).toBe(true);
    expect(corsHeaders('https://evil.com', U, {})).toEqual({});
    expect(corsHeaders('https://mafia-dealer.pages.dev', U, {})['access-control-allow-origin']).toBe('https://mafia-dealer.pages.dev');
  });
});
