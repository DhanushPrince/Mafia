// Web Worker: Kokoro-82M (kokoro-js / transformers.js, ONNX on wasm) synthesises player names off the main thread.
import { KokoroTTS } from 'kokoro-js';

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let ttsPromise = null;

function load({ dtype = 'q8', device = 'wasm' } = {}) {
  if (!ttsPromise) {
    ttsPromise = KokoroTTS.from_pretrained(MODEL_ID, {
      dtype,
      device,
      progress_callback: (p) => {
        if (!p || !p.file) return;
        self.postMessage({ type: 'progress', file: p.file, status: p.status, loaded: p.loaded ?? null, total: p.total ?? null });
      },
    });
    ttsPromise.catch(() => {
      ttsPromise = null; // allow a retry later
    });
  }
  return ttsPromise;
}

self.onmessage = async ({ data }) => {
  const { id, type } = data || {};
  try {
    if (type === 'load') {
      await load(data.options);
      self.postMessage({ type: 'loaded', id });
      return;
    }
    if (type === 'synth') {
      const tts = await load(data.options);
      const t0 = performance.now();
      const audio = await tts.generate(data.text, { voice: data.voice, speed: data.speed ?? 0.95 });
      const samples = audio.audio; // Float32Array
      self.postMessage(
        { type: 'audio', id, samples, sampleRate: audio.sampling_rate, ms: Math.round(performance.now() - t0) },
        [samples.buffer],
      );
    }
  } catch (e) {
    self.postMessage({ type: 'error', id, message: String((e && e.message) || e) });
  }
};
