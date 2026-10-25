/**
 * Worker entry: rooms over WebSockets (PartyServer), optional Google auth, static app (Workers assets).
 */
import { routePartykitRequest } from 'partyserver';
import { isRoomCode } from '../src/online/roomLogic.js';
import { getAuth, googleEnabled } from './auth.js';
import { originAllowed, corsHeaders } from './origins.js';

/* global __BUILD_COMMIT__, __APP_VERSION__ */
const COMMIT = typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : 'dev';
const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

export { Room } from './room.js';

const STUN = { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] };
/** Public STUN, plus a TURN relay when configured (needed for players behind strict NATs / firewalls). */
const iceServers = (env) => (env.TURN_URLS
  ? [STUN, { urls: env.TURN_URLS.split(',').map((u) => u.trim()), username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL }]
  : [STUN]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('origin');
    const cors = corsHeaders(origin, request.url, env);

    if (request.method === 'OPTIONS' && (url.pathname === '/api/config' || url.pathname === '/api/health')) {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === '/api/config') {
      return Response.json({ google: googleEnabled(env), iceServers: iceServers(env) }, { headers: cors });
    }

    if (url.pathname === '/api/health' || url.pathname === '/health') {
      const t0 = Date.now();
      let rooms;
      try {
        const stub = env.Room.get(env.Room.idFromName('__health'));
        await stub.ping();
        rooms = { ok: true, ms: Date.now() - t0 };
      } catch (e) {
        rooms = { ok: false, error: String(e?.message || e).slice(0, 200) };
      }
      return Response.json(
        { ok: rooms.ok, version: VERSION, commit: COMMIT, time: new Date().toISOString(), rooms, google: googleEnabled(env), turn: Boolean(env.TURN_URLS) },
        { status: rooms.ok ? 200 : 503, headers: { ...cors, 'cache-control': 'no-store' } },
      );
    }

    if (url.pathname.startsWith('/api/auth/')) {
      const auth = await getAuth(env, request);
      if (!auth) return Response.json({ error: 'Google sign-in is not configured yet' }, { status: 501 });
      return auth.handler(request);
    }

    if (url.pathname.startsWith('/parties/')) {
      if (!originAllowed(origin, request.url, env)) return new Response('origin not allowed', { status: 403 });
      const res = await routePartykitRequest(request, env, {
        onBeforeConnect: async (req, lobby) => {
          if (!isRoomCode(lobby.name)) return new Response('bad room code', { status: 400 });
          // tag the socket with its seat (derived from the guest secret) so the room can address it
          const gid = new URL(req.url).searchParams.get('gid') || '';
          const { seatFromGuestId } = await import('./room.js');
          req.headers.set('x-seat', /^[A-Za-z0-9_-]{16,64}$/.test(gid) ? await seatFromGuestId(gid) : 'none');
          return req;
        },
      });
      if (res) return res;
    }

    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
  },
};
