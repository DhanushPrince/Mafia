// Multi player-count e2e (narrator mode + human Game Master deal check).
// Usage: node e2e/player-counts.e2e.mjs [chrome|chromium-pixel7|webkit-iphone13]
//   COUNTS=4,7,10,20  (default: 4,5,6,7,8,9,10,12,15,20)   GM_COUNTS=4,7,10,20   SHOTS=/workspace/shots/counts
// Expects `vite preview` on BASE_URL (default http://localhost:4174/).
import { chromium, webkit, devices } from 'playwright-core';
import fs from 'node:fs';

const TARGET = process.argv[2] || 'chrome';
const BASE = (process.env.BASE_URL || 'http://localhost:4174/') + '?fast=1&tts=none';
const COUNTS = (process.env.COUNTS ?? '4,5,6,7,8,9,10,12,15,20').split(',').filter(Boolean).map(Number);
const GM_COUNTS = (process.env.GM_COUNTS ?? '4,7,10,20').split(',').filter(Boolean).map(Number);
const SHOTS = process.env.SHOTS || '/workspace/shots/counts';
fs.mkdirSync(SHOTS, { recursive: true });
const WEBKIT = TARGET.startsWith('webkit');
// outcome plan: both outcomes covered, also in the 4/7/10/20 subset
const PLAN = { 4: 'villagers', 5: 'mafia', 6: 'villagers', 7: 'mafia', 8: 'villagers', 9: 'mafia', 10: 'villagers', 12: 'mafia', 15: 'villagers', 20: 'mafia' };
const expectedMafia = (n) => (n <= 6 ? 1 : n <= 9 ? 2 : 3);

const NAME_POOL = [
  'Arjun', 'Priya', 'Karthik', 'Meena', 'Venkataraghavan', 'Lakshmi Narayanan', 'Ravi', 'Divya', 'Maximilian Alexander',
  'Suresh', 'Anitha', 'Bartholomew-Smith', 'Gopal', 'Kavya', 'Subramaniam Iyer', 'Nikhil', 'Deepa', 'Chandrasekharan K', 'Farah', 'Zoe',
];

let browser, ctxOpts;
if (TARGET === 'webkit-iphone13') { browser = await webkit.launch(); ctxOpts = { ...devices['iPhone 13'] }; }
else if (TARGET === 'chromium-pixel7') { browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}); ctxOpts = { ...devices['Pixel 7'] }; }
else { browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); ctxOpts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }; }

const summary = [];

async function newPage() {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const orig = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      try {
        const p = new URL(this.src || this.currentSrc, location.href).pathname;
        if (p.startsWith('/audio/')) { const l = JSON.parse(sessionStorage.getItem('__played') || '[]'); l.push(p.split('/').pop().replace('.mp3', '')); sessionStorage.setItem('__played', JSON.stringify(l)); }
      } catch {}
      return orig.call(this);
    };
  });
  const errors = [];
  const failed = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => { const err = r.failure()?.errorText || ''; if (/ERR_ABORTED|cancelled/i.test(err) && /\/audio\/|fonts\.gstatic\.com/.test(r.url())) return; failed.push(r.url() + ' ' + err); });
  page.on('response', (r) => { if (r.status() >= 400) failed.push(r.url() + ' HTTP ' + r.status()); });
  // Chromium: clip evidence from media requests too (WebKit serves preloaded clips from memory; there play() records count)
  page.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/audio/') && r.resourceType() === 'media') page.__media.push(u.pathname.split('/').pop().replace('.mp3', '')); });
  page.__media = [];
  page.played = async () => [...new Set([...page.__media, ...(await page.evaluate(() => JSON.parse(sessionStorage.getItem('__played') || '[]')))])];
  page.waitClip = async (id, timeout = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if ((await page.played()).includes(id)) return true; await page.waitForTimeout(150); } return false; };
  return { ctx, page, errors, failed };
}

// WebKit headless: framer-motion elements are rarely 'stable'; dispatch the click on the element itself
const tapper = (page) => async (loc, opts = {}) => {
  if (!WEBKIT) return loc.click(opts);
  await loc.waitFor({ state: 'visible' });
  await loc.evaluate((el) => { const r = el.getBoundingClientRect(); if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ block: 'center' }); }).catch(() => {});
  await page.waitForTimeout(250);
  return loc.dispatchEvent('click');
};

/** Layout probe: horizontal overflow of the document / overlays, elements sticking out of the viewport, clipped button text. */
const layout = (page) => page.evaluate(() => {
  const vw = window.innerWidth;
  const bad = [];
  const docW = document.documentElement.scrollWidth;
  if (docW > vw + 1) bad.push(`document scrollWidth ${docW} > ${vw}`);
  document.querySelectorAll('[data-testid="night-turn"], [role="dialog"]').forEach((el) => { if (el.scrollWidth > el.clientWidth + 1) bad.push(`${el.dataset.testid || 'dialog'} scrollWidth ${el.scrollWidth} > ${el.clientWidth}`); });
  document.querySelectorAll('button, li, input, h1, h2, h3, [data-testid], [data-player], [data-card]').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.opacity === '0') return;
    if (r.right > vw + 1 || r.left < -1) bad.push(`<${el.tagName.toLowerCase()}> "${(el.innerText || el.value || '').slice(0, 24)}" x ${Math.round(r.left)}..${Math.round(r.right)} (vw ${vw})`);
    if (el.tagName === 'BUTTON' && el.innerText.trim()) {
      // text clipped / spilling out of its button (decorative oversized layers are ignored)
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const tr = [];
      for (let t = tw.nextNode(); t; t = tw.nextNode()) { if (!t.textContent.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(t); tr.push(...[...rg.getClientRects()].filter((q) => q.width > 0)); }
      const spill = tr.some((q) => q.right > r.right + 1 || q.left < r.left - 1);
      if (spill) bad.push(`button text spills: "${el.innerText.slice(0, 24)}"`);
    }
  });
  // names cut off with an ellipsis (text-overflow) are not fully readable
  document.querySelectorAll('span, div, p, button').forEach((el) => {
    if (getComputedStyle(el).textOverflow !== 'ellipsis' || !el.innerText.trim()) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0) return;
    if (el.scrollWidth > el.clientWidth + 1) bad.push(`text truncated: "${el.innerText.trim().slice(0, 24)}" in ${el.closest('[data-player]') ? 'player tile' : el.closest('[data-card]') ? 'card' : el.closest('[data-testid]')?.dataset.testid || el.parentElement?.tagName.toLowerCase()}`);
  });
  return [...new Set(bad)].slice(0, 10);
});

/** Every button in a list can be scrolled into view and is the topmost element at its centre (tappable). */
// synchronous (no rAF waits) so it fits inside a 3 s fast-mode night turn, even on WebKit
const reachable = (page, selector) => page.evaluate((sel) => {
  const out = [];
  const btns = [...document.querySelectorAll(sel)];
  for (const b of btns) {
    b.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = b.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    const inView = y > 0 && y < window.innerHeight && x > 0 && x < window.innerWidth;
    if (!inView || !(top === b || b.contains(top))) out.push(b.innerText.trim() || '(empty)');
  }
  return { total: btns.length, unreachable: out };
}, selector);

async function setup(page, tap, mode, n, names) {
  await page.goto(BASE);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.waitForTimeout(500);
  await tap(page.getByRole('radio', { name: mode === 'narrator' ? /App is Game Master/ : /Human Game Master/ }));
  const count = async () => Number((await page.getByTestId('player-count').textContent()).trim());
  for (let i = 0; i < 25 && (await count()) !== n; i++) {
    await tap(page.getByLabel((await count()) > n ? 'Decrease player count' : 'Increase player count'));
    await page.waitForTimeout(WEBKIT ? 150 : 60);
  }
  if ((await count()) !== n) throw new Error(`could not set count ${n} (at ${await count()})`);
  await tap(page.getByRole('button', { name: /Next: Player Names/i }));
  const inputs = page.locator('input[type="text"]');
  await inputs.first().waitFor();
  if ((await inputs.count()) !== n) throw new Error(`names screen has ${await inputs.count()} inputs, expected ${n}`);
  for (let i = 0; i < n; i++) await inputs.nth(i).fill(names[i]);
  await page.waitForTimeout(300);
}

async function dealAll(page, tap, n, ok, shotPrefix) {
  await page.locator(`[data-card="${n}"]`).waitFor();
  await page.waitForTimeout(800);
  const map = {};
  const retries = (page.__retries ||= []);
  let pickerChecked = false;
  for (let i = 1; i <= n; i++) {
    const card = page.locator(`[data-card="${i}"]`);
    await card.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await tap(card, { force: true });
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    const opts = await dialog.locator('div.grid button').allInnerTexts();
    if (opts.length !== n - i + 1) {
      const dbg = await page.evaluate(() => { const d = document.querySelector('[role="dialog"]'); return { dialog: d ? d.innerText.replace(/\s+/g, ' ').slice(0, 200) : null, op: d ? getComputedStyle(d).opacity : null, cards: [...document.querySelectorAll('[data-card]')].map((c) => c.dataset.card + ':' + c.dataset.state).join(' '), scrollY: window.scrollY }; });
      await page.screenshot({ path: `/tmp/counts-${TARGET}-${n}-picker${i}.png` }).catch(() => {});
      ok(false, `picker for card ${i} lists ${opts.length} names, expected ${n - i + 1} ${JSON.stringify(dbg)}`);
    }
    if (!pickerChecked && n >= 10) {
      pickerChecked = true;
      await page.waitForTimeout(400);
      const L = await layout(page);
      ok(L.length === 0, `picker (${n} names) layout ok${L.length ? ': ' + L.join(' | ') : ''}`);
      const R = await reachable(page, '[role="dialog"] div.grid button');
      ok(R.unreachable.length === 0, `picker: all ${R.total} names reachable${R.unreachable.length ? ' (unreachable: ' + R.unreachable.join(',') + ')' : ''}`);
    }
    const name = opts[0];
    if (process.env.DEBUG_HOLD) console.log(`card ${i} -> ${name} (${new Date().toISOString().slice(11, 19)})`);
    // Note: the card is already data-state="revealed" while its picker is open, so wait for the
    // "<name>, you are <role>" bar instead. Headless WebKit sometimes pauses animation frames, and a
    // tap that lands while the picker is still animating in can be dropped there; re-tap (max 3x).
    const t0 = Date.now();
    let seen = false;
    for (let attempt = 0; attempt < 3 && !seen; attempt++) {
      if (attempt) retries.push(`card ${i} name re-tap #${attempt}`);
      if (await dialog.isVisible().catch(() => false)) await tap(dialog.getByRole('button', { name, exact: true })).catch(() => {});
      // read the text in the same in-page poll that detects it (the bar auto-hides after 3 s)
      seen = await page.waitForFunction(() => { const el = document.querySelector('[data-testid="reveal-bar"][data-present="true"] p'); return el && /, you are/.test(el.textContent) ? el.textContent : false; }, null, { timeout: 2000, polling: 50 })
        .then((h) => h.jsonValue(), () => false);
    }
    if (!seen) {
      const st = await page.evaluate(() => ({ cards: [...document.querySelectorAll('[data-card]')].map((c) => c.dataset.card + ':' + c.dataset.state + (c.getAttribute('aria-disabled') === 'true' ? '(disabled)' : '')).join(' '), dialog: !!document.querySelector('[role="dialog"]'), body: document.body.innerText.slice(0, 300).replace(/\s+/g, ' ') }));
      throw new Error(`card ${i}: revealed but no "you are" bar after ${Date.now() - t0}ms; state ${JSON.stringify(st)}`);
    }
    const bar = String(seen).trim();
    map[name] = bar.split('you are')[1].trim().toLowerCase();
    await tap(page.getByRole('button', { name: /Hide & Pass/i })).catch(() => {});
    await page.locator(`[data-card="${i}"][data-state="taken"]`).waitFor({ timeout: 6000 });
  }
  await page.waitForTimeout(600);
  return map;
}

function checkRoles(map, n, names, ok) {
  const got = Object.keys(map);
  ok(got.length === n && names.every((x) => map[x]) && new Set(got).size === n, `all ${n} cards dealt, each name assigned once`);
  const c = { mafia: 0, doctor: 0, detective: 0, villager: 0 };
  Object.values(map).forEach((r) => { c[r] = (c[r] || 0) + 1; });
  const m = expectedMafia(n);
  ok(c.mafia === m && c.doctor === 1 && c.detective === 1 && c.villager === n - m - 2, `roles for ${n}: ${JSON.stringify(c)} (expected ${m} mafia, 1 doctor, 1 detective, ${n - m - 2} villagers)`);
}

async function narratorRun(n) {
  const { ctx, page, errors, failed } = await newPage();
  const tap = tapper(page);
  const results = [];
  const ok = (c, m) => results.push(`${c ? 'PASS' : 'FAIL'}: ${m}`);
  const names = NAME_POOL.slice(0, n);
  const plan = PLAN[n] || (n % 2 ? 'mafia' : 'villagers');
  let rounds = 0;
  let outcome = '?';
  const shoot = TARGET === 'chrome' && n === 20;
  try {
    await setup(page, tap, 'narrator', n, names);
    {
      const L = await layout(page);
      ok(L.length === 0, `names screen layout ok${L.length ? ': ' + L.join(' | ') : ''}`);
      if (shoot) await page.screenshot({ path: `${SHOTS}/20p-01-names.png`, fullPage: true });
    }
    await tap(page.getByRole('button', { name: /Deal Cards/i }));
    await page.locator(`[data-card="${n}"]`).waitFor();
    await page.waitForTimeout(1200);
    {
      const L = await layout(page);
      ok(L.length === 0, `dealing grid layout ok${L.length ? ': ' + L.join(' | ') : ''}`);
      const R = await reachable(page, '[data-card]');
      ok(R.unreachable.length === 0, `dealing grid: all ${R.total} cards reachable${R.unreachable.length ? ' (unreachable: ' + R.unreachable.join(',') + ')' : ''}`);
      if (shoot) { await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/20p-02-dealing-grid.png`, fullPage: true }); }
    }
    const roles = await dealAll(page, tap, n, ok);
    checkRoles(roles, n, names, ok);
    if (shoot) { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: `${SHOTS}/20p-03-all-dealt.png`, fullPage: true }); }

    // ---- game model ----
    const alive = new Set(names);
    const isM = (x) => roles[x] === 'mafia';
    const roleAlive = (r) => [...alive].some((x) => roles[x] === r);
    const mafiaAlive = () => [...alive].filter(isM);
    const othersAlive = () => [...alive].filter((x) => !isM(x));
    const winner = () => (mafiaAlive().length === 0 ? 'villagers' : mafiaAlive().length >= othersAlive().length ? 'mafia' : null);
    const by = (r) => names.filter((x) => roles[x] === r);
    const doctor = by('doctor')[0];
    const detective = by('detective')[0];
    let lastSave = null;
    let tieDone = false;
    const turn = (role, stage = 'open') => page.locator(`[data-testid="night-turn"][data-role="${role}"][data-stage="${stage}"]`);
    const listNames = async () => (await page.locator('[data-testid="night-turn"] li button').allInnerTexts()).map((s) => s.replace(/\s*\(.*\)\s*$/, '').trim());
    const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
    const allChecks = { mafiaList: true, docList: true, detList: true, voteList: true, lastTap: true, victim: true };

    await tap(page.getByRole('button', { name: 'Start night' }));
    for (let round = 1; round <= 25; round++) {
      rounds = round;
      // ---- MAFIA ----
      await turn('mafia').waitFor({ timeout: 30000 });
      const mList = await listNames();
      if (!sameSet(mList, othersAlive())) { allChecks.mafiaList = false; ok(false, `R${round} mafia list ${mList.join(',')} != alive non-mafia ${othersAlive().join(',')}`); }
      if (mList.some(isM)) ok(false, `R${round} mafia list contains a Mafia member`);
      // victim choice: villagers plan -> prefer plain villagers; mafia plan -> prefer doctor/detective first (stronger), then villagers
      const cands = othersAlive();
      const order = plan === 'mafia' ? [...cands.filter((x) => roles[x] !== 'villager'), ...cands.filter((x) => roles[x] === 'villager')] : [...cands.filter((x) => roles[x] === 'villager'), ...cands.filter((x) => roles[x] !== 'villager')];
      const target = order[0];
      // several mafia taps (one per alive mafia, at least 2 when >= 2 alternatives): last tap wins
      const decoys = order.slice(1, Math.max(1, mafiaAlive().length));
      for (const d of decoys) { await tap(page.getByRole('button', { name: d, exact: true })); await page.waitForTimeout(80); }
      await tap(page.getByRole('button', { name: target, exact: true }));
      await page.waitForTimeout(150);
      const pressed = await page.locator('[data-testid="night-turn"] li button[aria-pressed="true"]').allInnerTexts();
      if (!(pressed.length === 1 && pressed[0].startsWith(target))) { allChecks.lastTap = false; ok(false, `R${round} last mafia tap should be highlighted (${target}), got ${pressed.join(',')}`); }
      if (shoot && round === 1) { await page.waitForTimeout(200); await page.screenshot({ path: `${SHOTS}/20p-04-night-mafia-list.png` }); await page.screenshot({ path: `${SHOTS}/20p-04b-night-mafia-list-full.png`, fullPage: true }); }
      if (n === 20 || round === 1) {
        const L = await layout(page);
        ok(L.length === 0, `R${round} night list layout ok${L.length ? ': ' + L.join(' | ') : ''}`);
      }
      if (n === 20 && round === 1) {
        // reachability probe last (it scrolls), selection already made
        const E = await page.evaluate(() => {
          const box = document.querySelector('[data-testid="night-turn"]');
          const btns = [...box.querySelectorAll('li button')];
          const cap = document.querySelector('[data-testid="narrator-caption"]');
          box.scrollTop = box.scrollHeight;
          const last = btns.at(-1).getBoundingClientRect();
          const capTop = cap ? cap.getBoundingClientRect().top : window.innerHeight;
          box.scrollTop = 0;
          const first = btns[0].getBoundingClientRect();
          return { lastBottom: Math.round(last.bottom), capTop: Math.round(capTop), vh: window.innerHeight, firstTop: Math.round(first.top) };
        });
        ok(E.lastBottom <= E.vh && E.lastBottom <= E.capTop + 1, `night list scrolled to end: last name fully visible above the caption (${E.lastBottom} <= ${E.capTop})`);
        ok(E.firstTop >= 0, `night list at top: first name visible (${E.firstTop})`);
        const R = await reachable(page, '[data-testid="night-turn"] li button');
        ok(R.unreachable.length === 0, `night list: all ${R.total} names reachable/tappable${R.unreachable.length ? ' (unreachable: ' + R.unreachable.join(',') + ')' : ''}`);
      }
      // ---- DOCTOR ----
      await turn('doctor').waitFor({ timeout: 30000 });
      const dList = await listNames();
      if (!sameSet(dList, [...alive])) { allChecks.docList = false; ok(false, `R${round} doctor list ${dList.length} != alive ${alive.size}`); }
      const docAlive = roleAlive('doctor');
      let save;
      if (plan === 'villagers' && round === 1) save = target; // save blocks the kill
      else save = [...alive].find((x) => x !== target && x !== lastSave && (plan === 'mafia' ? true : isM(x))) || [...alive].find((x) => x !== target && x !== lastSave);
      if (save) {
        const btn = page.getByRole('button', { name: new RegExp(`^${save.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}(\\s|$)`) });
        if (await btn.isDisabled()) ok(false, `R${round} doctor button for ${save} unexpectedly disabled`);
        else await tap(btn);
      }
      if (docAlive && lastSave && alive.has(lastSave)) {
        const dis = await page.locator('[data-testid="night-turn"] li button', { hasText: lastSave }).first().isDisabled();
        if (!dis) ok(false, `R${round} repeat-save rule: ${lastSave} should be disabled`);
      }
      const effSave = docAlive ? save : null;
      lastSave = docAlive ? save : lastSave;
      // ---- DETECTIVE ----
      await turn('detective').waitFor({ timeout: 30000 });
      const tList = await listNames();
      const expDet = [...alive].filter((x) => x !== detective);
      if (!sameSet(tList, expDet)) { allChecks.detList = false; ok(false, `R${round} detective list ${tList.join(',')} != ${expDet.join(',')}`); }
      const detAlive = roleAlive('detective');
      // a correct check catches that Mafia (house rule), so only the villagers plan checks the Mafia
      const check = plan === 'villagers' && round % 2 ? mafiaAlive()[0] : othersAlive().find((x) => x !== detective);
      if (check) {
        await tap(page.getByRole('button', { name: check, exact: true }));
        if (detAlive) {
          await page.getByTestId('detective-result').waitFor({ timeout: 4000 });
          const r = await page.getByTestId('detective-result').getAttribute('data-mafia');
          if (r !== String(isM(check))) ok(false, `R${round} detective result for ${check}: ${r}`);
        } else {
          await page.waitForTimeout(400);
          if (await page.getByTestId('detective-result').count()) ok(false, `R${round} dead detective got a result`);
        }
      }
      // ---- MORNING ----
      await page.getByTestId('morning-result').waitFor({ timeout: 30000 });
      const expVictim = target !== effSave ? target : null;
      const mv = (await page.getByTestId('morning-victim').innerText()).trim();
      if ((expVictim || 'No one died') !== mv) { allChecks.victim = false; ok(false, `R${round} morning victim "${mv}", expected "${expVictim || 'No one died'}"`); }
      if (expVictim) {
        alive.delete(expVictim);
        if ((await page.locator(`[data-player="${expVictim}"]`).getAttribute('data-dead')) !== 'true') ok(false, `R${round} victim tile not marked dead`);
      }
      // kill, then the Detective's catch, then the win check
      const expCaught = detAlive && check && isM(check) && alive.has(check) ? check : null;
      const caughtShown = (await page.getByTestId('morning-caught').count()) > 0 ? (await page.getByTestId('morning-caught').innerText()).trim() : null;
      if (caughtShown !== expCaught) ok(false, `R${round} morning caught "${caughtShown}", expected "${expCaught}"`);
      if (expCaught) {
        alive.delete(expCaught);
        if ((await page.locator(`[data-player="${expCaught}"]`).getAttribute('data-dead')) !== 'true') ok(false, `R${round} caught tile not marked dead`);
      }
      if (n === 20 && round === 1) {
        await page.waitForTimeout(400);
        const L = await layout(page);
        ok(L.length === 0, `morning screen layout ok${L.length ? ': ' + L.join(' | ') : ''}`);
        if (shoot) await page.screenshot({ path: `${SHOTS}/20p-04c-morning.png`, fullPage: true });
      }
      if (round === 1 && !expVictim) ok(await page.waitClip('saved'), 'saved clip played when the Doctor blocked the kill');
      await tap(page.getByRole('button', { name: winner() ? 'See who won' : 'Continue to discussion' }));
      if (winner()) {
        await page.getByTestId('winner').waitFor({ timeout: 8000 });
        break;
      }
      // ---- DAY ----
      await page.getByTestId('discuss-timer').waitFor({ timeout: 8000 });
      await tap(page.getByRole('button', { name: 'Skip to vote' }));
      await page.getByRole('button', { name: /Tie \/ no elimination/ }).waitFor();
      const vList = await page.locator('ul li button').allInnerTexts();
      if (!sameSet(vList.map((s) => s.trim()), [...alive])) { allChecks.voteList = false; ok(false, `R${round} vote list ${vList.join(',')} != alive ${[...alive].join(',')}`); }
      if (shoot && round === 1) { await page.screenshot({ path: `${SHOTS}/20p-05-vote.png`, fullPage: true }); }
      if (n === 20 && round === 1) {
        const L = await layout(page);
        ok(L.length === 0, `vote screen layout ok${L.length ? ': ' + L.join(' | ') : ''}`);
        const R = await reachable(page, 'ul li button');
        ok(R.unreachable.length === 0, `vote list: all ${R.total} names reachable${R.unreachable.length ? ' (unreachable: ' + R.unreachable.join(',') + ')' : ''}`);
      }
      let out = null;
      if (!tieDone && round === 1) {
        tieDone = true;
        await tap(page.getByRole('button', { name: /Tie \/ no elimination/ }));
        await page.getByTestId('vote-result').waitFor();
        if (!(await page.getByTestId('vote-result').innerText()).includes('Tie')) ok(false, 'tie result not shown');
        ok(await page.waitClip('tie'), 'tie clip played on the tied vote');
      } else {
        out = plan === 'villagers' ? mafiaAlive()[0] : othersAlive().find((x) => roles[x] === 'villager') || othersAlive()[0];
        await tap(page.getByRole('button', { name: out, exact: true }));
        await tap(page.getByRole('button', { name: `Eliminate ${out}` }));
        await page.getByTestId('vote-result').waitFor();
        if (!(await page.getByTestId('vote-result').innerText()).includes(out)) ok(false, `vote result does not show ${out}`);
        alive.delete(out);
      }
      await page.waitForTimeout(200);
      if (n === 20 && round === 2) {
        await page.waitForTimeout(300);
        const L = await layout(page);
        ok(L.length === 0, `vote result screen layout ok${L.length ? ': ' + L.join(' | ') : ''}`);
        if (shoot) await page.screenshot({ path: `${SHOTS}/20p-05b-vote-result.png`, fullPage: true });
      }
      await tap(page.getByRole('button', { name: 'Continue', exact: true }));
      if (winner()) { await page.getByTestId('winner').waitFor({ timeout: 8000 }); break; }
      await page.getByTestId('night-intro').waitFor({ timeout: 8000 });
      // dead players never appear again: verified by the list checks next round
    }
    // ---- END ----
    outcome = await page.getByTestId('winner').getAttribute('data-winner');
    ok(outcome === winner(), `winner ${outcome} matches model (${mafiaAlive().length} mafia vs ${othersAlive().length} others alive)`);
    ok(outcome === plan, `planned outcome reached: ${plan}`);
    ok(allChecks.mafiaList && allChecks.docList && allChecks.detList && allChecks.voteList, 'every round: mafia list = alive non-mafia, doctor = alive, detective = alive minus self, vote = alive');
    ok(allChecks.lastTap && allChecks.victim, 'every round: last mafia tap wins, kill/save applied as expected');
    const clip = outcome === 'mafia' ? 'mafia_win' : 'villagers_win';
    await page.waitClip(clip);
    const played = await page.played();
    ok(played.includes(clip) && !played.includes(outcome === 'mafia' ? 'villagers_win' : 'mafia_win'), `${clip} clip played (and not the other)`);
    const log = await page.getByTestId('game-log').innerText();
    const roundsInLog = (log.match(/^Round \d+/gm) || []).length;
    ok(roundsInLog === rounds, `end log has ${roundsInLog} round entries (rounds played ${rounds})`);
    const reveal = await page.getByTestId('role-reveal').innerText();
    ok(names.every((x) => reveal.includes(x)), 'role reveal lists every player');
    await page.waitForTimeout(500);
    const L = await layout(page);
    ok(L.length === 0, `end screen layout ok${L.length ? ': ' + L.join(' | ') : ''}`);
    if (shoot) await page.screenshot({ path: `${SHOTS}/20p-06-end.png`, fullPage: true });
    ok(errors.length === 0, `no console errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
    ok(failed.length === 0, `no failed requests${failed.length ? ': ' + failed.slice(0, 3).join(' | ') : ''}`);
  } catch (e) {
    results.push('ERROR: ' + e.message.split('\n')[0]);
    await page.screenshot({ path: `/tmp/counts-${TARGET}-${n}-error.png`, fullPage: true }).catch(() => {});
  }
  await ctx.close();
  return { n, mode: 'narrator', plan, outcome, rounds, results, retries: page.__retries || [] };
}

async function gmRun(n) {
  const { ctx, page, errors, failed } = await newPage();
  const tap = tapper(page);
  const results = [];
  const ok = (c, m) => results.push(`${c ? 'PASS' : 'FAIL'}: ${m}`);
  const names = NAME_POOL.slice(0, n);
  try {
    await setup(page, tap, 'human', n, names);
    await tap(page.getByRole('button', { name: /Deal Cards/i }));
    const roles = await dealAll(page, tap, n, ok);
    checkRoles(roles, n, names, ok);
    const hold = page.getByRole('button', { name: /Game Master \(press and hold\)/ });
    await hold.scrollIntoViewIfNeeded().catch(() => {});
    if (WEBKIT) {
      // WebKit iPhone emulation: Playwright has no touch-and-hold, and synthetic mouse input does not
      // reach the pointer handlers here; use the button's keyboard hold (Space) instead
      await hold.focus();
      if (process.env.DEBUG_HOLD) console.log('rAF/s before hold', await page.evaluate(() => new Promise((res) => { let c = 0; const f = () => { c++; requestAnimationFrame(f); }; requestAnimationFrame(f); setTimeout(() => res(c), 1000); })));
      await page.keyboard.down(' ');
      const samples = [];
      for (let k = 0; k < 8; k++) { await page.waitForTimeout(250); samples.push(await hold.getAttribute('data-progress').catch(() => 'gone')); }
      await page.keyboard.up(' ');
      if (process.env.DEBUG_HOLD) console.log('hold progress samples', samples.join(','));
    } else {
      const box = await hold.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(1900);
      await page.mouse.up();
    }
    if (!(await page.getByTestId('mafia-alive').waitFor({ timeout: 5000 }).then(() => true, () => false))) {
      const st = await hold.evaluate((b) => ({ progress: b.dataset.progress, focused: document.activeElement === b, text: b.innerText })).catch((e) => e.message);
      throw new Error('GM view did not open after hold: ' + JSON.stringify(st));
    }
    const labels = await page.locator('li button[aria-pressed]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    const gm = Object.fromEntries(labels.map((l) => { const [nm, r] = l.split(', '); return [nm, r.toLowerCase()]; }));
    ok(labels.length === n && names.every((x) => gm[x] === roles[x]), `GM view lists all ${n} players with the dealt roles`);
    ok(Number(await page.getByTestId('mafia-alive').innerText()) === expectedMafia(n), `GM mafia alive = ${expectedMafia(n)}`);
    const L = await layout(page);
    ok(L.length === 0, `GM view layout ok${L.length ? ': ' + L.join(' | ') : ''}`);
    if (TARGET === 'chrome' && n === 20) await page.screenshot({ path: `${SHOTS}/20p-07-gm-view.png`, fullPage: true });
    ok(errors.length === 0, `no console errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
    ok(failed.length === 0, `no failed requests${failed.length ? ': ' + failed.slice(0, 3).join(' | ') : ''}`);
  } catch (e) {
    results.push('ERROR: ' + e.message.split('\n')[0]);
    await page.screenshot({ path: `/tmp/counts-gm-${TARGET}-${n}-error.png`, fullPage: true }).catch(() => {});
  }
  await ctx.close();
  return { n, mode: 'human-gm', plan: '-', outcome: 'dealt', rounds: 0, results, retries: page.__retries || [] };
}

async function boundaries() {
  const { ctx, page } = await newPage();
  const tap = tapper(page);
  const results = [];
  const ok = (c, m) => results.push(`${c ? 'PASS' : 'FAIL'}: ${m}`);
  try {
    await page.goto(BASE);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const count = async () => Number((await page.getByTestId('player-count').textContent()).trim());
    for (let i = 0; i < 25; i++) { await tap(page.getByLabel('Increase player count')); await page.waitForTimeout(WEBKIT ? 120 : 40); }
    const max = await count();
    for (let i = 0; i < 25; i++) { await tap(page.getByLabel('Decrease player count')); await page.waitForTimeout(WEBKIT ? 120 : 40); }
    const min = await count();
    ok(max === 20, `stepper stops at max ${max}`);
    ok(min === 4, `stepper stops at min ${min}`);
    const hint = await page.getByText(/MIN: \d+/).innerText();
    ok(/MIN: 4/.test(hint) && /MAX: 20/.test(hint), `hint: ${hint}`);
  } catch (e) { results.push('ERROR: ' + e.message.split('\n')[0]); }
  await ctx.close();
  return { n: '4..20', mode: 'stepper', plan: '-', outcome: '-', rounds: 0, results };
}

const runs = [await boundaries()];
for (const n of COUNTS) { const t0 = Date.now(); const r = await narratorRun(n); r.secs = Math.round((Date.now() - t0) / 1000); runs.push(r); console.log(`[${TARGET}] N=${n} ${r.outcome} rounds=${r.rounds} ${r.results.filter((x) => x.startsWith('PASS')).length}/${r.results.length} (${r.secs}s)`); }
for (const n of GM_COUNTS) runs.push(await gmRun(n));
let failedAny = false;
for (const r of runs) {
  const pass = r.results.filter((x) => x.startsWith('PASS')).length;
  const bad = r.results.filter((x) => !x.startsWith('PASS'));
  if (bad.length) failedAny = true;
  summary.push({ target: TARGET, n: r.n, mode: r.mode, plan: r.plan, outcome: r.outcome, rounds: r.rounds, pass, total: r.results.length });
  console.log(`\n== ${TARGET} ${r.mode} N=${r.n} plan=${r.plan} outcome=${r.outcome} rounds=${r.rounds}: ${pass}/${r.results.length}`);
  bad.forEach((b) => console.log('  ' + b));
  if (r.retries?.length) console.log('  (harness re-taps: ' + r.retries.join(', ') + ')');
}
fs.writeFileSync(`/tmp/player-counts-${TARGET}.json`, JSON.stringify({ summary, runs }, null, 1));
if (failedAny) process.exitCode = 1;
await browser.close();
