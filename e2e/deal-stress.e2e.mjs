// Deal-only stress run: deals N cards K times and records a DOM timeline of the dealing overlays.
// Asserts the invariant "while a card's picker is open (data-picker set) a live dialog exists".
// Usage: BASE=http://localhost:4174 N=10 K=5 node e2e/deal-stress.e2e.mjs webkit-iphone13
import { launch, newPage, tapper, setup, dealAll, NAME_POOL } from './lib/harness.mjs';

const TARGET = process.argv[2] || 'webkit-iphone13';
const BASE = process.env.BASE || 'http://localhost:4174';
const N = Number(process.env.N || 10);
const K = Number(process.env.K || 5);
const webkitMode = TARGET.startsWith('webkit');

const timeline = () => {
  const ev = (window.__dev = []);
  const t0 = performance.now();
  const snap = () => {
    const root = document.querySelector('[data-testid="dealing"]');
    if (!root) return null;
    return `picker=${root.dataset.picker} rev=${root.dataset.revealing} hide=${root.dataset.hiding} dialogs=${document.querySelectorAll('[role="dialog"]').length} overlays=${document.querySelectorAll('.fixed.inset-0.z-\\[60\\]').length}`;
  };
  let last = '';
  const check = () => {
    const s = snap();
    if (s && s !== last) { last = s; ev.push(`${Math.round(performance.now() - t0)} ${s}`); }
  };
  new MutationObserver(check).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-picker', 'data-revealing', 'data-hiding', 'role'] });
  setInterval(check, 50);
  // invariant watcher: picker open for >400ms without any dialog
  let since = null;
  setInterval(() => {
    const root = document.querySelector('[data-testid="dealing"]');
    if (!root) return;
    const broken = root.dataset.picker !== '' && !document.querySelector('[role="dialog"]');
    if (broken) { since ??= performance.now(); if (performance.now() - since > 400) window.__broken = true; } else since = null;
  }, 50);
};

const { browser, ctxOpts } = await launch(TARGET);
let fails = 0;
for (let k = 1; k <= K; k++) {
  const { page } = await newPage(browser, ctxOpts);
  await page.addInitScript(timeline);
  const tap = tapper(page, webkitMode);
  const t = Date.now();
  let err = null;
  try {
    await setup(page, tap, `${BASE}/?tts=none&fast=1`, N, NAME_POOL.slice(0, N), { webkitMode });
    await dealAll(page, tap, N, { label: `stress-${TARGET}` });
  } catch (e) { err = e.message.split('\n')[0]; }
  const broken = await page.evaluate(() => window.__broken === true).catch(() => null);
  const tl = await page.evaluate(() => window.__dev).catch(() => []);
  if (err || broken) {
    fails++;
    console.log(`#${k} FAIL ${err || 'invariant broken'} broken=${broken}`);
    console.log(tl.slice(-25).join('\n'));
  } else console.log(`#${k} ok ${Math.round((Date.now() - t) / 1000)}s`);
  await page.context().close();
}
await browser.close();
console.log(`${TARGET} N=${N}: ${K - fails}/${K} deals ok`);
process.exit(fails ? 1 : 0);
