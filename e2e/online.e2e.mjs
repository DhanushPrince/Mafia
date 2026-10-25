// Online rooms e2e: 5 guests in one Chrome (fake camera + mic), against `npm run dev` (vite + Worker + Room DO).
// Usage: BASE_URL=http://localhost:5180 node e2e/online.e2e.mjs
// Covers: guest names (incl. a duplicate-name join + suggestion), lobby + ready + video tiles, card pick
// with live "taken" state, hold-to-reveal, night actions (cameras off), voting, win, reconnect, rematch.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = (process.env.BASE_URL || 'http://localhost:5180').replace(/\/$/, '');
const SHOTS = process.env.SHOTS || '/workspace/shots/online';
fs.mkdirSync(SHOTS, { recursive: true });
const T0 = Date.now();
const results = [];
const ok = (cond, msg) => {
  results.push(`${cond ? 'PASS' : 'FAIL'}: ${msg}`);
  console.log(((Date.now() - T0) / 1000).toFixed(1) + 's', cond ? 'PASS' : 'FAIL', msg);
  if (!cond) process.exitCode = 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const NAMES = ['Arjun', 'Priya', 'Karthik', '  KARTHIK ', 'மீனா'];
const players = [];
const errors = [];
for (let i = 0; i < NAMES.length; i++) {
  const ctx = await browser.newContext({
    viewport: { width: 430, height: 900 }, deviceScaleFactor: 1, permissions: ['camera', 'microphone'],
    // RECORD=1: video of the host's screen
    ...(process.env.RECORD && i === 0 ? { recordVideo: { dir: `${SHOTS}/video`, size: { width: 430, height: 900 } } } : {}),
  });
  const page = await ctx.newPage();
  // TURN_URL: use a local TURN relay (e.g. coturn over TCP) where the browser may not use direct UDP
  if (process.env.TURN_URL) {
    await page.route('**/api/config', async (route) => {
      const res = await route.fetch();
      const cfg = await res.json();
      cfg.iceServers = [{ urls: process.env.TURN_URL, username: process.env.TURN_USER || 'e2e', credential: process.env.TURN_PASS || 'e2epass' }];
      await route.fulfill({ response: res, json: cfg });
    });
  }
  page.on('pageerror', (e) => errors.push(`p${i}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|ERR_|favicon|404/.test(m.text())) errors.push(`p${i}: ${m.text()}`); });
  players.push({ i, ctx, page, typed: NAMES[i] });
}
const [host] = players;
host.finalName = 'Arjun';
const view = (p) => p.page.evaluate(() => window.__mafiaView || null);
const shot = async (p, name) => { await p.page.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('  shot', `${SHOTS}/${name}.png`); };

async function enterName(p, name) {
  await p.page.getByTestId('name-input').fill(name);
  await p.page.getByTestId('name-save').click();
}

try {
  // ---- host creates a room
  await host.page.goto(`${BASE}/online?fast=1&tts=none&debug=1`);
  // blank and emoji names are refused locally
  await host.page.getByTestId('name-input').fill('😀😀');
  await host.page.getByTestId('name-save').click();
  ok(await host.page.getByTestId('name-error').isVisible(), 'emoji-only name is rejected');
  await host.page.getByTestId('dice').click();
  ok((await host.page.getByTestId('name-input').inputValue()).length >= 2, 'dice suggests a name');
  await enterName(host, 'Arjun');
  await host.page.getByTestId('create-room').click();
  await host.page.getByTestId('room-code').waitFor({ timeout: 15000 });
  const code = (await host.page.getByTestId('room-code').textContent()).trim();
  ok(/^[A-Z]{4}$/.test(code), `room created: ${code}`);
  ok(new URL(host.page.url()).pathname === `/r/${code}`, 'host URL is the invite link');
  ok(await host.page.getByTestId('invite-qr').locator('svg').count() === 1, 'invite QR code shown');

  // ---- others join by link (one by code)
  for (const p of players.slice(1)) {
    if (p.i === 2) {
      await p.page.goto(`${BASE}/online?tts=none&debug=1`);
      await enterName(p, p.typed);
      await p.page.getByTestId('join-code').fill(code.toLowerCase());
      await p.page.getByTestId('join-btn').click();
    } else {
      await p.page.goto(`${BASE}/r/${code}?tts=none&debug=1`);
      await enterName(p, p.typed);
    }
    if (p.i === 3) {
      // duplicate of "Karthik": refused with suggestions; take the first one
      await p.page.getByTestId('join-name-error').waitFor({ timeout: 10000 });
      const sugg = await p.page.getByTestId('name-suggestion').allTextContents();
      ok((await p.page.getByTestId('name-error').textContent()).includes('already taken') && sugg.length >= 2, `duplicate name refused, suggestions: ${sugg.join(' | ')}`);
      await shot(p, '00-duplicate-name');
      await p.page.getByTestId('name-suggestion').first().click();
      p.finalName = sugg[0];
    } else p.finalName = p.typed.trim();
    await p.page.getByTestId('lobby-players').waitFor({ timeout: 10000 });
  }
  const lobbyNames = await host.page.getByTestId('lobby-player').evaluateAll((els) => els.map((e) => e.dataset.name));
  ok(lobbyNames.length === 5 && new Set(lobbyNames.map((n) => n.toLowerCase())).size === 5, `5 unique names in lobby: ${lobbyNames.join(', ')}`);

  // ---- ready up; video tiles go live
  for (const p of players.slice(1)) await p.page.getByTestId('ready-toggle').click();
  await host.page.waitForFunction(() => document.querySelectorAll('[data-testid=video-tile][data-live="1"]').length >= 5, null, { timeout: 30000 }).catch(() => {});
  const live = await host.page.locator('[data-testid=video-tile][data-live="1"]').count();
  ok(live === 5, `host sees ${live}/5 live video tiles`);
  // remote video really decodes frames
  await host.page.waitForFunction(() => [...document.querySelectorAll('[data-testid=video-tile] video')].filter((v) => v.videoWidth > 0).length >= 5, null, { timeout: 20000 }).catch(() => {});
  const playing = await host.page.evaluate(() => [...document.querySelectorAll('[data-testid=video-tile] video')].filter((v) => v.videoWidth > 0).length);
  ok(playing === 5, `${playing}/5 video elements decode frames (own + 4 remote)`);
  await host.page.getByTestId('set-turn').selectOption('20');
  await sleep(300);
  ok((await view(players[1])).settings.turnSec === 20, 'host setting reaches players');
  await shot(host, '01-lobby-video');

  // mic / camera toggles
  await players[1].page.getByTestId('toggle-cam').click();
  await host.page.waitForFunction((n) => document.querySelector(`[data-testid=video-tile][data-name="${n}"]`)?.dataset.live === '0', players[1].finalName, { timeout: 5000 }).catch(() => {});
  ok(await host.page.locator(`[data-testid=video-tile][data-name="${players[1].finalName}"]`).getAttribute('data-live') === '0', 'camera toggle hides the tile for others');
  await players[1].page.getByTestId('toggle-cam').click();

  // ---- deal: everyone taps a card
  await host.page.getByTestId('start-game').click();
  for (const p of players) await p.page.getByTestId('card-spread').waitFor({ timeout: 10000 });
  await shot(players[4], '02-card-spread');
  for (const p of players) {
    const free = p.page.locator('[data-testid=pick-card][data-taken="0"] [role=button]').first();
    await free.click({ force: true });
    await p.page.getByTestId('my-card').waitFor({ timeout: 5000 });
    if (p.i === 2) {
      const taken = await players[4].page.locator('[data-testid=pick-card][data-taken="1"]').count();
      ok(taken === 3, `taken cards grey out live for others (${taken} taken)`);
      await shot(players[4], '03-card-spread-taken');
    }
  }
  const roles = {};
  for (const p of players) { const v = await view(p); p.role = v.deal.myRole; p.seat = v.you; roles[p.finalName] = p.role; }
  ok(Object.values(roles).filter((r) => r === 'mafia').length === 1, `roles dealt: ${JSON.stringify(roles)}`);
  // no one learns another role from their view
  const leak = (await view(players[1])).deal.cards.some((c) => 'role' in c);
  ok(!leak, 'card list carries no roles');

  // hold to reveal
  const p1 = players[1];
  const box = await p1.page.getByTestId('my-card').boundingBox();
  await p1.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p1.page.mouse.down();
  await sleep(900);
  await shot(p1, '04-private-role');
  await p1.page.mouse.up();
  await sleep(700);
  ok(await p1.page.locator('[data-testid=my-card] [data-state=hidden]').count() === 1, 'card hides again on release');
  for (const p of players) {
    if (p !== p1) {
      const b = await p.page.getByTestId('my-card').boundingBox();
      await p.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await p.page.mouse.down();
      await sleep(150);
      await p.page.mouse.up();
    }
    await p.page.getByTestId('seen-btn').click();
  }

  // ---- play to a win
  const mafia = players.find((p) => p.role === 'mafia');
  const shots = new Set();
  let reconnected = false;
  let nightChecked = false;
  let dayVideoChecked = false;
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const hv = await view(host);
    if (hv?.status === 'game' && hv.game.phase === 'END') break;
    for (const p of players) {
      const v = await view(p);
      const g = v?.game;
      if (!g) continue;
      if (g.night && !nightChecked && hv.flow?.step === 'open') {
        const liveNight = await host.page.locator('[data-testid=video-tile][data-live="1"]').count();
        const tracks = await p.page.evaluate(() => [...document.querySelectorAll('[data-testid=video-tile] video')][0]?.srcObject?.getTracks().map((t) => t.enabled));
        ok(liveNight === 0 && tracks?.every((e) => e === false), `night: cameras off (live tiles ${liveNight}), own tracks disabled ${JSON.stringify(tracks)}`);
        nightChecked = true;
      }
      if (g.night && !g.myTurn && !shots.has('night') && g.turnRole === 'mafia' && p.role !== 'mafia') {
        await shot(p, '05-night-screen'); shots.add('night');
      }
      if (g.myTurn && !g.mySelection) {
        const targets = p.page.getByTestId('target');
        await targets.first().waitFor({ timeout: 3000 }).catch(() => {});
        let btn = targets.first();
        if (p.role === 'mafia') btn = p.page.locator('[data-testid=target]:not([disabled])').first();
        if (p.role === 'doctor') btn = p.page.locator(`[data-testid=target][data-name="${p.finalName}"]`); // protect yourself
        await btn.click().catch(() => {});
        if (p.role === 'mafia' && !shots.has('mafia')) { await sleep(200); await shot(p, '06-night-mafia-pick'); shots.add('mafia'); }
        if (p.role === 'detective' && !shots.has('det')) { await sleep(300); await shot(p, '07-night-detective'); shots.add('det'); }
      }
      if (!g.night && !dayVideoChecked && v.flow?.step === 'discuss' && p === host) {
        await host.page.waitForFunction(() => document.querySelectorAll('[data-testid=video-tile][data-live="1"]').length >= 3, null, { timeout: 4000 }).catch(() => {});
        const n = await host.page.locator('[data-testid=video-tile][data-live="1"]').count();
        ok(n >= 3, `day: cameras back on (${n} live tiles)`);
        dayVideoChecked = true;
        await shot(host, '08-day-discussion');
        if (!reconnected) {
          // reconnect: reload a player; same seat and name come back
          const r = players[3];
          await r.page.reload();
          await r.page.getByTestId('room').waitFor({ timeout: 10000 });
          const rv = await view(r);
          ok(rv.you === r.seat && rv.members.find((m) => m.seat === r.seat)?.name === r.finalName && rv.status === 'game', 'reload keeps seat, name and game');
          reconnected = true;
        }
      }
      if (v.flow?.step === 'voting' && !shots.has('vote') && Object.keys(g.votes || {}).length >= 2) { await shot(p, '09-voting'); shots.add('vote'); }
      if (v.flow?.step === 'voting' && g.me?.alive && !g.votes?.[v.you]) {
        const target = p === mafia ? g.players.find((x) => x.alive && x.seat !== v.you) : { seat: mafia.seat };
        const name = v.members.find((m) => m.seat === target.seat).name;
        await p.page.locator(`[data-testid=vote-target][data-name="${name}"]`).click().catch(() => {});
      }
    }
    await sleep(150);
  }
  for (const p of players) await p.page.getByTestId('results').waitFor({ timeout: 15000 });
  const winner = await host.page.getByTestId('winner').textContent();
  ok(/village wins|Mafia win/.test(winner), `game ended: ${winner}`);
  await shot(host, '10-results');
  await shot(players[2], '10-results-player');
  ok(shots.has('vote') && shots.has('night'), 'night and voting screens captured');

  // ---- rematch in the same room
  await host.page.getByTestId('rematch').click();
  for (const p of players) await p.page.getByTestId('card-spread').waitFor({ timeout: 10000 });
  ok(true, 'rematch deals a fresh spread to all 5 in the same room');
} catch (e) {
  ok(false, `exception: ${e.message.split('\n')[0]}`);
  for (const p of players) await p.page.screenshot({ path: `${SHOTS}/zz-fail-p${p.i}.png` }).catch(() => {});
} finally {
  ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 5).join(' / ') : ''}`);
  fs.writeFileSync(`${SHOTS}/results.txt`, results.join('\n') + '\n');
  for (const p of players) await p.ctx.close().catch(() => {});
  await browser.close();
  console.log(results.filter((r) => r.startsWith('FAIL')).length ? 'E2E FAILED' : 'E2E OK', `${((Date.now() - T0) / 1000).toFixed(0)}s`);
}
