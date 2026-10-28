/**
 * Admin-only usage stats (ADR 0014): `/admin` (page) and `/api/admin/stats` (JSON).
 * Every stats request needs `Authorization: Bearer <ADMIN_TOKEN>` (Worker secret), compared in
 * constant time. No ADMIN_TOKEN configured = nobody gets in. The page itself holds no data.
 * Stats are read from Analytics Engine's SQL API with a separate read-only token
 * (CF_ANALYTICS_TOKEN, permission "Account Analytics: Read") for account CF_ACCOUNT_ID.
 */
import { dayOf, STATS_DAYS } from './usage.js';

const enc = new TextEncoder();
const PRIVATE = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' };

/** Constant-time string equality: compares fixed-length SHA-256 digests byte by byte. */
export async function safeEqual(a, b) {
  const [x, y] = await Promise.all([a, b].map(async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(s))))));
  if (crypto.subtle.timingSafeEqual) return crypto.subtle.timingSafeEqual(x, y);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function isAdmin(request, env) {
  const want = env.ADMIN_TOKEN;
  if (typeof want !== 'string' || want.length < 16) return false; // unset or too short: locked
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '');
  if (!m) return false;
  return safeEqual(m[1].trim(), want);
}

const dataset = (env) => (/^[A-Za-z0-9_]{1,64}$/.test(env.USAGE_DATASET || '') ? env.USAGE_DATASET : 'mafia_usage');

async function sql(env, query, fetchImpl) {
  const res = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}` },
    body: query,
  });
  if (!res.ok) throw new Error(`analytics query failed (${res.status})`);
  return (await res.json()).data || [];
}

/** The last `STATS_DAYS` calendar days (stats time zone), oldest first. */
export function lastDays(now, n = STATS_DAYS) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(dayOf(now - i * 86400000));
  return [...new Set(out)];
}

/** Per-day and total usage for the last 30 days. */
export async function usageStats(env, { now = Date.now(), fetchImpl = fetch } = {}) {
  const days = lastDays(now);
  const from = days[0];
  const ds = dataset(env);
  const where = `timestamp > NOW() - INTERVAL '${STATS_DAYS + 1}' DAY AND blob4 >= '${from}'`;
  const [counts, guests, total] = await Promise.all([
    sql(env, `SELECT blob4 AS day, blob1 AS event, SUM(_sample_interval) AS n, SUM(_sample_interval * double1) AS players FROM ${ds} WHERE ${where} GROUP BY day, event FORMAT JSON`, fetchImpl),
    sql(env, `SELECT blob4 AS day, count(DISTINCT blob3) AS guests FROM ${ds} WHERE ${where} AND blob1 = 'join' GROUP BY day FORMAT JSON`, fetchImpl),
    sql(env, `SELECT count(DISTINCT blob3) AS guests FROM ${ds} WHERE ${where} AND blob1 = 'join' FORMAT JSON`, fetchImpl),
  ]);
  const byDay = new Map(days.map((d) => [d, { day: d, uniqueGuests: 0, joins: 0, roomsCreated: 0, gamesStarted: 0, gamesFinished: 0, startPlayers: 0 }]));
  const field = { join: 'joins', room_create: 'roomsCreated', game_start: 'gamesStarted', game_end: 'gamesFinished' };
  for (const r of counts) {
    const row = byDay.get(r.day);
    if (!row || !field[r.event]) continue;
    row[field[r.event]] += Number(r.n) || 0;
    if (r.event === 'game_start') row.startPlayers += Number(r.players) || 0;
  }
  for (const r of guests) if (byDay.has(r.day)) byDay.get(r.day).uniqueGuests = Number(r.guests) || 0;
  const avg = (players, games) => (games ? Math.round((players / games) * 10) / 10 : null);
  const rows = [...byDay.values()].map(({ startPlayers, ...r }) => ({ ...r, avgPlayersPerGame: avg(startPlayers, r.gamesStarted), startPlayers }));
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  const totals = {
    uniqueGuests: Number(total[0]?.guests) || 0,
    joins: sum('joins'),
    roomsCreated: sum('roomsCreated'),
    gamesStarted: sum('gamesStarted'),
    gamesFinished: sum('gamesFinished'),
    avgPlayersPerGame: avg(sum('startPlayers'), sum('gamesStarted')),
  };
  return { from, to: days[days.length - 1], timeZone: 'Asia/Kolkata', days: rows.map(({ startPlayers, ...r }) => r).reverse(), totals };
}

/** `/api/admin/stats`, `/admin`, `/admin/app.js`; null for any other path. */
export async function handleAdmin(request, env, url, deps = {}) {
  if (url.pathname === '/admin' || url.pathname === '/admin/') {
    return new Response(ADMIN_HTML, { headers: { ...PRIVATE, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': CSP } });
  }
  if (url.pathname === '/admin/app.js') {
    return new Response(ADMIN_JS, { headers: { ...PRIVATE, 'content-type': 'text/javascript; charset=utf-8' } });
  }
  if (url.pathname !== '/api/admin/stats') return null;
  if (request.method !== 'GET') return Response.json({ error: 'method not allowed' }, { status: 405, headers: PRIVATE });
  if (!(await isAdmin(request, env))) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: { ...PRIVATE, 'www-authenticate': 'Bearer' } });
  }
  if (!env.CF_ACCOUNT_ID || !env.CF_ANALYTICS_TOKEN) {
    return Response.json({ error: 'stats storage not configured (CF_ACCOUNT_ID / CF_ANALYTICS_TOKEN)' }, { status: 503, headers: PRIVATE });
  }
  try {
    return Response.json(await usageStats(env, deps), { headers: PRIVATE });
  } catch (e) {
    return Response.json({ error: String(e?.message || e).slice(0, 200) }, { status: 502, headers: PRIVATE });
  }
}

const CSP = "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const ADMIN_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Mafia Dealer · Admin</title>
<style>
  :root { color-scheme: dark; }
  [hidden] { display: none !important; }
  body { margin: 0; background: #050505; color: #fff; font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
  main { max-width: 960px; margin: 0 auto; padding: 32px 16px 64px; }
  h1 { font-size: 22px; letter-spacing: .02em; margin: 0 0 4px; }
  .muted { color: #a1a1aa; font-size: 13px; }
  form { display: flex; gap: 8px; margin: 24px 0; }
  input { flex: 1; padding: 10px 12px; border-radius: 10px; border: 1px solid #27272a; background: #0f0f10; color: #fff; font-size: 15px; }
  button { padding: 10px 16px; border-radius: 10px; border: 0; background: #dc2626; color: #fff; font-weight: 600; cursor: pointer; }
  button.ghost { background: transparent; border: 1px solid #27272a; color: #d4d4d8; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin: 20px 0; }
  .card { background: #0f0f10; border: 1px solid #1f1f22; border-radius: 14px; padding: 12px 14px; }
  .card b { display: block; font-size: 24px; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; font-variant-numeric: tabular-nums; }
  th, td { padding: 8px 10px; border-bottom: 1px solid #1f1f22; text-align: right; }
  th:first-child, td:first-child { text-align: left; }
  th { color: #a1a1aa; font-weight: 500; }
  tr.zero td { color: #52525b; }
  .err { color: #f87171; margin: 16px 0; }
  .row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .scroll { overflow-x: auto; }
</style>
</head>
<body>
<main>
  <div class="row"><div><h1>Mafia Dealer usage</h1><div class="muted" id="range">Admins only</div></div>
  <button class="ghost" id="logout" hidden>Sign out</button></div>
  <form id="login" hidden><input id="key" type="password" autocomplete="off" placeholder="Admin key" aria-label="Admin key" required><button>Open</button></form>
  <div class="err" id="err" hidden></div>
  <section id="stats" hidden>
    <div class="cards" id="totals"></div>
    <div class="scroll"><table><thead><tr><th>Day</th><th>Unique guests</th><th>Joins</th><th>Rooms created</th><th>Games started</th><th>Games finished</th><th>Avg players / game</th></tr></thead><tbody id="days"></tbody></table></div>
  </section>
</main>
<script src="/admin/app.js"></script>
</body>
</html>`;

const ADMIN_JS = `(() => {
  const KEY = 'mafiaAdminKey';
  const $ = (id) => document.getElementById(id);
  const show = (id, on) => { $(id).hidden = !on; };
  const cell = (v) => { const td = document.createElement('td'); td.textContent = v == null ? '–' : String(v); return td; };
  function error(msg) { $('err').textContent = msg; show('err', Boolean(msg)); }
  function login(msg) { sessionStorage.removeItem(KEY); show('stats', false); show('logout', false); show('login', true); error(msg || ''); $('key').focus(); }
  function render(s) {
    $('range').textContent = s.from + ' → ' + s.to + ' (' + s.timeZone + ')';
    const t = s.totals;
    const cards = [['Unique guests', t.uniqueGuests], ['Joins', t.joins], ['Rooms created', t.roomsCreated], ['Games started', t.gamesStarted], ['Games finished', t.gamesFinished], ['Avg players / game', t.avgPlayersPerGame]];
    $('totals').replaceChildren(...cards.map(([k, v]) => { const d = document.createElement('div'); d.className = 'card'; d.textContent = k; const b = document.createElement('b'); b.textContent = v == null ? '–' : String(v); d.append(b); return d; }));
    $('days').replaceChildren(...s.days.map((r) => {
      const tr = document.createElement('tr');
      if (!r.joins && !r.roomsCreated && !r.gamesStarted && !r.gamesFinished) tr.className = 'zero';
      tr.append(cell(r.day), cell(r.uniqueGuests), cell(r.joins), cell(r.roomsCreated), cell(r.gamesStarted), cell(r.gamesFinished), cell(r.avgPlayersPerGame));
      return tr;
    }));
    show('login', false); show('logout', true); show('stats', true); error('');
  }
  async function load() {
    const key = sessionStorage.getItem(KEY);
    if (!key) return login();
    let res;
    try { res = await fetch('/api/admin/stats', { headers: { authorization: 'Bearer ' + key }, cache: 'no-store' }); }
    catch { return error('Network error'); }
    if (res.status === 401) return login('Wrong key');
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return error(body.error || ('Error ' + res.status));
    render(body);
  }
  $('login').addEventListener('submit', (e) => { e.preventDefault(); sessionStorage.setItem(KEY, $('key').value.trim()); $('key').value = ''; load(); });
  $('logout').addEventListener('click', () => login());
  load();
})();
`;
