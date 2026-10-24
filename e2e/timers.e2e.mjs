// Verifies the configurable timers in a real-time (not ?fast) narrator game: picks a 30 s night turn and a
// 1 min discussion on the setup screen, measures every turn window and the discussion, then reloads mid-game,
// changes the setting and resumes to check the saved game keeps its own timers.
// Usage: node e2e/timers.e2e.mjs [chrome|chromium-pixel7|webkit-iphone13]   (needs `vite preview --port 4174`)
// env: TURN=30s DISCUSS=1m
import fs from 'node:fs';
import { launch, newPage, tapper, setup, dealAll, pullEvents, waitAudioIdle, NAME_POOL } from './lib/harness.mjs';

const TARGET = process.argv[2] || 'chrome';
const WEBKIT = TARGET.startsWith('webkit');
const BASE = (process.env.BASE_URL || 'http://localhost:4174/') + '?tts=none';
const TURN = process.env.TURN || '30s';
const DISCUSS = process.env.DISCUSS || '1m';
const turnMs = parseInt(TURN, 10) * 1000;
const discussMs = parseInt(DISCUSS, 10) * 60000;
const OUT = process.env.OUT || '/workspace/shots/timers';
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (c, m) => { results.push(`${c ? 'PASS' : 'FAIL'}: ${m}`); console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const near = (got, want, tol) => Math.abs(got - want) <= tol;

const { browser, ctxOpts } = await launch(TARGET);
const { page, errors, failed } = await newPage(browser, { ...ctxOpts, viewport: { width: 412, height: 915 } });
const tap = tapper(page, WEBKIT);
const names = NAME_POOL.slice(0, 4);
const measured = {};
try {
  await setup(page, tap, BASE, 4, names, { turn: TURN, discuss: DISCUSS, webkitMode: WEBKIT });
  const roles = await dealAll(page, tap, 4, { label: TARGET });
  const by = (r) => names.filter((x) => roles[x] === r);
  const mafia = by('mafia')[0];
  const villagers = names.filter((x) => roles[x] !== 'mafia');
  await tap(page.getByRole('button', { name: 'Start night' }));
  await page.getByTestId('narrator-game').waitFor();
  ok(Number(await page.getByTestId('narrator-game').getAttribute('data-turn-ms')) === turnMs, `game uses turn ${turnMs} ms (data-turn-ms)`);
  ok(Number(await page.getByTestId('narrator-game').getAttribute('data-discuss-ms')) === discussMs, `game uses discussion ${discussMs} ms`);

  const turn = (role, stage = 'open') => page.locator(`[data-testid="night-turn"][data-role="${role}"][data-stage="${stage}"]`);
  for (const role of ['mafia', 'doctor', 'detective']) {
    await turn(role).waitFor({ timeout: 60000 });
    const first = Number((await page.getByTestId('turn-countdown').innerText()).trim());
    ok(first === turnMs / 1000 || first === turnMs / 1000 - 1, `${role} countdown starts at ${first}s`);
    if (role === 'mafia') { await page.screenshot({ path: `${OUT}/07-night-turn-${TURN}.png` }); await tap(page.getByRole('button', { name: villagers[0], exact: true })); }
    if (role === 'doctor') await tap(page.getByRole('button', { name: villagers[1], exact: true }));
    if (role === 'detective') {
      const target = names.find((x) => roles[x] !== 'detective');
      await tap(page.getByRole('button', { name: target, exact: true })).catch(() => {});
    }
  }
  await page.getByTestId('morning-result').waitFor({ timeout: turnMs + 30000 });
  await waitAudioIdle(page);
  await tap(page.getByRole('button', { name: 'Continue to discussion' }));
  await page.getByTestId('discuss-timer').waitFor();
  await waitAudioIdle(page, { quietMs: 200 });
  await page.waitForTimeout(300);
  const shown = (await page.getByTestId('discuss-timer').innerText()).trim();
  ok(shown === `${Math.floor(discussMs / 60000)}:00` || shown === `${Math.floor(discussMs / 60000) - 1}:59` || shown.startsWith('0:5'), `discussion timer shows ${shown}`);
  await page.screenshot({ path: `${OUT}/08-discussion-${DISCUSS}.png` });
  // let it run out on its own
  await page.getByRole('button', { name: /Tie \/ no elimination/ }).waitFor({ timeout: discussMs + 20000 });
  let { events } = await pullEvents(page);
  const at = (pred) => events.find(pred)?.t;
  for (const role of ['mafia', 'doctor', 'detective']) {
    const o = at((e) => e.type === 'stage' && e.stage === `${role}:open`);
    const s = at((e) => e.type === 'stage' && e.stage === `${role}:sleep`);
    measured[`${role}TurnMs`] = s - o;
    ok(near(s - o, turnMs, 600), `${role} turn window measured ${s - o} ms (want ${turnMs})`);
  }
  const dStart = at((e) => e.type === 'phase' && e.phase === 'DAY_DISCUSS');
  const clipEnd = events.filter((e) => e.type === 'ended' && /\/discuss\.mp3$/.test(e.src)).map((e) => e.t).find((t) => t > dStart);
  const vStart = at((e) => e.type === 'phase' && e.phase === 'VOTE');
  measured.discussMs = vStart - clipEnd;
  measured.discussPhaseMs = vStart - dStart;
  ok(near(vStart - clipEnd, discussMs, 1000), `discussion countdown measured ${vStart - clipEnd} ms after the discuss line (want ${discussMs})`);

  // tie -> night 2, then reload mid-turn, change the setting, resume: the saved game keeps its timers
  await tap(page.getByRole('button', { name: /Tie \/ no elimination/ }));
  await waitAudioIdle(page);
  await tap(page.getByRole('button', { name: 'Continue', exact: true }));
  await turn('mafia').waitFor({ timeout: 60000 });
  await page.reload();
  await page.getByRole('button', { name: /Resume game/ }).waitFor();
  await tap(page.getByTestId('turn-length').getByRole('radio', { name: '10s', exact: true }));
  await tap(page.getByRole('button', { name: /Resume game/ }));
  await page.getByTestId('narrator-game').waitFor();
  ok(Number(await page.getByTestId('narrator-game').getAttribute('data-turn-ms')) === turnMs, `resumed game keeps turn ${turnMs} ms after the setting was changed to 10s`);
  await turn('mafia').waitFor({ timeout: 60000 });
  await turn('mafia', 'sleep').waitFor({ timeout: turnMs + 10000 });
  ({ events } = await pullEvents(page));
  const opens = events.filter((e) => e.type === 'stage' && e.stage === 'mafia:open').at(-1).t;
  const sleeps = events.filter((e) => e.type === 'stage' && e.stage === 'mafia:sleep').at(-1).t;
  measured.resumedMafiaTurnMs = sleeps - opens;
  ok(near(sleeps - opens, turnMs, 600), `resumed mafia turn measured ${sleeps - opens} ms (want ${turnMs})`);
  ok(errors.length === 0, `no console errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
  ok(failed.length === 0, `no failed requests${failed.length ? ': ' + failed.slice(0, 3).join(' | ') : ''}`);
} catch (e) {
  ok(false, 'ERROR: ' + e.message.split('\n')[0]);
  await page.screenshot({ path: `/tmp/timers-${TARGET}-error.png` }).catch(() => {});
}
fs.writeFileSync(`${OUT}/timers-${TARGET}-${TURN}-${DISCUSS}.json`, JSON.stringify({ target: TARGET, turnMs, discussMs, measured, results }, null, 1));
console.log(JSON.stringify(measured));
await browser.close();
