// Narrator-mode e2e. Usage: node e2e/narrator.e2e.mjs [chrome|webkit-iphone13|chromium-pixel7]
// Expects `vite preview` running (BASE_URL, default http://localhost:4174/).
import { chromium, webkit, devices } from 'playwright-core';
import fs from 'node:fs';

const TARGET = process.argv[2] || 'chrome';
// tts=none forces the name fallback (no in-browser Kokoro download, no speechSynthesis) so the run is
// deterministic offline; e2e/names-tts.e2e.mjs covers the real Kokoro path.
const BASE = (process.env.BASE_URL || 'http://localhost:4174/') + '?fast=1&tts=' + (process.env.TTS || 'none');
const SHOTS = process.env.SHOTS || (TARGET === 'chrome' ? '/workspace/shots/narrator' : `/tmp/narrator-${TARGET}`);
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
const T0 = Date.now();
const ok = (cond, msg) => { if (process.env.TRACE) console.log(((Date.now() - T0) / 1000).toFixed(1) + 's', cond ? 'PASS' : 'FAIL', msg); results.push(`${cond ? 'PASS' : 'FAIL'}: ${msg}`); if (!cond) process.exitCode = 1; };

let browser, ctxOpts;
if (TARGET === 'webkit-iphone13') {
  browser = await webkit.launch();
  ctxOpts = { ...devices['iPhone 13'] };
} else if (TARGET === 'chromium-pixel7') {
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  ctxOpts = { ...devices['Pixel 7'] };
} else {
  browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  ctxOpts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
}
const ctx = await browser.newContext(ctxOpts);
const page = await ctx.newPage();
// Record every clip the shared <audio> element actually plays (survives reloads via sessionStorage).
// WebKit serves the preloaded clips from its memory cache without a network request, so there the
// play() record is the evidence; Chromium is checked against real media network requests.
await page.addInitScript(() => {
  const orig = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    try {
      const p = new URL(this.src || this.currentSrc, location.href).pathname;
      if (p.startsWith('/audio/')) {
        const list = JSON.parse(sessionStorage.getItem('__played') || '[]');
        list.push(p);
        sessionStorage.setItem('__played', JSON.stringify(list));
      }
    } catch {}
    return orig.call(this);
  };
});
const consoleErrors = [];
let expectCrash = false;
page.on('console', (m) => { if (m.type() === 'error' && !expectCrash) consoleErrors.push(m.text()); });
page.on('pageerror', (e) => { if (!expectCrash) consoleErrors.push('pageerror: ' + e.message); });
const failed = [];
const WEBKIT_EARLY = TARGET.startsWith('webkit');
const media = []; // audio element requests (WebKit: plus play() records, see syncPlayed)
const audioAll = [];
page.on('request', (r) => {
  const u = new URL(r.url());
  if (u.pathname.startsWith('/audio/')) {
    audioAll.push(u.pathname);
    if (r.resourceType() === 'media') media.push(u.pathname);
  }
});
page.on('requestfailed', (r) => {
  const err = r.failure()?.errorText || '';
  // switching an <audio> src mid-download aborts the old request - expected
  if (/ERR_ABORTED|cancelled|Load request cancelled/i.test(err) && /\/audio\/|fonts\.gstatic\.com/.test(r.url())) return; // aborted audio src switch / font load cancelled by reload
  failed.push(r.url() + ' ' + err);
});
page.on('response', (r) => { if (r.status() >= 400) failed.push(r.url() + ' HTTP ' + r.status()); });

const playedByElement = [];
const syncPlayed = async () => {
  const list = await page.evaluate(() => JSON.parse(sessionStorage.getItem('__played') || '[]'));
  playedByElement.splice(0, playedByElement.length, ...list);
  if (WEBKIT_EARLY) for (const p of list) if (!media.includes(p)) media.push(p);
};
// the caption updates just before play(), and WebKit is slow, so give the clip a moment to start
const waitPlayed = async (ids, timeout = 8000) => {
  const t0 = Date.now();
  for (;;) {
    await syncPlayed();
    if (ids.every((id) => media.includes(`/audio/george/${id}.mp3`)) || Date.now() - t0 > timeout) return;
    await page.waitForTimeout(250);
  }
};
const shot = (name, full = false) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full });
// WebKit headless often reports framer-motion elements as "not stable"; let them settle, then force the click.
const WEBKIT = TARGET.startsWith('webkit');
const tap = async (loc, opts = {}) => {
  if (!WEBKIT) return loc.click(opts);
  await loc.waitFor({ state: 'visible' });
  // scroll only when off-screen (scrollIntoViewIfNeeded would wait for 'stable' forever)
  await loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ block: 'center' });
  }).catch(() => {});
  await page.waitForTimeout(300);
  // coordinate clicks can land on the animating dialog backdrop under WebKit; dispatch the click on the element itself
  return loc.dispatchEvent('click');
};

try {
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(800);

  // --- setup: count + mode + voice ---
  const countText = async () => (await page.getByTestId('player-count').textContent()).trim();
  await tap(page.getByRole('radio', { name: /App is Game Master/ }));
  // Tamil is the default narrator language; this run checks the English (George/Heart) clips
  await tap(page.getByTestId('narrator-language').getByRole('radio', { name: 'English' }));
  ok((await page.getByRole('radio', { name: /^George/ }).getAttribute('aria-checked')) === 'true', 'George is the default voice');
  await tap(page.getByRole('radio', { name: /^Heart/ }));
  await page.reload();
  await page.waitForTimeout(600);
  ok((await page.getByRole('radio', { name: /App is Game Master/ }).getAttribute('aria-checked')) === 'true', 'mode persisted across reload');
  ok((await page.getByRole('radio', { name: /^Heart/ }).getAttribute('aria-checked')) === 'true', 'voice (Heart) persisted across reload');
  await tap(page.getByRole('radio', { name: /^George/ }));
  for (let i = 0; i < 10 && Number(await countText()) !== 4; i++) {
    await tap(page.getByLabel('Decrease player count'));
    await page.waitForTimeout(300);
  }
  ok((await countText()) === '4', 'count set to 4');
  const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('mafia-dealer:settings')));
  ok(settings.voice === 'george' && settings.mode === 'narrator', 'settings saved: narrator + george');
  await page.waitForTimeout(400);
  await shot('01-mode-select-voice');

  await tap(page.getByRole('button', { name: /Next: Player Names/i }));
  ok(await page.getByText('Everyone gets a card; the app is the Game Master.').isVisible(), 'names screen explains narrator mode');
  const names4 = ['Alice', 'Bob', 'Carol', 'Dave'];
  const inputs = page.locator('input[type="text"]');
  for (let i = 0; i < 4; i++) await inputs.nth(i).fill(names4[i]);
  await tap(page.getByRole('button', { name: /Deal Cards/i }));
  await page.locator('[data-card="4"]').waitFor();
  await page.waitForTimeout(1200);

  // --- deal: every player gets a card ---
  const map = {};
  for (let i = 1; i <= 4; i++) {
    await page.locator(`[data-card="${i}"]`).evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await tap(page.locator(`[data-card="${i}"]`), { force: true }); // cards float continuously, never 'stable'
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    const name = (await dialog.locator('div.grid button').allInnerTexts())[0];
    await tap(dialog.getByRole('button', { name, exact: true }));
    await page.locator(`[data-card="${i}"][data-state="revealed"]`).waitFor();
    await page.waitForTimeout(500);
    const bar = (await page.locator('[data-testid="reveal-bar"][data-present="true"] >> text=, you are').innerText()).trim();
    map[name] = bar.split('you are')[1].trim().toLowerCase();
    // the card also auto-hides after 3s, so a slow (WebKit) click may find the bar already gone
    await tap(page.getByRole('button', { name: /Hide & Pass/i })).catch(() => {});
    await page.locator(`[data-card="${i}"][data-state="taken"]`).waitFor({ timeout: 5000 });
  }
  const roles = Object.values(map).sort();
  ok(JSON.stringify(roles) === '["detective","doctor","mafia","villager"]', `all 4 players dealt: ${JSON.stringify(map)}`);
  const by = (r) => Object.keys(map).find((n) => map[n] === r);
  const [mafia, villager, doctor, detective] = ['mafia', 'villager', 'doctor', 'detective'].map(by);
  ok(await page.getByTestId('volume-hint').isVisible(), 'one-time volume hint shown');
  ok((await page.getByRole('button', { name: /Game Master/ }).count()) === 0, 'no human GM hold button in narrator mode');

  // --- night 1 ---
  await tap(page.getByRole('button', { name: 'Start night' }));
  await page.getByTestId('night-intro').waitFor();
  await page.waitForTimeout(300);
  ok((await page.getByTestId('round-label').innerText()).toLowerCase().includes('night 1'), 'round label: Night 1');
  ok((await page.getByTestId('narrator-caption').innerText()).length > 5, 'caption shows narrator text at night intro');
  await shot('02-night-intro');

  const turn = (role, stage = 'open') => page.locator(`[data-testid="night-turn"][data-role="${role}"][data-stage="${stage}"]`);
  await turn('mafia').waitFor({ timeout: 15000 });
  const mafiaTargets = await page.locator('[data-testid="night-turn"] li button').allInnerTexts();
  ok(!mafiaTargets.includes(mafia) && mafiaTargets.length === 3, `mafia list excludes mafia: ${mafiaTargets.join(',')}`);
  await tap(page.getByRole('button', { name: villager, exact: true }));
  await page.waitForTimeout(500);
  ok(await turn('mafia').isVisible(), 'mafia turn does not advance early after a tap');
  ok((await page.getByRole('button', { name: villager, exact: true }).getAttribute('aria-pressed')) === 'true', 'mafia selection highlighted');
  const cd = Number(await page.getByTestId('turn-countdown').innerText());
  ok(cd >= 1 && cd <= 3, `countdown visible (${cd}s)`);
  await shot('03-mafia-turn');

  // --- reload mid-night and resume ---
  await turn('doctor').waitFor({ timeout: 15000 });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mafia-dealer:narrator-game')));
  ok(saved?.phase === 'DOCTOR_TURN' && saved.night.selections.mafia === villager && saved.version === 1, 'engine state persisted mid-night (DOCTOR_TURN, mafia pick, version 1)');
  await page.reload();
  await page.waitForTimeout(600);
  const resumeBtn = page.getByRole('button', { name: /Resume game/ });
  ok(await resumeBtn.isVisible(), `resume offered after reload: "${(await resumeBtn.innerText()).replace(/\s+/g, ' ')}"`);
  await tap(resumeBtn);
  await turn('doctor', 'wake').waitFor({ timeout: 5000 });
  ok(true, 'resumed into DOCTOR_TURN (wake clip replays)');
  await turn('doctor').waitFor({ timeout: 15000 });
  {
    const left = Number(await page.getByTestId('turn-countdown').innerText());
    // fast mode turn = 3s; >=2 tolerates a slow first read on a loaded box (WebKit)
    ok(left >= 2, `turn timer restarted from full after resume (read ${left}s)`);
  }
  const docTargets = await page.locator('[data-testid="night-turn"] li button').allInnerTexts();
  ok(docTargets.length === 4, `doctor sees all 4 alive players: ${docTargets.join(',')}`);
  await tap(page.getByRole('button', { name: detective, exact: true }));
  await page.waitForTimeout(300);
  await shot('04-doctor-turn');

  await turn('detective').waitFor({ timeout: 15000 });
  const detTargets = await page.locator('[data-testid="night-turn"] li button').allInnerTexts();
  ok(!detTargets.includes(detective) && detTargets.length === 3, 'detective list excludes the detective');
  // night 1: a wrong guess (the Doctor) - nothing happens at morning; night 2 catches the Mafia
  await tap(page.getByRole('button', { name: doctor, exact: true }));
  await page.getByTestId('detective-result').waitFor({ timeout: 3000 });
  ok((await page.getByTestId('detective-result').getAttribute('data-mafia')) === 'false', 'detective result: NOT Mafia (thumbs down)');
  await page.waitForTimeout(400);
  await shot('05-detective-result');
  ok(await turn('detective').isVisible(), 'detective turn still running while result is shown');
  ok((await page.getByTestId('detective-result-name').innerText()).includes(doctor), 'investigated name shown above the verdict');
  {
    // the result stays up for the rest of the window (no early hide), then clears at the 'sleep' stage
    const t0 = Date.now();
    let hiddenEarly = false;
    for (;;) {
      const s = await page.evaluate(() => ({
        stage: document.querySelector('[data-testid="night-turn"]')?.getAttribute('data-stage'),
        result: Boolean(document.querySelector('[data-testid="detective-result"]')),
      }));
      if (s.stage !== 'open') break;
      if (!s.result) hiddenEarly = true;
      if (Date.now() - t0 > 15000) break;
      await page.waitForTimeout(100);
    }
    ok(!hiddenEarly, `detective result stayed visible until the window closed (${((Date.now() - t0) / 1000).toFixed(1)}s after the check)`);
    await turn('detective', 'sleep').waitFor({ timeout: 5000 }).catch(() => {});
    await page.getByTestId('detective-result').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
    ok((await page.getByTestId('detective-result').count()) === 0, 'detective result cleared once the sleep stage starts');
  }

  // --- morning ---
  await page.getByTestId('morning-victim').waitFor({ timeout: 15000 });
  ok((await page.getByTestId('morning-victim').innerText()).trim() === villager, `morning shows victim ${villager}`);
  ok((await page.locator(`[data-player="${villager}"]`).getAttribute('data-dead')) === 'true', 'victim card greyed / face down');
  await page.waitForFunction(() => document.querySelector('[data-testid="narrator-caption"]')?.innerText.includes('Someone did not survive'), null, { timeout: 8000 });
  ok(true, 'caption shows the "killed" line');
  ok((await page.getByTestId('morning-detective-found').count()) === 0 && (await page.getByTestId('morning-detective-caught').count()) === 0, 'wrong guess: nothing about the Detective at morning');
  await page.waitForTimeout(300);
  await shot('06-morning-victim');

  // mute toggle persists
  await tap(page.getByRole('button', { name: 'Mute narrator' }));
  ok((await page.evaluate(() => JSON.parse(localStorage.getItem('mafia-dealer:settings')).muted)) === true, 'mute persisted');
  await tap(page.getByRole('button', { name: 'Unmute narrator' }));

  const expected = ['pass_hint', 'night_start', 'mafia_wake', 'mafia_sleep', 'doctor_wake', 'doctor_sleep', 'detective_wake', 'detective_result', 'detective_sleep', 'morning', 'killed'];
  await waitPlayed(expected);
  const missing = expected.filter((id) => !media.includes(`/audio/george/${id}.mp3`));
  ok(missing.length === 0, `audio element requested george clips for night 1${missing.length ? ' (missing: ' + missing.join(',') + ')' : ''}`);
  ok(!media.includes('/audio/george/saved.mp3'), 'no "saved" clip played when someone died');
  ok(!media.includes('/audio/george/detective_found.mp3'), 'no detective_found clip after a wrong guess');
  ok(!media.some((p) => p.startsWith('/audio/heart/')), 'no Heart clips played with George selected');

  // --- day ---
  await tap(page.getByRole('button', { name: 'Continue to discussion' }));
  await page.getByTestId('discuss-timer').waitFor();
  await page.waitForTimeout(400);
  ok((await page.getByTestId('round-label').innerText()).toLowerCase().includes('day 1'), 'round label: Day 1');
  await shot('07-day-discuss');

  // error boundary: force a render crash and resume from the saved state
  expectCrash = true;
  await page.evaluate(() => { window.__forceCrash = true; });
  await page.getByText('Something went wrong').waitFor({ timeout: 3000 });
  ok(true, 'error boundary shows "Something went wrong"');
  await page.evaluate(() => { window.__forceCrash = false; });
  await tap(page.getByRole('button', { name: 'Resume game' }));
  await page.getByTestId('discuss-timer').waitFor({ timeout: 3000 });
  expectCrash = false;
  ok(true, 'error boundary "Resume game" restores the discussion');

  await tap(page.getByRole('button', { name: 'Skip to vote' }));
  await page.getByRole('button', { name: /Tie \/ no elimination/ }).waitFor();
  const voteNames = await page.locator('ul li button').allInnerTexts();
  ok(voteNames.length === 3 && !voteNames.includes(villager), `vote lists 3 alive players: ${voteNames.join(',')}`);
  await page.waitForTimeout(300);
  await shot('08-vote');
  await tap(page.getByRole('button', { name: /Tie \/ no elimination/ }));
  await page.getByTestId('vote-result').waitFor();
  ok((await page.getByTestId('vote-result').innerText()).includes('Tie'), 'vote result shows the tie');
  await page.waitForTimeout(400);
  await tap(page.getByRole('button', { name: 'Continue', exact: true }));

  // --- night 2: the Mafia kill the Doctor, the Detective catches the Mafia ---
  // kill then catch then win check: 1 Mafia vs 1 would be a Mafia win, but the catch leaves 0 Mafia
  await turn('mafia').waitFor({ timeout: 15000 });
  await tap(page.getByRole('button', { name: doctor, exact: true }));
  await turn('doctor').waitFor({ timeout: 15000 });
  await tap(page.getByRole('button', { name: mafia, exact: true })); // the Doctor's save never blocks a catch
  await turn('detective').waitFor({ timeout: 15000 });
  await tap(page.getByRole('button', { name: mafia, exact: true }));
  await page.getByTestId('detective-result').waitFor({ timeout: 3000 });
  ok((await page.getByTestId('detective-result').getAttribute('data-mafia')) === 'true', 'detective result: MAFIA (thumbs up)');
  ok(await page.getByText('MAFIA', { exact: true }).isVisible(), 'MAFIA text shown');
  await page.getByTestId('morning-caught').waitFor({ timeout: 15000 });
  ok((await page.getByTestId('morning-victim').innerText()).trim() === doctor, `morning 2 shows victim ${doctor}`);
  ok((await page.getByTestId('morning-caught').innerText()).trim() === mafia, `morning 2: the Detective caught ${mafia}`);
  ok((await page.locator(`[data-player="${mafia}"]`).getAttribute('data-dead')) === 'true', 'caught Mafia tile marked dead');
  await waitPlayed(['detective_found']);
  ok(media.includes('/audio/george/detective_found.mp3'), 'detective_found clip played for the catch');
  await shot('08b-morning-caught');
  await tap(page.getByRole('button', { name: 'See who won' }));

  // --- end (straight from the morning: no discussion, no vote) ---
  await page.getByTestId('winner').waitFor({ timeout: 5000 });
  ok((await page.getByTestId('winner').getAttribute('data-winner')) === 'villagers', 'Villagers win');
  const log = await page.getByTestId('game-log').innerText();
  ok(log.includes(`Mafia killed ${villager}`) && log.includes(`Mafia killed ${doctor}`) && log.includes('Vote tied') && log.includes(`Detective checked ${doctor}: not Mafia`) && log.includes(`Detective checked ${mafia}: Mafia - caught and out`) && log.includes(`Doctor protected ${detective}`), 'log lists kills, save, checks, catch and tie');
  const reveal = await page.getByTestId('role-reveal').innerText();
  ok(names4.every((n) => reveal.includes(n)) && /MAFIA/i.test(reveal) && /DOCTOR/i.test(reveal), 'full role reveal');
  await page.waitForFunction(() => document.querySelector('[data-testid="narrator-caption"]')?.innerText.includes('villagers win'), null, { timeout: 8000 });
  await waitPlayed(['discuss', 'vote', 'tie', 'villagers_win']);
  for (const id of ['discuss', 'vote', 'tie', 'villagers_win']) ok(media.includes(`/audio/george/${id}.mp3`), `played ${id}.mp3`);
  ok(!media.includes('/audio/george/mafia_win.mp3') && !media.includes('/audio/george/voted_out.mp3'), 'did not play mafia_win / voted_out');
  await page.waitForTimeout(500);
  await shot('09-win-screen-log', true);
  ok((await page.evaluate(() => localStorage.getItem('mafia-dealer:narrator-game'))) === null, 'saved game cleared at END');

  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  const vw = await page.evaluate(() => window.innerWidth);
  ok(sw <= vw, `no horizontal overflow (scrollWidth ${sw} / ${vw})`);

  await tap(page.getByRole('button', { name: /Start New Game/i }));
  await page.waitForTimeout(600);
  ok((await page.getByRole('button', { name: /Resume game/ }).count()) === 0, 'no resume offer after game ended');

  ok(consoleErrors.length === 0, `no console errors${consoleErrors.length ? ': ' + consoleErrors.join(' | ') : ''}`);
  ok(failed.length === 0, `no failed requests${failed.length ? ': ' + failed.join(' | ') : ''}`);
} catch (e) {
  await page.screenshot({ path: `/tmp/e2e-error-${TARGET}.png` }).catch(() => {});
  results.push('ERROR: ' + e.message.split('\n')[0] + ' @ ' + ((e.stack || '').match(/narrator.e2e.mjs:(\d+)/) || [])[1]);
  await page.screenshot({ path: `/tmp/narrator-debug-${TARGET}.png`, fullPage: true }).catch(() => {});
  process.exitCode = 1;
}
console.log(`[${TARGET}]`);
console.log(results.join('\n'));
console.log('media requests:', [...new Set(media)].join(' '));
console.log('played by <audio>:', [...new Set(playedByElement)].join(' '));
if (consoleErrors.length) console.log('console errors:', consoleErrors);
await browser.close();
