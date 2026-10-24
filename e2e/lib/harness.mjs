// Shared e2e helpers: browser targets, audio instrumentation, setup + deal flow.
import { chromium, webkit, devices } from 'playwright-core';

export const NAME_POOL = [
  'Arjun', 'Priya', 'Karthik', 'Meena', 'Venkataraghavan', 'Lakshmi Narayanan', 'Ravi', 'Divya', 'Maximilian Alexander',
  'Suresh', 'Anitha', 'Bartholomew-Smith', 'Gopal', 'Kavya', 'Subramaniam Iyer', 'Nikhil', 'Deepa', 'Chandrasekharan K', 'Farah', 'Zoe',
];

export async function launch(target) {
  if (target === 'webkit-iphone13') return { browser: await webkit.launch(), ctxOpts: { ...devices['iPhone 13'] } };
  if (target === 'chromium-pixel7') return { browser: await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), ctxOpts: { ...devices['Pixel 7'] } };
  return {
    browser: await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }),
    ctxOpts: { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  };
}

/**
 * Init script: logs every audio request and what became of it into window.__aev.
 *  - HTMLMediaElement.play() (covers `new Audio()` too): play / resolved / rejected / throw, plus the element's
 *    playing / ended / pause / error / abort / emptied events (with src, currentTime, duration)
 *  - speechSynthesis.speak(): speak / speak-start / speak-end / speak-error
 *  - Web Audio source nodes: ctx-start (ambient drone, UI ticks)
 *  - blob: srcs are Kokoro name clips; the harness maps them back to names via window.__nameVoice.urls
 *  - phase changes of [data-testid=narrator-game]
 */
export function audioInitScript() {
  const ev = [];
  window.__aev = ev;
  const now = () => Math.round(performance.now());
  const log = (type, d = {}) => ev.push({ type, t: now(), ...d });
  window.__alog = log;
  // main-thread heartbeat: a 'lag' event whenever a 100 ms timer fires > 1 s late (page/renderer stalled)
  let beat = performance.now();
  setInterval(() => { const t = performance.now(); if (t - beat > 1100) log('lag', { ms: Math.round(t - beat - 100) }); beat = t; }, 100);
  let nextId = 1;
  const srcOf = (el) => {
    // el.src updates synchronously when the narrator switches clips (currentSrc only after loading)
    const s = el.src || el.currentSrc || '';
    if (s.startsWith('blob:')) return s;
    if (s.startsWith('data:')) return 'data:';
    try { return new URL(s, location.href).pathname; } catch { return s; }
  };
  const hook = (el) => {
    if (el.__aid) return;
    el.__aid = nextId++;
    ['playing', 'ended', 'pause', 'error', 'abort', 'emptied'].forEach((e) => el.addEventListener(e, () => {
      log(e, { el: el.__aid, src: srcOf(el), ct: Number((el.currentTime || 0).toFixed(2)), dur: Number.isFinite(el.duration) ? Number(el.duration.toFixed(2)) : null, code: e === 'error' && el.error ? el.error.code : undefined });
    }));
  };
  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    hook(this);
    const src = srcOf(this);
    const el = this.__aid;
    log('play', { el, src, muted: this.muted, rate: this.playbackRate });
    let p;
    try { p = origPlay.call(this); } catch (e) { log('throw', { el, src, err: String(e) }); throw e; }
    if (p && p.then) p.then(() => log('resolved', { el, src }), (e) => log('rejected', { el, src, err: `${e && e.name}: ${e && e.message}` }));
    return p;
  };
  try {
    const synth = window.speechSynthesis;
    if (synth) {
      const orig = synth.speak.bind(synth);
      synth.speak = (u) => {
        log('speak', { text: u.text });
        u.addEventListener('start', () => log('speak-start', { text: u.text }));
        u.addEventListener('end', () => log('speak-end', { text: u.text }));
        u.addEventListener('error', (e) => log('speak-error', { text: u.text, err: e.error }));
        return orig(u);
      };
    }
  } catch { /* ignore */ }
  try {
    const P = window.AudioScheduledSourceNode && window.AudioScheduledSourceNode.prototype;
    if (P && P.start) { const o = P.start; P.start = function (...a) { log('ctx-start', { node: this.constructor.name }); return o.apply(this, a); }; }
  } catch { /* ignore */ }
  let lastPhase = null;
  const obs = () => {
    const g = document.querySelector('[data-testid="narrator-game"]');
    const ph = g ? g.getAttribute('data-phase') : null;
    if (ph !== lastPhase) { lastPhase = ph; log('phase', { phase: ph }); }
    const turn = document.querySelector('[data-testid="night-turn"]');
    const st = turn ? `${turn.dataset.role}:${turn.dataset.stage}` : null;
    if (st !== window.__lastStage) { window.__lastStage = st; log('stage', { stage: st }); }
  };
  document.addEventListener('DOMContentLoaded', () => {
    new MutationObserver(obs).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-phase', 'data-stage', 'data-role'] });
    obs();
  });
}

export async function newPage(browser, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  await page.addInitScript(audioInitScript);
  const errors = [];
  const failed = [];
  const audioResponses = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => {
    const err = r.failure()?.errorText || '';
    // media requests are cancelled when the shared element switches src; fonts are external
    if (/ERR_ABORTED|cancelled|interrupted/i.test(err) && /\/audio\/|fonts\.g/.test(r.url())) return;
    failed.push(r.url() + ' ' + err);
  });
  page.on('response', (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith('/audio/')) audioResponses.push({ path: u.pathname, status: r.status() });
    if (r.status() >= 400) failed.push(r.url() + ' HTTP ' + r.status());
  });
  return { ctx, page, errors, failed, audioResponses };
}

/** Pull the audio event log (and blob url -> name map) from the page. */
export const pullEvents = (page) => page.evaluate(() => {
  const nv = window.__nameVoice;
  const blobNames = {};
  if (nv) nv.urls.forEach((url, key) => { blobNames[url] = key.split('|').slice(1).join('|'); });
  return { events: window.__aev.slice(), blobNames, nameStatus: nv ? nv.status : null };
});

/** True when no media element is playing, no play() is pending and speech is idle. */
export const audioIdle = (page) => page.evaluate(() => {
  const els = [...document.querySelectorAll('audio')];
  const ev = window.__aev;
  // the narrator's element is not in the DOM: derive from the log
  const active = new Map();
  for (const e of ev) {
    if (!e.el) continue;
    if (e.type === 'play') active.set(e.el, 'pending');
    else if (e.type === 'playing') active.set(e.el, 'playing');
    else if (['ended', 'pause', 'error', 'abort', 'emptied', 'rejected', 'throw'].includes(e.type)) active.delete(e.el);
  }
  const speaking = window.speechSynthesis ? window.speechSynthesis.speaking || window.speechSynthesis.pending : false;
  return active.size === 0 && !speaking && els.every((a) => a.paused);
});

/** Wait until audio has been idle for `quietMs` (e.g. before a player taps Continue). */
export async function waitAudioIdle(page, { quietMs = 700, timeout = 20000 } = {}) {
  const t0 = Date.now();
  let since = null;
  while (Date.now() - t0 < timeout) {
    if (await audioIdle(page)) { since ??= Date.now(); if (Date.now() - since >= quietMs) return true; } else since = null;
    await page.waitForTimeout(100);
  }
  return false;
}

// WebKit headless: framer-motion elements are rarely 'stable'; dispatch the click on the element itself
export const tapper = (page, webkitMode) => async (loc, opts = {}) => {
  if (!webkitMode) return loc.click(opts);
  await loc.waitFor({ state: 'visible' });
  await loc.evaluate((el) => { const r = el.getBoundingClientRect(); if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ block: 'center' }); }).catch(() => {});
  await page.waitForTimeout(250);
  return loc.dispatchEvent('click');
};

/**
 * Setup screen -> names screen with `names` filled in.
 * opts: { voice: 'george'|'heart', turn: '30s', discuss: '1m', query }
 */
export async function setup(page, tap, base, n, names, { voice = 'george', turn, discuss, webkitMode = false } = {}) {
  await page.goto(base);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.waitForTimeout(500);
  await tap(page.getByRole('radio', { name: /App is Game Master/ }));
  await tap(page.getByRole('radio', { name: voice === 'heart' ? /^Heart/ : /^George/ }));
  if (turn) await tap(page.getByTestId('turn-length').getByRole('radio', { name: turn, exact: true }));
  if (discuss) await tap(page.getByTestId('discuss-length').getByRole('radio', { name: discuss, exact: true }));
  const count = async () => Number((await page.getByTestId('player-count').textContent()).trim());
  for (let i = 0; i < 25 && (await count()) !== n; i++) {
    await tap(page.getByLabel((await count()) > n ? 'Decrease player count' : 'Increase player count'));
    await page.waitForTimeout(webkitMode ? 150 : 60);
  }
  if ((await count()) !== n) throw new Error(`could not set count ${n} (at ${await count()})`);
  await tap(page.getByRole('button', { name: /Next: Player Names/i }));
  const inputs = page.locator('input[type="text"]');
  await inputs.first().waitFor();
  if ((await inputs.count()) !== n) throw new Error(`names screen has ${await inputs.count()} inputs, expected ${n}`);
  for (let i = 0; i < n; i++) await inputs.nth(i).fill(names[i]);
  await page.waitForTimeout(300);
  await tap(page.getByRole('button', { name: /Deal Cards/i }));
}

/** Deal every card (each player picks the first free name). Returns { name: role }. */
export async function dealAll(page, tap, n, { onIssue = () => {}, label = '' } = {}) {
  await page.locator(`[data-card="${n}"]`).waitFor();
  await page.waitForTimeout(800);
  const map = {};
  for (let i = 1; i <= n; i++) {
    const card = page.locator(`[data-card="${i}"]`);
    await card.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await tap(card, { force: true });
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    // the picker can still be animating in: wait for its name list
    let opts = [];
    for (let k = 0; k < 20; k++) { opts = await dialog.locator('div.grid button').allInnerTexts(); if (opts.length) break; await page.waitForTimeout(100); }
    if (opts.length !== n - i + 1) {
      const dbg = await page.evaluate(() => ({ cards: [...document.querySelectorAll('[data-card]')].map((c) => c.dataset.card + ':' + c.dataset.state).join(' '), dialogs: document.querySelectorAll('[role="dialog"]').length }));
      await page.screenshot({ path: `/tmp/deal-${label}-${n}-picker${i}.png` }).catch(() => {});
      onIssue(`picker for card ${i} lists ${opts.length} names, expected ${n - i + 1} ${JSON.stringify(dbg)}`);
      if (!opts.length) throw new Error(`deal froze at card ${i}/${n}: empty name picker ${JSON.stringify(dbg)}`);
    }
    const name = opts[0];
    let seen = false;
    for (let attempt = 0; attempt < 3 && !seen; attempt++) {
      if (await dialog.isVisible().catch(() => false)) await tap(dialog.getByRole('button', { name, exact: true })).catch(() => {});
      seen = await page.waitForFunction(() => { const el = document.querySelector('[data-testid="reveal-bar"][data-present="true"] p'); return el && /, you are/.test(el.textContent) ? el.textContent : false; }, null, { timeout: 2000, polling: 50 })
        .then((h) => h.jsonValue(), () => false);
    }
    if (!seen) throw new Error(`card ${i}: no "you are" bar`);
    map[name] = String(seen).split('you are')[1].trim().toLowerCase();
    await tap(page.getByRole('button', { name: /Hide & Pass/i })).catch(() => {});
    await page.locator(`[data-card="${i}"][data-state="taken"]`).waitFor({ timeout: 6000 });
  }
  await page.waitForTimeout(600);
  return map;
}
