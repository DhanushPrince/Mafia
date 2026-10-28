import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

// The real router needs Durable Object namespaces; this one does what partyserver does for
// `/parties/<party>/<room>`: run onBeforeConnect, then hand the (possibly rewritten) request on.
const routed = [];
vi.mock('partyserver', () => ({
  Server: class {},
  routePartykitRequest: vi.fn(async (request, env, { onBeforeConnect }) => {
    const m = new URL(request.url).pathname.match(/^\/parties\/([^/]+)\/([^/?]+)/);
    if (!m || m[1] !== 'room') return null;
    const out = await onBeforeConnect(request, { name: m[2] });
    if (out instanceof Response) return out;
    routed.push(out);
    return new Response('upgraded', { status: 200 });
  }),
}));

const authHandler = vi.fn(async () => new Response('auth ok'));
const betterAuth = vi.fn(() => ({ handler: authHandler }));
vi.mock('better-auth', () => ({ betterAuth }));
vi.mock('better-auth/plugins', () => ({ anonymous: () => ({ id: 'anonymous' }) }));

const { default: worker } = await import('./index.js');
const { seatFromGuestId } = await import('./room.js');
const { googleEnabled } = await import('./auth.js');
const { usageStats, safeEqual, lastDays } = await import('./admin.js');

const BASE = 'https://mafia-dealer.acct.workers.dev';
const req = (path, init = {}) => new Request(`${BASE}${path}`, init);
const roomNs = (ping = async () => 1) => ({ idFromName: vi.fn((n) => `id:${n}`), get: vi.fn(() => ({ ping })) });

beforeEach(() => { routed.length = 0; });

describe('worker /api/config', () => {
  it('answers CORS preflight from an allowed origin with 204', async () => {
    const res = await worker.fetch(req('/api/config', { method: 'OPTIONS', headers: { origin: 'https://mafia-dealer.pages.dev' } }), {});
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://mafia-dealer.pages.dev');
  });

  it('sends no CORS headers to a foreign origin', async () => {
    const res = await worker.fetch(req('/api/config', { headers: { origin: 'https://evil.com' } }), {});
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('returns public STUN only and google=false by default', async () => {
    const body = await (await worker.fetch(req('/api/config'), {})).json();
    expect(body.google).toBe(false);
    expect(body.iceServers).toHaveLength(1);
    expect(body.iceServers[0].urls[0]).toMatch(/^stun:/);
  });

  it('adds the TURN relay (trimmed URLs + credentials) when configured', async () => {
    const env = { TURN_URLS: 'turn:a.example:3478, turns:a.example:5349', TURN_USERNAME: 'u', TURN_CREDENTIAL: 'c' };
    const { iceServers } = await (await worker.fetch(req('/api/config'), env)).json();
    expect(iceServers[1]).toEqual({ urls: ['turn:a.example:3478', 'turns:a.example:5349'], username: 'u', credential: 'c' });
  });
});

describe('worker /api/health', () => {
  it('pings the health Durable Object and reports ok with no-store', async () => {
    const env = { Room: roomNs() };
    const res = await worker.fetch(req('/api/health'), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(env.Room.idFromName).toHaveBeenCalledWith('__health');
    expect(body).toMatchObject({ ok: true, rooms: { ok: true }, google: false, turn: false });
    expect(typeof body.rooms.ms).toBe('number');
    expect(body.version).toBe(JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version);
    expect(typeof body.commit).toBe('string');
    expect(Number.isNaN(Date.parse(body.time))).toBe(false);
  });

  it('reports 503 with the (truncated) error when Durable Objects fail; /health is an alias', async () => {
    const env = { Room: roomNs(async () => { throw new Error('x'.repeat(500)); }), TURN_URLS: 'turn:t' };
    const res = await worker.fetch(req('/health'), env);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.rooms.error).toHaveLength(200);
    expect(body.turn).toBe(true);
  });

  it('answers the health preflight', async () => {
    const res = await worker.fetch(req('/api/health', { method: 'OPTIONS' }), {});
    expect(res.status).toBe(204);
  });
});

describe('worker /api/auth', () => {
  it('is 501 until Google sign-in is configured', async () => {
    const res = await worker.fetch(req('/api/auth/session'), {});
    expect(res.status).toBe(501);
    expect((await res.json()).error).toMatch(/not configured/);
  });

  it('hands requests to better-auth once configured, building it once', async () => {
    const env = { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret', DB: {}, BETTER_AUTH_SECRET: 's' };
    expect(googleEnabled(env)).toBe(true);
    const r1 = await worker.fetch(req('/api/auth/session'), env);
    await worker.fetch(req('/api/auth/other'), env);
    expect(await r1.text()).toBe('auth ok');
    expect(betterAuth).toHaveBeenCalledTimes(1);
    expect(betterAuth.mock.calls[0][0]).toMatchObject({ baseURL: BASE, socialProviders: { google: { clientId: 'id' } } });
    expect(authHandler).toHaveBeenCalledTimes(2);
  });

  it('googleEnabled needs every secret and the D1 binding', () => {
    expect(googleEnabled({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's', BETTER_AUTH_SECRET: 'x' })).toBe(false);
  });
});

describe('worker /parties (room sockets)', () => {
  it('refuses sockets from a foreign origin with 403', async () => {
    const res = await worker.fetch(req('/parties/room/KQTZ?gid=abcdefghijklmnop', { headers: { origin: 'https://evil.com' } }), {});
    expect(res.status).toBe(403);
    expect(routed).toHaveLength(0);
  });

  it('rejects a malformed room code with 400', async () => {
    const res = await worker.fetch(req('/parties/room/KQ0Z?gid=abcdefghijklmnop'), {});
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('bad room code');
  });

  it('tags the upgrade with the seat derived from the guest id', async () => {
    const gid = 'abcdefghijklmnop';
    const res = await worker.fetch(req(`/parties/room/KQTZ?gid=${gid}`, { headers: { origin: 'http://localhost:5180' } }), {});
    expect(res.status).toBe(200);
    expect(routed[0].headers.get('x-seat')).toBe(await seatFromGuestId(gid));
  });

  it("tags a missing or malformed guest id as seat 'none' (the room then refuses it)", async () => {
    await worker.fetch(req('/parties/room/KQTZ?gid=bad!'), {});
    await worker.fetch(req('/parties/room/KQTZ'), {});
    expect(routed.map((r) => r.headers.get('x-seat'))).toEqual(['none', 'none']);
  });

  it('falls through to static assets when no party matches', async () => {
    const ASSETS = { fetch: vi.fn(async () => new Response('index.html')) };
    const res = await worker.fetch(req('/parties/other/KQTZ'), { ASSETS });
    expect(await res.text()).toBe('index.html');
  });
});

describe('worker static fallback', () => {
  it('serves assets when bound, 404 otherwise', async () => {
    const ASSETS = { fetch: vi.fn(async (r) => new Response(new URL(r.url).pathname)) };
    expect(await (await worker.fetch(req('/r/KQTZ'), { ASSETS })).text()).toBe('/r/KQTZ');
    expect((await worker.fetch(req('/r/KQTZ'), {})).status).toBe(404);
  });
});

describe('worker /admin and /api/admin/stats (ADR 0014)', () => {
  const ADMIN_TOKEN = 'correct-horse-battery-staple-42';
  const NOW = Date.UTC(2026, 9, 28, 6); // 11:30 IST
  const fakeAe = (rows) => vi.fn(async (_url, init) => {
    const q = init.body;
    const data = q.includes('GROUP BY day, event') ? rows.counts : q.includes('GROUP BY day') ? rows.guests : rows.total;
    return new Response(JSON.stringify({ data }), { status: 200 });
  });
  const env = (over = {}) => ({ ADMIN_TOKEN, CF_ACCOUNT_ID: 'acct', CF_ANALYTICS_TOKEN: 'ae-token', ...over });
  const stats = (headers = {}, e = env()) => worker.fetch(req('/api/admin/stats', { headers }), e);

  it('401 without a key, with a wrong key, and when no ADMIN_TOKEN is configured; no data in the body', async () => {
    for (const res of [
      await stats(),
      await stats({ authorization: 'Bearer wrong-key-wrong-key-wrong' }),
      await stats({ authorization: ADMIN_TOKEN }), // not a Bearer header
      await stats({ authorization: `Bearer ${ADMIN_TOKEN}` }, env({ ADMIN_TOKEN: undefined })),
      await stats({ authorization: 'Bearer short' }, env({ ADMIN_TOKEN: 'short' })), // too-short secret stays locked
    ]) {
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'unauthorized' });
      expect(res.headers.get('x-robots-tag')).toMatch(/noindex/);
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('503 with the right key when the analytics read token is not set', async () => {
    const res = await stats({ authorization: `Bearer ${ADMIN_TOKEN}` }, env({ CF_ANALYTICS_TOKEN: undefined }));
    expect(res.status).toBe(503);
  });

  it('200 with the right key: per-day and total stats', async () => {
    vi.stubGlobal('fetch', fakeAe({
      counts: [
        { day: '2026-10-28', event: 'join', n: '9', players: '20' },
        { day: '2026-10-28', event: 'room_create', n: '2', players: '0' },
        { day: '2026-10-28', event: 'game_start', n: '2', players: '11' },
        { day: '2026-10-28', event: 'game_end', n: '1', players: '5' },
        { day: '2026-10-20', event: 'game_start', n: '1', players: '6' },
        { day: '2026-08-01', event: 'join', n: '99', players: '0' }, // outside the window: ignored
      ],
      guests: [{ day: '2026-10-28', guests: '7' }],
      total: [{ guests: '8' }],
    }));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    try {
      const res = await stats({ authorization: `Bearer ${ADMIN_TOKEN}` });
      expect(res.status).toBe(200);
      expect(res.headers.get('x-robots-tag')).toMatch(/noindex/);
      const body = await res.json();
      expect(body.days).toHaveLength(30);
      expect(body.to).toBe('2026-10-28');
      expect(body.from).toBe('2026-09-29');
      expect(body.days[0]).toEqual({ day: '2026-10-28', uniqueGuests: 7, joins: 9, roomsCreated: 2, gamesStarted: 2, gamesFinished: 1, avgPlayersPerGame: 5.5 });
      expect(body.totals).toEqual({ uniqueGuests: 8, joins: 9, roomsCreated: 2, gamesStarted: 3, gamesFinished: 1, avgPlayersPerGame: 5.7 });
      const [url, init] = fetch.mock.calls[0];
      expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acct/analytics_engine/sql');
      expect(init.headers.authorization).toBe('Bearer ae-token');
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('502 when the analytics query fails', async () => {
    const fetchImpl = vi.fn(async () => new Response('no', { status: 403 }));
    await expect(usageStats(env(), { now: NOW, fetchImpl })).rejects.toThrow(/403/);
  });

  it('serves the admin page with noindex, a strict CSP and no data', async () => {
    const res = await worker.fetch(req('/admin'), {});
    expect(res.status).toBe(200);
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(res.headers.get('content-security-policy')).toMatch(/frame-ancestors 'none'/);
    const html = await res.text();
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).toContain('/admin/app.js');
    const js = await (await worker.fetch(req('/admin/app.js'), {})).text();
    expect(js).toContain('sessionStorage');
    expect(js).not.toContain('localStorage');
    expect((await worker.fetch(req('/admin/other'), {})).status).toBe(404);
  });

  it('safeEqual / lastDays helpers', async () => {
    expect(await safeEqual('abc', 'abc')).toBe(true);
    expect(await safeEqual('abc', 'abd')).toBe(false);
    expect(await safeEqual('abc', 'abcd')).toBe(false);
    const days = lastDays(NOW);
    expect(days).toHaveLength(30);
    expect(days.at(-1)).toBe('2026-10-28');
  });
});
