// Audio matrix e2e: full narrator games at many player counts, for both narrator voices, with every audio
// request instrumented (see lib/harness.mjs audioInitScript). For each game it checks that:
//  - every expected narration line plays, in order (night intro, each role's wake/sleep incl. the dummy turn
//    of a dead role, detective result, morning, kill/saved summary, detective_found only when a living
//    Detective checked a real Mafia, discuss, vote, vote outcome, winner) and nothing unexpected plays
//  - every clip actually started and finished (no rejected play(), no media error, no 4xx on /audio/)
//  - clips come from the selected voice's folder
//  - no two sounds overlap and no clip is cut off
//  - the spoken name (Kokoro run) is the right player for that round; with tts=none the generic
//    "look at the screen" line is used and the screen shows the right player
// Before the games it fetches every clip in lines.json for both voices.
//
// Usage: node e2e/audio-matrix.e2e.mjs [chrome|chromium-pixel7|webkit-iphone13]
//   COUNTS=4,5,6,7,8,9,10,12,15,20  VOICES=george,heart  TTS=none|auto|off  FAST=1|0  TURN=10s
//   OUT=/workspace/shots/audio   (needs `vite preview --port 4174`)
import fs from 'node:fs';
import { launch, newPage, tapper, setup, dealAll, pullEvents, waitAudioIdle, NAME_POOL } from './lib/harness.mjs';

const TARGET = process.argv[2] || 'chrome';
const WEBKIT = TARGET.startsWith('webkit');
const TTS = process.env.TTS || 'none';
const FAST = process.env.FAST !== '0';
const TURN = process.env.TURN || (FAST ? undefined : '10s');
const ORIGIN = process.env.BASE_URL || 'http://localhost:4174/';
const BASE = ORIGIN + '?' + [FAST ? 'fast=1' : null, `tts=${TTS}`].filter(Boolean).join('&');
const COUNTS = (process.env.COUNTS ?? '4,5,6,7,8,9,10,12,15,20').split(',').filter(Boolean).map(Number);
const VOICES = (process.env.VOICES ?? 'george,heart').split(',').filter(Boolean);
const OUT = process.env.OUT || '/workspace/shots/audio';
const TAG = process.env.TAG || `${TARGET}-tts_${TTS}${FAST ? '' : '-realtime'}`;
fs.mkdirSync(`${OUT}/logs`, { recursive: true });
const LINES = JSON.parse(fs.readFileSync(new URL('../src/audio/lines.json', import.meta.url)));
const PLAN = { 4: 'villagers', 5: 'mafia', 6: 'villagers', 7: 'mafia', 8: 'villagers', 9: 'mafia', 10: 'villagers', 12: 'mafia', 15: 'villagers', 20: 'mafia' };
const ROLE_ORDER = ['mafia', 'doctor', 'detective'];
const T0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s]`, ...a);

// ---------- every clip file exists for both voices ----------
async function checkFiles() {
  const missing = [];
  for (const voice of ['george', 'heart']) {
    for (const id of Object.keys(LINES)) {
      const r = await fetch(`${ORIGIN}audio/${voice}/${id}.mp3`);
      const type = r.headers.get('content-type') || '';
      const len = Number(r.headers.get('content-length') || (await r.arrayBuffer()).byteLength);
      if (r.status !== 200 || !/audio|mpeg/.test(type) || len < 1000) missing.push(`${voice}/${id}.mp3 HTTP ${r.status} ${type} ${len}B`);
    }
  }
  return { total: Object.keys(LINES).length * 2, missing };
}

// ---------- analysis of the event log ----------
const clipId = (src, blobNames) => {
  if (src.startsWith('blob:')) return { kind: 'name', id: `name:${blobNames[src] ?? '?'}` };
  const m = src.match(/^\/audio\/([^/]+)\/(.+)\.mp3$/);
  return m ? { kind: 'clip', id: m[2], voice: m[1] } : { kind: 'other', id: src };
};
const fmtItem = (x) => (typeof x === 'object' ? `name:${x.name.toLowerCase()}` : x);

export function analyse(events, blobNames, expected, voice) {
  const plays = [];
  const byEl = new Map(); // el -> current play record
  const active = new Map(); // key -> { what, t }
  const overlaps = [];
  const cuts = [];
  const problems = [];
  for (const e of events) {
    if (e.type === 'play') {
      if (e.src === 'data:') continue; // silent unlock clip
      const c = clipId(e.src, blobNames);
      const rec = { ...c, src: e.src, el: e.el, tPlay: e.t, started: null, ended: null, rejected: null, error: null };
      const prev = byEl.get(e.el);
      if (prev && prev.started !== null && prev.ended === null && !prev.stopped) cuts.push(`${prev.id} cut by ${rec.id}`);
      byEl.set(e.el, rec);
      plays.push(rec);
    } else if (e.el && byEl.get(e.el) && byEl.get(e.el).src === e.src) {
      const rec = byEl.get(e.el);
      if (e.type === 'playing') {
        if (rec.started === null) rec.started = e.t;
        const others = [...active.entries()].filter(([k]) => k !== `el${e.el}`);
        if (others.length) overlaps.push(`${rec.id} started while ${others.map(([, v]) => v.what).join(',')} playing`);
        active.set(`el${e.el}`, { what: rec.id, t: e.t });
      } else if (e.type === 'ended') { rec.ended = e.t; active.delete(`el${e.el}`); }
      else if (e.type === 'pause') {
        active.delete(`el${e.el}`);
        if (rec.ended === null && e.dur && e.ct < e.dur - 0.15) { rec.stopped = true; cuts.push(`${rec.id} paused at ${e.ct}/${e.dur}s`); }
      } else if (e.type === 'error') { rec.error = e.code ?? true; active.delete(`el${e.el}`); }
      else if (e.type === 'rejected') rec.rejected = e.err;
      else if (e.type === 'abort' || e.type === 'emptied') active.delete(`el${e.el}`);
    } else if (e.type === 'speak') {
      plays.push({ kind: 'speech', id: `speech:${String(e.text).toLowerCase()}`, tPlay: e.t, started: null, ended: null });
    } else if (e.type === 'speak-start') {
      const rec = [...plays].reverse().find((p) => p.kind === 'speech' && p.started === null);
      if (rec) rec.started = e.t;
      if (active.size) overlaps.push(`speech "${e.text}" started while ${[...active.values()].map((v) => v.what).join(',')} playing`);
      active.set('speech', { what: `speech:${e.text}`, t: e.t });
    } else if (e.type === 'speak-end' || e.type === 'speak-error') {
      const rec = plays.find((p) => p.kind === 'speech' && p.ended === null);
      if (rec) rec.ended = e.t;
      active.delete('speech');
    }
  }
  const got = plays.map((p) => (p.kind === 'speech' ? p.id.replace('speech:', 'name:') : p.id));
  const want = expected.map(fmtItem);
  let firstDiff = -1;
  for (let i = 0; i < Math.max(got.length, want.length); i++) if (got[i] !== want[i]) { firstDiff = i; break; }
  if (firstDiff >= 0) problems.push(`sequence differs at #${firstDiff}: got [${got.slice(Math.max(0, firstDiff - 2), firstDiff + 4).join(', ')}] want [${want.slice(Math.max(0, firstDiff - 2), firstDiff + 4).join(', ')}]`);
  const failedPlays = plays.filter((p) => p.started === null || p.ended === null || p.rejected || p.error);
  failedPlays.forEach((p) => problems.push(`${p.id}: ${p.rejected ? 'play() rejected ' + p.rejected : p.error ? 'media error ' + p.error : p.started === null ? 'never started' : 'never finished'}`));
  const wrongVoice = plays.filter((p) => p.kind === 'clip' && p.voice !== voice).map((p) => `${p.voice}/${p.id}`);
  if (wrongVoice.length) problems.push(`clips from the wrong voice: ${wrongVoice.slice(0, 4).join(', ')}`);
  const okPlays = plays.filter((p) => p.started !== null && p.ended !== null && !p.rejected && !p.error);
  // count expected items that played correctly in place
  let matched = 0;
  want.forEach((w, i) => { const p = plays[i]; if (p && got[i] === w && okPlays.includes(p)) matched++; });
  const latency = okPlays.map((p) => p.started - p.tPlay);
  const nameItems = want.filter((w) => w.startsWith('name:'));
  const namePlays = plays.filter((p) => p.kind === 'name' || p.kind === 'speech');
  return {
    expected: want.length, played: okPlays.length, matched, sequenceOk: firstDiff < 0,
    failures: failedPlays.length, overlaps, cuts, problems, wrongVoice,
    maxStartLatencyMs: latency.length ? Math.max(...latency) : null,
    names: { expected: nameItems.length, played: namePlays.length, kinds: [...new Set(namePlays.map((p) => p.kind))] },
    got, want,
  };
}

// ---------- one game ----------
async function game(browser, ctxOpts, n, voice) {
  const { ctx, page, errors, failed, audioResponses } = await newPage(browser, ctxOpts);
  const tap = tapper(page, WEBKIT);
  const issues = [];
  const names = NAME_POOL.slice(0, n);
  const plan = PLAN[n] || (n % 2 ? 'mafia' : 'villagers');
  const expected = [];
  const coverage = { saved: 0, killed: 0, detectiveFound: 0, detectiveNotFound: 0, deadRoleTurns: [], tie: 0, votedOut: 0, nameRounds: [] };
  const screenNames = [];
  let rounds = 0;
  let outcome = '?';
  let nameStatus = null;
  const spoken = TTS !== 'none' && TTS !== 'off';
  try {
    await setup(page, tap, BASE, n, names, { voice, turn: TURN, webkitMode: WEBKIT });
    const roles = await dealAll(page, tap, n, { onIssue: (m) => issues.push(m), label: `${TARGET}-${voice}` });
    if (spoken) {
      // the real Kokoro path: wait until every name has been synthesised before the night starts
      await page.waitForFunction(() => ['ready', 'error', 'off'].includes(window.__nameVoice?.status?.state), null, { timeout: 15 * 60000, polling: 500 });
      nameStatus = await page.evaluate(() => ({ ...window.__nameVoice.status, stats: window.__nameVoice.stats }));
      if (nameStatus.state !== 'ready') issues.push(`name voice not ready: ${JSON.stringify(nameStatus)}`);
    }
    const alive = new Set(names);
    const isM = (x) => roles[x] === 'mafia';
    const roleAlive = (r) => [...alive].some((x) => roles[x] === r);
    const mafiaAlive = () => [...alive].filter(isM);
    const othersAlive = () => [...alive].filter((x) => !isM(x));
    const winner = () => (mafiaAlive().length === 0 ? 'villagers' : mafiaAlive().length >= othersAlive().length ? 'mafia' : null);
    const detective = names.find((x) => roles[x] === 'detective');
    const endClip = () => (winner() === 'mafia' ? 'mafia_win' : 'villagers_win');
    let lastSave = null;
    const turn = (role, stage = 'open') => page.locator(`[data-testid="night-turn"][data-role="${role}"][data-stage="${stage}"]`);
    const tapName = (nm) => tap(page.locator('[data-testid="night-turn"] li button').filter({ hasText: new RegExp(`^${nm.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}(\\s|\\(|$)`) }).first());

    await tap(page.getByRole('button', { name: 'Start night' }));
    for (let round = 1; round <= 25; round++) {
      rounds = round;
      expected.push(...(round === 1 ? ['pass_hint', 'night_start'] : ['night_start']));
      ROLE_ORDER.forEach((r) => { if (!roleAlive(r)) coverage.deadRoleTurns.push(`R${round} ${r}`); });
      // ---- MAFIA ----
      await turn('mafia').waitFor({ timeout: 60000 });
      const cands = othersAlive();
      const order = plan === 'mafia' ? [...cands.filter((x) => roles[x] !== 'villager'), ...cands.filter((x) => roles[x] === 'villager')] : [...cands.filter((x) => roles[x] === 'villager'), ...cands.filter((x) => roles[x] !== 'villager')];
      const target = order[0];
      await tapName(target);
      expected.push('mafia_wake', 'mafia_sleep');
      // ---- DOCTOR ----
      await turn('doctor').waitFor({ timeout: 60000 });
      const docAlive = roleAlive('doctor');
      let save;
      if (plan === 'villagers' && round === 1) save = target;
      else save = [...alive].find((x) => x !== target && x !== lastSave && (plan === 'mafia' ? true : isM(x))) || [...alive].find((x) => x !== target && x !== lastSave);
      if (save) await tapName(save);
      const effSave = docAlive ? save : null;
      lastSave = docAlive ? save : lastSave;
      expected.push('doctor_wake', 'doctor_sleep');
      // ---- DETECTIVE ----
      await turn('detective').waitFor({ timeout: 60000 });
      const detAlive = roleAlive('detective');
      const check = round % 2 ? mafiaAlive()[0] : othersAlive().find((x) => x !== detective);
      if (check) await tapName(check);
      if (detAlive && check) {
        const shown = await page.getByTestId('detective-result').waitFor({ timeout: 4000 }).then(() => true, () => false);
        if (!shown) issues.push(`R${round} detective result not shown`);
      }
      expected.push('detective_wake', ...(detAlive && check ? ['detective_result'] : []), 'detective_sleep');
      // ---- MORNING ----
      await page.getByTestId('morning-result').waitFor({ timeout: 60000 });
      const victim = target !== effSave ? target : null;
      const found = Boolean(detAlive && check && isM(check));
      const mv = (await page.getByTestId('morning-victim').innerText()).trim();
      screenNames.push({ round, kind: 'died', want: victim || 'No one died', screen: mv });
      if ((victim || 'No one died') !== mv) issues.push(`R${round} morning screen shows "${mv}", expected "${victim || 'No one died'}"`);
      expected.push('morning');
      if (victim) { expected.push(...(spoken ? ['killed_pre', { name: victim }, 'killed_post'] : ['killed'])); coverage.killed++; if (spoken) coverage.nameRounds.push(`R${round} died ${victim}`); alive.delete(victim); }
      else { expected.push('saved'); coverage.saved++; }
      if (found) { expected.push('detective_found'); coverage.detectiveFound++; } else if (detAlive && check) coverage.detectiveNotFound++;
      if (!(await waitAudioIdle(page))) issues.push(`R${round} morning narration did not finish`);
      await tap(page.getByRole('button', { name: 'Continue to discussion' }));
      if (winner()) { expected.push(endClip()); await page.getByTestId('winner').waitFor({ timeout: 15000 }); break; }
      // ---- DAY ----
      await page.getByTestId('discuss-timer').waitFor({ timeout: 15000 });
      expected.push('discuss');
      if (!(await waitAudioIdle(page))) issues.push(`R${round} discuss line did not finish`);
      if (await page.getByTestId('discuss-timer').isVisible().catch(() => false)) await tap(page.getByRole('button', { name: 'Skip to vote' })).catch(() => {});
      await page.getByRole('button', { name: /Tie \/ no elimination/ }).waitFor({ timeout: 15000 });
      expected.push('vote');
      if (!(await waitAudioIdle(page))) issues.push(`R${round} vote line did not finish`);
      let out = null;
      if (round === 1) {
        await tap(page.getByRole('button', { name: /Tie \/ no elimination/ }));
        expected.push('tie');
        coverage.tie++;
      } else {
        out = plan === 'villagers' ? mafiaAlive()[0] : othersAlive().find((x) => roles[x] === 'villager') || othersAlive()[0];
        await tap(page.getByRole('button', { name: out, exact: true }));
        await tap(page.getByRole('button', { name: `Eliminate ${out}` }));
        expected.push(...(spoken ? ['voted_out_pre', { name: out }, 'voted_out_post'] : ['voted_out']));
        coverage.votedOut++;
        if (spoken) coverage.nameRounds.push(`R${round} voted out ${out}`);
        alive.delete(out);
      }
      await page.getByTestId('vote-result').waitFor();
      const vr = (await page.getByTestId('vote-result').innerText()).replace(/\s+/g, ' ').trim();
      screenNames.push({ round, kind: 'eliminated', want: out || 'Tie', screen: vr });
      if (out ? !vr.includes(out) : !vr.includes('Tie')) issues.push(`R${round} vote result shows "${vr}"`);
      if (!(await waitAudioIdle(page))) issues.push(`R${round} vote outcome did not finish`);
      await tap(page.getByRole('button', { name: 'Continue', exact: true }));
      if (winner()) { expected.push(endClip()); await page.getByTestId('winner').waitFor({ timeout: 15000 }); break; }
      await page.getByTestId('night-intro').waitFor({ timeout: 15000 });
    }
    outcome = await page.getByTestId('winner').getAttribute('data-winner');
    if (outcome !== winner()) issues.push(`winner ${outcome} != model ${winner()}`);
    if (!(await waitAudioIdle(page, { quietMs: 1200 }))) issues.push('winner line did not finish');
  } catch (e) {
    issues.push('ERROR: ' + e.message.split('\n')[0]);
    await page.screenshot({ path: `/tmp/audio-${TAG}-${voice}-${n}-error.png`, fullPage: true }).catch(() => {});
  }
  const { events, blobNames } = await pullEvents(page).catch(() => ({ events: [], blobNames: {} }));
  const a = analyse(events, blobNames, expected, voice);
  // name check: spoken names in the right slots (Kokoro) / generic line + right name on screen (tts=none)
  let nameOk;
  if (spoken) {
    const wantNames = a.want.filter((w) => w.startsWith('name:'));
    const gotNames = a.got.filter((g) => g.startsWith('name:'));
    nameOk = wantNames.length > 0 && wantNames.length === gotNames.length && wantNames.every((w, i) => w === gotNames[i]) && a.sequenceOk;
  } else {
    nameOk = screenNames.every((s) => (s.kind === 'died' ? s.screen === s.want : s.screen.includes(s.want))) && !a.got.some((g) => g.startsWith('name:'));
  }
  const bad404 = audioResponses.filter((r) => r.status >= 400);
  const ctxStarts = events.filter((e) => e.type === 'ctx-start').length;
  const lags = events.filter((e) => e.type === 'lag').map((e) => e.ms);
  const ok = issues.length === 0 && a.problems.length === 0 && a.overlaps.length === 0 && a.cuts.length === 0 && bad404.length === 0 && nameOk && errors.length === 0 && failed.length === 0;
  const res = {
    target: TARGET, voice, n, tts: TTS, fast: FAST, plan, outcome, rounds, ok,
    clips: `${a.played}/${a.expected}`, matched: a.matched, expected: a.expected, played: a.played,
    failures: a.failures + bad404.length, overlaps: a.overlaps, cuts: a.cuts, nameOk,
    nameFallback: spoken ? (a.names.kinds.join('+') || 'none') : 'generic line (tts=none)',
    nameStatus, coverage, screenNames, issues, problems: a.problems, http404: bad404, consoleErrors: errors, failedRequests: failed,
    maxStartLatencyMs: a.maxStartLatencyMs, webAudioStarts: ctxStarts, pageStalls: lags.length, maxStallMs: lags.length ? Math.max(...lags) : 0, got: a.got, want: a.want,
  };
  fs.writeFileSync(`${OUT}/logs/${TAG}-${voice}-${n}.json`, JSON.stringify({ ...res, events }, null, 1));
  await ctx.close();
  return res;
}

const files = await checkFiles();
log(`clip files: ${files.total - files.missing.length}/${files.total} ok${files.missing.length ? ' MISSING ' + files.missing.join(', ') : ''}`);
const { browser, ctxOpts } = await launch(TARGET);
const all = [];
for (const voice of VOICES) {
  for (const n of COUNTS) {
    const t0 = Date.now();
    const r = await game(browser, ctxOpts, n, voice);
    r.secs = Math.round((Date.now() - t0) / 1000);
    all.push(r);
    log(`${TARGET} ${voice} N=${n} ${r.ok ? 'OK' : 'FAIL'} clips ${r.clips} fail=${r.failures} overlaps=${r.overlaps.length} cuts=${r.cuts.length} name=${r.nameOk ? 'ok' : 'WRONG'} (${r.nameFallback}) outcome=${r.outcome} rounds=${r.rounds} ${r.secs}s${r.pageStalls ? ` page-stalls=${r.pageStalls} (max ${(r.maxStallMs / 1000).toFixed(1)}s)` : ''}`);
    [...r.issues, ...r.problems, ...r.overlaps, ...r.cuts, ...r.consoleErrors.slice(0, 3), ...r.failedRequests.slice(0, 3)].forEach((x) => log('   ', x));
  }
}
await browser.close();
const summary = { tag: TAG, files, games: all.map(({ got, want, ...r }) => r) };
fs.writeFileSync(`${OUT}/summary-${TAG}-${COUNTS.join('_')}-${VOICES.join('_')}.json`, JSON.stringify(summary, null, 1));
if (files.missing.length || all.some((r) => !r.ok)) process.exitCode = 1;
