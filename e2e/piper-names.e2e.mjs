// Piper Tamil name voice in a real browser: synthesise names for both Tamil voices via window.__nameVoice and save
// the WAVs (for an ASR check). the Rasa ONNX is served from /workspace/tamil-tts/hf unless MODEL=remote.
// usage: node e2e/piper-names.e2e.mjs [names...]   (needs `vite preview --port 4174`)
import fs from 'node:fs';
import { launch, NAME_POOL, routeLocalPiper } from './lib/harness.mjs';

const OUT = process.env.OUT || '/workspace/shots/tamil/names';
fs.mkdirSync(OUT, { recursive: true });
const names = process.argv.slice(2).length ? process.argv.slice(2) : NAME_POOL;
const { browser, ctxOpts } = await launch('chrome');
const ctx = await browser.newContext(ctxOpts);
if (process.env.MODEL !== 'remote') await routeLocalPiper(ctx);
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.BASE_URL || 'http://localhost:4174/');
const report = {};
for (const voice of ['ta_rasa', 'ta_jaya']) {
  const t0 = Date.now();
  const res = await page.evaluate(async ({ voice, names }) => {
    const nv = window.__nameVoice;
    await nv.prepare(voice, names);
    const out = {};
    for (const n of names) {
      const url = nv.get(voice, n);
      if (!url) { out[n] = null; continue; }
      const b = new Uint8Array(await (await fetch(url)).arrayBuffer());
      let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
      out[n] = btoa(s);
    }
    return { status: nv.status, stats: nv.stats, out };
  }, { voice, names });
  const files = {};
  for (const [n, b64] of Object.entries(res.out)) {
    if (!b64) continue;
    const f = `${OUT}/${voice}__${n.replace(/[^\w\u0B80-\u0BFF-]+/g, '_')}.wav`;
    fs.writeFileSync(f, Buffer.from(b64, 'base64'));
    files[n] = f;
  }
  report[voice] = { status: res.status, loadMs: res.stats.loadMs, synthMs: res.stats.synthMs, wallMs: Date.now() - t0, files };
  console.log(voice, res.status.state, `load ${res.stats.loadMs} ms`, `synth ${JSON.stringify(res.stats.synthMs)}`, `${Object.keys(files).length}/${names.length} names`);
}
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ report, errors }, null, 1));
if (errors.length) console.log('console errors:', errors.slice(0, 5));
await browser.close();

