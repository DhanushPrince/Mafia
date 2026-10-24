// Card-flip visual check. Usage: node e2e/cards.shots.mjs <chrome|webkit-iphone13> <outdir>
// Captures the dealing grid face down, mid-flip, revealed and taken (plus a zoomed face-down card).
import { chromium, webkit, devices } from 'playwright-core';
import fs from 'node:fs';

const TARGET = process.argv[2] || 'chrome';
const OUT = process.argv[3] || `/tmp/cards-${TARGET}`;
fs.mkdirSync(OUT, { recursive: true });
const BASE = (process.env.BASE_URL || 'http://localhost:4174/') + '?fast=1';
const browser = TARGET.startsWith('webkit')
  ? await webkit.launch()
  : await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext(
  TARGET.startsWith('webkit') ? { ...devices['iPhone 13'] } : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
);
const page = await ctx.newPage();
const tap = async (loc) => { await loc.waitFor({ state: 'visible' }); await page.waitForTimeout(250); await loc.dispatchEvent('click'); };
// cards float forever (never 'stable'), so zoom shots clip the page by bounding box
const shot = async (n, loc) => {
  const clip = loc ? await loc.boundingBox() : undefined;
  if (clip) { clip.x -= 8; clip.y -= 24; clip.width += 16; clip.height += 48; }
  return page.screenshot({ path: `${OUT}/${n}.png`, ...(clip ? { clip } : {}) });
};

await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await tap(page.getByRole('radio', { name: /App is Game Master/ }));
for (let i = 0; i < 10 && (await page.getByTestId('player-count').textContent()).trim() !== '4'; i++) {
  await tap(page.getByLabel('Decrease player count'));
}
await tap(page.getByRole('button', { name: /Next: Player Names/i }));
const inputs = page.locator('input[type="text"]');
for (const [i, n] of ['Alice', 'Bob', 'Carol', 'Dave'].entries()) await inputs.nth(i).fill(n);
await tap(page.getByRole('button', { name: /Deal Cards/i }));
await page.locator('[data-card="4"]').waitFor();
await page.waitForTimeout(1500);
await shot('1-face-down');
await shot('1b-face-down-card4-zoom', page.locator('[data-card="4"]'));

await tap(page.locator('[data-card="1"]'));
const dialog = page.getByRole('dialog');
await dialog.waitFor();
const name = (await dialog.locator('div.grid button').allInnerTexts())[0];
const btn = dialog.getByRole('button', { name, exact: true });
await btn.waitFor();
await page.waitForTimeout(400);
await btn.dispatchEvent('click');
// a few frames through the flip (the picker closes first, then the card turns)
for (const [i, ms] of [150, 120, 120].entries()) {
  await page.waitForTimeout(ms);
  await shot(`2-flipping-${'abc'[i]}`, page.locator('[data-card="1"]'));
}
await page.locator('[data-card="1"][data-state="revealed"]').waitFor();
await page.waitForTimeout(900);
await shot('3-revealed');
await shot('3b-revealed-card1-zoom', page.locator('[data-card="1"]'));
await page.getByRole('button', { name: /Hide & Pass/i }).dispatchEvent('click').catch(() => {});
await page.locator('[data-card="1"][data-state="taken"]').waitFor({ timeout: 6000 });
await page.waitForTimeout(900);
await shot('4-taken');
await browser.close();
console.log('saved to', OUT);
