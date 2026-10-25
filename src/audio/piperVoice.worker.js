// Web Worker: Piper Tamil (AI4Bharat Rasa voices by tinisoft, CC-BY-4.0) synthesises player names for the Tamil
// narrator. Text -> espeak-ng phoneme ids (piper_phonemize WASM, Tamil-only data, ~1.5 MB) -> VITS ONNX on wasm.
import * as ort from 'onnxruntime-web';
import createPiperPhonemize from './vendor/piper_phonemize_ta.mjs';

const sessions = new Map(); // model url -> Promise<InferenceSession>
const MODEL_CACHE = 'piper-models-v1'; // Cache API copy of the 63 MB model, so it downloads once per device

async function cachedModel(url) {
  try {
    if (typeof caches === 'undefined') return null;
    const r = await (await caches.open(MODEL_CACHE)).match(url);
    return r ? new Uint8Array(await r.arrayBuffer()) : null;
  } catch { return null; }
}
async function storeModel(url, buf) {
  try { if (typeof caches !== 'undefined') await (await caches.open(MODEL_CACHE)).put(url, new Response(buf, { headers: { 'Content-Type': 'application/octet-stream' } })); } catch { /* quota / private mode: just re-download next time */ }
}
let phonemizeAssets = null;

function session(url) {
  if (!sessions.has(url)) {
    const p = (async () => {
      ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
      const hit = await cachedModel(url);
      if (hit) {
        self.postMessage({ type: 'progress', file: url, status: 'done', loaded: hit.length, total: hit.length, cached: true });
        return ort.InferenceSession.create(hit, { executionProviders: ['wasm'] });
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error(`model HTTP ${res.status}`);
      const total = Number(res.headers.get('content-length')) || 0;
      const reader = res.body.getReader();
      const chunks = [];
      let loaded = 0;
      let last = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        if (loaded - last > 1e6 || loaded === total) {
          last = loaded;
          self.postMessage({ type: 'progress', file: url, status: 'progress', loaded, total });
        }
      }
      self.postMessage({ type: 'progress', file: url, status: 'done', loaded, total: total || loaded });
      const buf = new Uint8Array(loaded);
      let o = 0;
      for (const c of chunks) { buf.set(c, o); o += c.length; }
      const sess = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'] });
      storeModel(url, buf); // only once it is known to be a valid model
      return sess;
    })();
    p.catch(() => sessions.delete(url)); // allow a retry later
    sessions.set(url, p);
  }
  return sessions.get(url);
}

/** Tamil text -> Piper phoneme ids (espeak-ng 'ta'). A fresh module per call, as piper_phonemize's main() exits. */
function phonemeIds(text, { wasmUrl, dataUrl }) {
  return new Promise((resolve, reject) => {
    let done = false;
    createPiperPhonemize({
      print: (line) => {
        if (done) return;
        try {
          done = true;
          resolve(JSON.parse(line).phoneme_ids);
        } catch (e) {
          reject(e);
        }
      },
      printErr: () => {},
      locateFile: (u) => (u.endsWith('.wasm') ? wasmUrl : dataUrl),
    })
      .then((m) => m.callMain(['-l', 'ta', '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']))
      .catch((e) => { if (!done) { done = true; reject(e); } });
  });
}

self.onmessage = async ({ data }) => {
  const { id, type } = data || {};
  try {
    phonemizeAssets = data.assets || phonemizeAssets;
    if (type === 'load') {
      await session(data.model);
      self.postMessage({ type: 'loaded', id });
      return;
    }
    if (type === 'synth') {
      const s = await session(data.model);
      const t0 = performance.now();
      const ids = await phonemeIds(data.text, phonemizeAssets);
      const { noiseScale = 0.667, lengthScale = 1, noiseW = 0.8 } = data.scales || {};
      const feeds = {
        input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
        input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
        scales: new ort.Tensor('float32', Float32Array.from([noiseScale, lengthScale, noiseW]), [3]),
      };
      const out = await s.run(feeds);
      const samples = Float32Array.from(out.output.data);
      self.postMessage({ type: 'audio', id, samples, sampleRate: 22050, ms: Math.round(performance.now() - t0) }, [samples.buffer]);
    }
  } catch (e) {
    self.postMessage({ type: 'error', id, message: String((e && e.message) || e) });
  }
};
