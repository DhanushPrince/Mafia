// Real in-browser Kokoro name synthesis (kokoro-js in a worker) in headless Chrome.
// Usage: node e2e/names-tts.e2e.mjs   (needs network access to huggingface.co; vite preview on BASE_URL)
import { chromium } from 'playwright-core';

const BASE = (process.env.BASE_URL || 'http://localhost:4174/') + '?fast=1';
const results = [];
const ok = (c, m) => { results.push(`${c ? 'PASS' : 'FAIL'}: ${m}`); if (!c) process.exitCode = 1; };
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.addInitScript(() => {
  const orig = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    const src = this.src || '';
    if (src.startsWith('blob:') || src.includes('/audio/')) {
      const list = JSON.parse(sessionStorage.getItem('__played') || '[]');
      list.push(src.startsWith('blob:') ? 'NAME' : new URL(src).pathname.split('/').pop().replace('.mp3', ''));
      sessionStorage.setItem('__played', JSON.stringify(list));
    }
    return orig.call(this);
  };
});
let modelBytes = 0;
const big = [];
page.on('requestfinished', async (r) => {
  if (!/huggingface\.co|hf\.co|xethub|\.onnx|\.bin|\.wasm/.test(r.url())) return;
  try {
    const s = await r.sizes();
    modelBytes += s.responseBodySize;
    if (s.responseBodySize > 100000) big.push(`${r.url().split('?')[0].split('/').slice(-2).join('/')} ${(s.responseBodySize / 1e6).toFixed(1)}MB`);
  } catch {}
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const names = ['Arjun', 'Priya', 'Karthik', 'Meena'];
async function setupAndDeal() {
  await page.getByRole('radio', { name: /App is Game Master/ }).click();
  await page.getByRole('radio', { name: /^George/ }).click();
  const countText = async () => Number((await page.getByTestId('player-count').textContent()).trim());
  for (let i = 0; i < 10 && (await countText()) !== 4; i++) await page.getByLabel((await countText()) > 4 ? 'Decrease player count' : 'Increase player count').click();
  await page.getByRole('button', { name: /Next: Player Names/i }).click();
  const inputs = page.locator('input[type="text"]');
  for (let i = 0; i < 4; i++) await inputs.nth(i).fill(names[i]);
  const t0 = Date.now();
  await page.getByRole('button', { name: /Deal Cards/i }).click();
  await page.locator('[data-card="4"]').waitFor();
  return t0;
}
async function dealAll() {
  const map = {};
  for (let i = 1; i <= 4; i++) {
    await page.locator(`[data-card="${i}"]`).click({ force: true });
    const dialog = page.getByRole('dialog'); await dialog.waitFor();
    const name = (await dialog.locator('div.grid button').allInnerTexts())[0];
    await dialog.getByRole('button', { name, exact: true }).click();
    await page.locator(`[data-card="${i}"][data-state="revealed"]`).waitFor();
    map[name] = (await page.locator('[data-testid="reveal-bar"][data-present="true"] >> text=, you are').innerText()).split('you are')[1].trim().toLowerCase();
    await page.getByRole('button', { name: /Hide & Pass/i }).click().catch(() => {});
    await page.locator(`[data-card="${i}"][data-state="taken"]`).waitFor({ timeout: 5000 });
  }
  return map;
}
const played = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('__played') || '[]'));

try {
  await page.goto(BASE);
  await page.evaluate(async () => { localStorage.clear(); for (const k of await caches.keys()) await caches.delete(k); });
  await page.reload();
  const t0 = await setupAndDeal();
  ok(await page.getByTestId('name-voice-status').isVisible({ timeout: 5000 }).catch(() => false), 'non-blocking "Preparing narrator voice" status shown during dealing');
  const statusText = await page.getByTestId('name-voice-status').innerText().catch(() => '');
  const map = await dealAll(); // dealing is not blocked by the model download
  ok(await page.getByRole('button', { name: 'Start night' }).isVisible(), 'dealing finished while the voice loads (non-blocking)');
  await page.locator('[data-testid="name-voice-status"][data-state="ready"]').waitFor({ timeout: 240000 });
  const tReady = Date.now() - t0;
  const stats = await page.evaluate(() => window.__nameVoice.stats);
  ok(stats.synthMs.length === 4, `4 names synthesised in the browser (${stats.synthMs.join(', ')} ms each, total ${stats.synthMs.reduce((a, b) => a + b, 0)} ms)`);
  const urls = await page.evaluate((n) => n.map((x) => window.__nameVoice.get('george', x)), names);
  ok(urls.every((u) => u && u.startsWith('blob:')), 'every name has a blob URL');
  const durs = await page.evaluate(async (u) => Promise.all(u.map((x) => new Promise((r) => { const a = new Audio(x); a.onloadedmetadata = () => r(a.duration); a.onerror = () => r(-1); }))), urls);
  ok(durs.every((d) => d > 0.2 && d < 3), `name clip durations ${durs.map((d) => d.toFixed(2)).join(', ')} s`);

  const by = (r) => Object.keys(map).find((n) => map[n] === r);
  const [mafia, villager, doctor, detective] = ['mafia', 'villager', 'doctor', 'detective'].map(by);
  await page.evaluate(() => sessionStorage.setItem('__played', '[]'));
  await page.getByRole('button', { name: 'Start night' }).click();
  const turn = (role) => page.locator(`[data-testid="night-turn"][data-role="${role}"][data-stage="open"]`);
  await turn('mafia').waitFor({ timeout: 20000 }); await page.getByRole('button', { name: villager, exact: true }).click();
  await turn('doctor').waitFor({ timeout: 20000 }); await page.getByRole('button', { name: detective, exact: true }).click();
  await turn('detective').waitFor({ timeout: 20000 }); await page.getByRole('button', { name: mafia, exact: true }).click();
  await page.getByTestId('morning-victim').waitFor({ timeout: 20000 });
  await page.waitForFunction((v) => document.querySelector('[data-testid="narrator-caption"]')?.innerText.includes(`${v} did not survive`), villager, { timeout: 10000 });
  ok(true, `caption: "Last night, the Mafia struck. ${villager} did not survive."`);
  // the Detective checked the Mafia: caught, named at morning, and the village wins (house rule)
  await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('__played') || '[]').includes('voted_out_post'), null, { timeout: 10000 });
  const p = await played();
  const i = p.indexOf('killed_pre');
  ok(i >= 0 && p[i + 1] === 'NAME' && p[i + 2] === 'killed_post' && p[i + 3] === 'detective_found' && p[i + 4] === 'NAME' && p[i + 5] === 'voted_out_post', `morning sequence: ${p.slice(p.indexOf('morning')).join(' > ')}`);
  ok(!p.includes('killed'), 'old "killed" line not used when the name is ready');
  // ADR 0013: the catch is spoken but never captioned; the caption keeps the kill line
  const cap = await page.getByTestId('narrator-caption').innerText();
  ok(!cap.includes(mafia) && !cap.includes('Detective') && cap.includes(`${villager} did not survive`), `caption stays on the kill line, no catch text: "${cap}"`);
  await page.getByRole('button', { name: 'See who won' }).click();
  await page.getByTestId('winner').waitFor({ timeout: 10000 });
  ok((await page.getByTestId('winner').getAttribute('data-winner')) === 'villagers', 'catching the only Mafia ends the game: villagers win');

  // repeat game after a reload: names come from the Cache API, no synthesis
  await page.reload();
  const t1 = await setupAndDeal();
  await page.locator('[data-testid="name-voice-status"][data-state="ready"]').waitFor({ timeout: 20000 });
  const stats2 = await page.evaluate(() => window.__nameVoice.stats);
  ok(stats2.fromCache === 4 && stats2.synthMs.length === 0, `reload: 4 names from Cache API in ${Date.now() - t1} ms, no re-synthesis`);
  console.log(`model load (download+init) ${stats.loadMs} ms; ready after Deal ${tReady} ms; status example "${statusText}"`);
  ok(errors.length === 0, `no console errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
} catch (e) {
  results.push('ERROR: ' + e.message.split('\n')[0]);
  await page.screenshot({ path: '/tmp/names-tts-error.png' }).catch(() => {});
  process.exitCode = 1;
}
console.log(results.join('\n'));
console.log(`downloaded (model/voice/wasm requests): ${(modelBytes / 1e6).toFixed(1)} MB`);
console.log(big.join('\n'));
await browser.close();
