/**
 * Player-name voice for narrator mode. Names are typed by the players, so they can't be pre-rendered:
 * Kokoro-82M runs in the browser (kokoro-js in a Web Worker, loaded lazily) with the same voice as the
 * fixed clips, and each name is synthesised once during dealing. Results are kept in memory (object URLs)
 * and in the Cache API (keyed by voice + name) so repeat games are instant.
 *
 * Never blocks the game: if a name isn't ready, the narration falls back (see engine sequence builders).
 *
 * URL flags: ?tts=off  -> no Kokoro (speechSynthesis fallback still allowed)
 *            ?tts=none -> no Kokoro and no speechSynthesis (fixed "Look at the screen" lines)
 *            ?tts=webgpu -> try WebGPU (fp32 model, ~326 MB) instead of wasm q8 (~92 MB)
 */
export const KOKORO_VOICES = { george: 'bm_george', heart: 'af_heart' };
const CACHE_NAME = 'mafia-name-voice-v1';
const SPEED = 0.95;

const param = () => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tts') : null);
export const ttsMode = () => param() || 'auto';

/** Float32 PCM -> trimmed, peak-normalised 16-bit mono WAV Blob. */
export function encodeWav(samples, sampleRate, { peakDb = -2.5, threshold = 0.004 } = {}) {
  let start = 0;
  let end = samples.length;
  while (start < end && Math.abs(samples[start]) < threshold) start++;
  while (end > start && Math.abs(samples[end - 1]) < threshold) end--;
  const pad = Math.round(sampleRate * 0.02);
  start = Math.max(0, start - pad);
  end = Math.min(samples.length, end + pad);
  let peak = 0;
  for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const gain = peak > 0 ? 10 ** (peakDb / 20) / peak : 1;
  const n = end - start;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[start + i] * gain));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

const cleanName = (name) => String(name || '').trim();
const cacheUrl = (voice, name) => `/__name-voice/${voice}/${encodeURIComponent(cleanName(name).toLowerCase())}.wav`;

class NameVoice {
  constructor() {
    this.urls = new Map(); // `${voice}|${name}` -> object URL
    this.listeners = new Set();
    this.worker = null;
    this.reqId = 0;
    this.pending = new Map();
    this.files = {}; // model download progress per file
    this.status = { state: 'idle', done: 0, total: 0, loaded: 0, size: 0, error: null };
    this.stats = { loadMs: null, synthMs: [], fromCache: 0 };
    this.job = Promise.resolve();
  }

  key(voice, name) {
    return `${voice}|${cleanName(name).toLowerCase()}`;
  }

  /** Ready object URL for a name, or null. */
  get(voice, name) {
    return this.urls.get(this.key(voice, name)) || null;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  setStatus(patch) {
    this.status = { ...this.status, ...patch };
    this.listeners.forEach((fn) => fn(this.status));
  }

  enabled() {
    const m = ttsMode();
    return m !== 'off' && m !== 'none' && typeof Worker !== 'undefined';
  }

  ensureWorker() {
    if (this.worker) return this.worker;
    this.worker = new Worker(new URL('./nameVoice.worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        const f = this.files[data.file] || { loaded: 0, total: 0 };
        if (data.total) f.total = data.total;
        if (data.loaded != null) f.loaded = data.loaded;
        if (data.status === 'done' && f.total) f.loaded = f.total;
        this.files[data.file] = f;
        const size = Object.values(this.files).reduce((a, x) => a + (x.total || 0), 0);
        const loaded = Object.values(this.files).reduce((a, x) => a + (x.loaded || 0), 0);
        if (this.status.state === 'loading') this.setStatus({ loaded, size });
        return;
      }
      const p = this.pending.get(data.id);
      if (!p) return;
      this.pending.delete(data.id);
      if (data.type === 'error') p.reject(new Error(data.message));
      else p.resolve(data);
    };
    this.worker.onerror = (e) => {
      this.pending.forEach((p) => p.reject(new Error(e.message || 'worker error')));
      this.pending.clear();
    };
    return this.worker;
  }

  call(msg) {
    const id = ++this.reqId;
    const w = this.ensureWorker();
    const options = ttsMode() === 'webgpu' ? { device: 'webgpu', dtype: 'fp32' } : { device: 'wasm', dtype: 'q8' };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      w.postMessage({ ...msg, id, options });
    });
  }

  async fromCache(voice, name) {
    try {
      if (typeof caches === 'undefined') return null;
      const c = await caches.open(CACHE_NAME);
      const r = await c.match(cacheUrl(voice, name));
      return r ? await r.blob() : null;
    } catch {
      return null;
    }
  }

  async toCache(voice, name, blob) {
    try {
      if (typeof caches === 'undefined') return;
      const c = await caches.open(CACHE_NAME);
      await c.put(cacheUrl(voice, name), new Response(blob, { headers: { 'Content-Type': 'audio/wav' } }));
    } catch {
      // ignore (private mode, quota, ...)
    }
  }

  /**
   * Make every name speakable in `voice` ('george' | 'heart'). Background work; never throws.
   * Returns a promise that resolves when done (or failed).
   */
  prepare(voice, names) {
    const kokoroVoice = KOKORO_VOICES[voice];
    const list = [...new Set(names.map(cleanName).filter(Boolean))];
    if (!this.enabled() || !kokoroVoice) {
      this.setStatus({ state: 'off' });
      return Promise.resolve();
    }
    const run = async () => {
      const todo = list.filter((n) => !this.get(voice, n));
      this.setStatus({ state: todo.length ? 'checking' : 'ready', done: list.length - todo.length, total: list.length, error: null });
      if (!todo.length) return;
      const missing = [];
      for (const n of todo) {
        const blob = await this.fromCache(voice, n);
        if (blob) {
          this.urls.set(this.key(voice, n), URL.createObjectURL(blob));
          this.stats.fromCache += 1;
          this.setStatus({ done: this.status.done + 1 });
        } else missing.push(n);
      }
      if (!missing.length) {
        this.setStatus({ state: 'ready' });
        return;
      }
      try {
        const t0 = performance.now();
        this.setStatus({ state: 'loading' });
        await this.call({ type: 'load' });
        if (this.stats.loadMs === null) this.stats.loadMs = Math.round(performance.now() - t0);
        this.setStatus({ state: 'synth' });
        for (const n of missing) {
          // a trailing full stop gives a natural, complete intonation for a name said on its own
          const r = await this.call({ type: 'synth', text: `${n}.`, voice: kokoroVoice, speed: SPEED });
          this.stats.synthMs.push(r.ms);
          const blob = encodeWav(r.samples, r.sampleRate);
          this.urls.set(this.key(voice, n), URL.createObjectURL(blob));
          this.toCache(voice, n, blob);
          this.setStatus({ done: this.status.done + 1 });
        }
        this.setStatus({ state: 'ready' });
      } catch (e) {
        this.setStatus({ state: 'error', error: String(e.message || e) });
      }
    };
    this.job = this.job.then(run, run);
    return this.job;
  }
}

export const nameVoice = new NameVoice();
if (typeof window !== 'undefined') window.__nameVoice = nameVoice; // debugging / e2e stats

/** Browser speech for just the name (fallback). */
export function canSpeakName() {
  if (ttsMode() === 'none') return false;
  try {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.getVoices().length > 0;
  } catch {
    return false;
  }
}

export function speakName(name, { rate = 1, muted = false } = {}) {
  return new Promise((resolve) => {
    if (!canSpeakName() || muted) {
      setTimeout(resolve, 500 / rate);
      return;
    }
    const synth = window.speechSynthesis;
    const voices = synth.getVoices();
    const voice = voices.find((v) => /en[-_]IN/i.test(v.lang)) || voices.find((v) => /en[-_]GB/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang));
    const u = new SpeechSynthesisUtterance(cleanName(name));
    if (voice) u.voice = voice;
    u.lang = voice?.lang || 'en-GB';
    u.rate = 0.95 * rate;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(t);
      resolve();
    };
    const t = setTimeout(() => {
      try { synth.cancel(); } catch { /* ignore */ }
      finish();
    }, 2500 + 120 * cleanName(name).length);
    u.onend = finish;
    u.onerror = finish;
    try {
      synth.speak(u);
    } catch {
      finish();
    }
  });
}
