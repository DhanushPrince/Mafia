/**
 * Quiet procedural night drone (Web Audio, no assets): two detuned low oscillators
 * plus soft filtered noise with a slow "breathing" LFO. Meant to mask taps on the phone.
 */
let ctx = null;
let nodes = null;

function getCtx() {
  if (!ctx) {
    const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!Ctx) return null;
    ctx = new Ctx();
  }
  return ctx;
}

/** Resume the context inside a user gesture (mobile autoplay). */
export function unlockAmbient() {
  const c = getCtx();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

export function startAmbient(volume = 0.05) {
  const c = getCtx();
  if (!c || nodes) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  const master = c.createGain();
  master.gain.setValueAtTime(0, c.currentTime);
  master.gain.linearRampToValueAtTime(volume, c.currentTime + 3);
  master.connect(c.destination);

  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 420;
  filter.Q.value = 0.7;
  filter.connect(master);

  const oscs = [
    { f: 55, type: 'sine', g: 0.5 },
    { f: 55.35, type: 'sine', g: 0.4 },
    { f: 82.4, type: 'triangle', g: 0.12 },
  ].map(({ f, type, g }) => {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const og = c.createGain();
    og.gain.value = g;
    o.connect(og).connect(filter);
    o.start();
    return o;
  });

  // soft pink-ish noise
  const len = c.sampleRate * 2;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3;
  }
  const noise = c.createBufferSource();
  noise.buffer = buf;
  noise.loop = true;
  const ng = c.createGain();
  ng.gain.value = 0.35;
  noise.connect(ng).connect(filter);
  noise.start();

  // slow breathing on the filter
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 120;
  lfo.connect(lfoGain).connect(filter.frequency);
  lfo.start();

  nodes = { master, sources: [...oscs, noise, lfo] };
}

export function stopAmbient() {
  const c = ctx;
  if (!c || !nodes) return;
  const { master, sources } = nodes;
  nodes = null;
  const t = c.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setValueAtTime(master.gain.value, t);
  master.gain.linearRampToValueAtTime(0, t + 1.5);
  sources.forEach((s) => {
    try {
      s.stop(t + 1.6);
    } catch {
      // ignore
    }
  });
  setTimeout(() => master.disconnect(), 1800);
}

export const isAmbientPlaying = () => Boolean(nodes);
