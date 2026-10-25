#!/usr/bin/env node
/**
 * Approximate SonarQube's "coverage on new code": lines added/changed vs a base ref (default
 * origin/main) in the Sonar sources (src, worker; tests excluded), scored against coverage/lcov.info.
 * Run `npm run test:coverage` first. Usage: node scripts/new-code-coverage.mjs [baseRef]
 * Like Sonar, coverage = (covered lines + covered conditions) / (lines to cover + conditions to cover),
 * using lcov DA (executable lines) and BRDA (branches) on changed lines. A changed source file missing
 * from lcov counts all its changed lines as uncovered.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const base = process.argv[2] || 'origin/main';
const isSource = (f) => /^(src|worker)\/.*\.(js|jsx|mjs)$/.test(f) && !/\.(test|spec)\.(js|jsx)$/.test(f)
  && !f.startsWith('src/audio/vendor/');

// changed lines per file (new side of the diff)
const diff = execFileSync('git', ['diff', '-U0', '--no-color', `${base}...HEAD`, '--', 'src', 'worker'], { encoding: 'utf8', maxBuffer: 1 << 26 });
const changed = new Map();
let file = null;
for (const line of diff.split('\n')) {
  if (line.startsWith('+++ ')) { file = line.startsWith('+++ b/') ? line.slice(6) : null; continue; }
  const m = file && line.match(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/);
  if (!m || !isSource(file)) continue;
  const start = Number(m[1]); const n = m[2] === undefined ? 1 : Number(m[2]);
  if (!changed.has(file)) changed.set(file, new Set());
  for (let i = 0; i < n; i++) changed.get(file).add(start + i);
}

// lcov: file -> { da: Map(line -> hits), br: Map(line -> [taken...]) }
if (!existsSync('coverage/lcov.info')) { console.error('coverage/lcov.info missing: run npm run test:coverage'); process.exit(2); }
const lcov = new Map();
let cur = null;
for (const line of readFileSync('coverage/lcov.info', 'utf8').split('\n')) {
  if (line.startsWith('SF:')) { cur = { da: new Map(), br: new Map() }; lcov.set(line.slice(3).replace(`${process.cwd()}/`, ''), cur); }
  else if (line.startsWith('DA:') && cur) { const [ln, hits] = line.slice(3).split(',').map(Number); cur.da.set(ln, hits); }
  else if (line.startsWith('BRDA:') && cur) {
    const [ln, , , taken] = line.slice(5).split(',');
    const n = Number(ln);
    if (!cur.br.has(n)) cur.br.set(n, []);
    cur.br.get(n).push(taken === '-' ? 0 : Number(taken));
  }
}

const pct = (c, t) => (t ? `${((100 * c) / t).toFixed(1)}%` : '-');
const sum = { lt: 0, lc: 0, bt: 0, bc: 0 };
const rows = [];
for (const [f, lines] of [...changed].sort()) {
  const cov = lcov.get(f);
  let lt = 0; let lc = 0; let bt = 0; let bc = 0;
  for (const ln of lines) {
    if (!cov) { lt++; continue; } // not instrumented at all: Sonar treats it as uncovered
    if (cov.da.has(ln)) { lt++; if (cov.da.get(ln) > 0) lc++; }
    for (const taken of cov.br.get(ln) || []) { bt++; if (taken > 0) bc++; }
  }
  if (!lt && !bt) continue;
  Object.assign(sum, { lt: sum.lt + lt, lc: sum.lc + lc, bt: sum.bt + bt, bc: sum.bc + bc });
  rows.push([f, `${lc}/${lt}`, pct(lc, lt), `${bc}/${bt}`, pct(bc, bt), pct(lc + bc, lt + bt) + (cov ? '' : ' (not in lcov)')]);
}
const head = ['file', 'lines', 'line %', 'conditions', 'cond %', 'coverage'];
const all = [head, ...rows];
const w = head.map((_, i) => Math.max(...all.map((r) => String(r[i]).length)));
for (const r of all) console.log(r.map((x, i) => (i ? String(x).padStart(w[i]) : String(x).padEnd(w[i]))).join('  '));
console.log(`\nnew code vs ${base}: lines ${sum.lc}/${sum.lt} = ${pct(sum.lc, sum.lt)}, conditions ${sum.bc}/${sum.bt} = ${pct(sum.bc, sum.bt)}`);
console.log(`coverage on new code (Sonar formula): ${pct(sum.lc + sum.bc, sum.lt + sum.bt)}`);
