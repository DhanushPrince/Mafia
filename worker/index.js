/**
 * Worker entry: rooms over WebSockets (PartyServer), optional Google auth, static app (Workers assets).
 */
import { routePartykitRequest } from 'partyserver';
import { isRoomCode } from '../src/online/roomLogic.js';
import { getAuth, googleEnabled } from './auth.js';

export { Room } from './room.js';

const STUN = { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] };
/** Public STUN, plus a TURN relay when configured (needed for players behind strict NATs / firewalls). */
const iceServers = (env) => (env.TURN_URLS
  ? [STUN, { urls: env.TURN_URLS.split(',').map((u) => u.trim()), username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL }]
  : [STUN]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/config') {
      return Response.json({ google: googleEnabled(env), iceServers: iceServers(env) });
    }

    if (url.pathname.startsWith('/api/auth/')) {
      const auth = await getAuth(env, request);
      if (!auth) return Response.json({ error: 'Google sign-in is not configured yet' }, { status: 501 });
      return auth.handler(request);
    }

    if (url.pathname.startsWith('/parties/')) {
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
