/**
 * Where the room server (Worker) lives. Empty = same origin (Worker deploy, `vite` dev).
 * The static Cloudflare Pages build sets VITE_ROOMS_HOST=mafia-dealer.<account>.workers.dev
 * so its /online page talks to the deployed Worker.
 */
const raw = (import.meta.env?.VITE_ROOMS_HOST || '').trim();

/** "https://x.dev/" | "x.dev" -> "x.dev"; "" when unset. */
export function normalizeHost(value) {
  return String(value || '').trim().replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '');
}

export const ROOMS_HOST = normalizeHost(raw);

/** Host for PartySocket (it picks ws:// for localhost, wss:// otherwise). */
export const socketHost = () => ROOMS_HOST || window.location.host;

/** URL for a Worker API path such as /api/config. */
export function apiUrl(path) {
  if (!ROOMS_HOST) return path;
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(ROOMS_HOST);
  return `${local ? 'http' : 'https'}://${ROOMS_HOST}${path}`;
}
