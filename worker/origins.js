/**
 * Browser origins allowed to use the room server from another site (the Pages build) and the
 * same-origin Worker itself. Extra origins: env ALLOWED_ORIGINS="https://a.com,https://b.com".
 */
const PAGES = /^https:\/\/([a-z0-9-]+\.)?mafia-dealer\.pages\.dev$/;
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function originAllowed(origin, requestUrl, env = {}) {
  if (!origin) return true; // non-browser clients (tests, health checks) send no Origin
  if (origin === new URL(requestUrl).origin) return true;
  if (PAGES.test(origin) || LOCAL.test(origin)) return true;
  const extra = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return extra.includes(origin);
}

export function corsHeaders(origin, requestUrl, env) {
  if (!origin || !originAllowed(origin, requestUrl, env)) return {};
  return { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'Origin' };
}
