/**
 * Where the room server (Worker) lives. Empty = same origin (Worker deploy, `vite` dev).
 * On mafia-dealer.pages.dev (and its previews) it defaults to the deployed Worker; VITE_ROOMS_HOST overrides.
 */
const raw = (import.meta.env?.VITE_ROOMS_HOST || '').trim();

/** "https://x.dev/" | "x.dev" -> "x.dev"; "" when unset. String scanning only (no backtracking regex). */
export function normalizeHost(value) {
  let h = String(value || '').trim();
  const sep = h.indexOf('://');
  if (sep > 0 && /^[a-z]+$/i.test(h.slice(0, sep))) h = h.slice(sep + 3); // drop "scheme://"
  const slash = h.indexOf('/');
  return slash === -1 ? h : h.slice(0, slash); // drop the path
}

/** The deployed room server, used by the static Pages site when VITE_ROOMS_HOST is not set. */
export const DEFAULT_WORKER_HOST = 'mafia-dealer.dhanushprince.workers.dev';
const PAGES_HOST = /^([a-z0-9-]+\.)?mafia-dealer\.pages\.dev$/i;

/**
 * Room server host for a page served from `pageHost`: VITE_ROOMS_HOST if set, else the Worker for the
 * Pages site (production and branch previews), else "" (same origin: the Worker itself, localhost dev).
 */
export function resolveRoomsHost(configured, pageHost) {
  const c = normalizeHost(configured);
  if (c) return c;
  const h = String(pageHost || '').toLowerCase().replace(/:\d+$/, '');
  return PAGES_HOST.test(h) ? DEFAULT_WORKER_HOST : '';
}

export const ROOMS_HOST = resolveRoomsHost(raw, typeof window !== 'undefined' ? window.location.host : '');

/** Host for PartySocket (it picks ws:// for localhost, wss:// otherwise). */
export const socketHost = () => ROOMS_HOST || window.location.host;

/** URL for a Worker API path such as /api/config. */
export function apiUrl(path) {
  if (!ROOMS_HOST) return path;
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(ROOMS_HOST);
  return `${local ? 'http' : 'https'}://${ROOMS_HOST}${path}`;
}
