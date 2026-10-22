import LINES from './lines.json';

export { LINES };
export const VOICES = {
  george: { id: 'george', label: 'George', description: 'Male' },
  heart: { id: 'heart', label: 'Heart', description: 'Female' },
};

// 44-byte silent WAV, played on the user's first tap to unlock the shared element (iOS/Android autoplay).
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

/**
 * Narrator: one shared HTMLAudioElement + a promise-based sequential queue.
 * `say(ids)` resolves when every clip has finished (or failed / been skipped),
 * so callers can `await` the narration before starting a timed turn.
 * Muting keeps playback (and therefore timing) identical; only the output is silenced.
 */
class Narrator {
  constructor() {
    this.audio = null;
    this.voice = 'george';
    this.muted = false;
    this.rate = 1;
    this.queue = Promise.resolve();
    this.generation = 0; // bumped by stop(); stale queue items become no-ops
    this.caption = '';
    this.listeners = new Set();
    this.unlocked = false;
  }

  el() {
    if (!this.audio && typeof Audio !== 'undefined') {
      this.audio = new Audio();
      this.audio.preload = 'auto';
    }
    return this.audio;
  }

  setVoice(voice) {
    if (VOICES[voice]) this.voice = voice;
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.audio) this.audio.muted = this.muted;
  }

  setRate(rate) {
    this.rate = rate || 1;
  }

  url(id) {
    return `/audio/${this.voice}/${id}.mp3`;
  }

  /** Call synchronously inside a user gesture (e.g. the "Start night" tap). */
  unlock() {
    const a = this.el();
    if (!a || this.unlocked) return;
    this.unlocked = true;
    try {
      a.muted = true;
      a.src = SILENT_WAV;
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
    } catch {
      // ignore
    }
    a.muted = this.muted;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    fn(this.caption);
    return () => this.listeners.delete(fn);
  }

  setCaption(text) {
    this.caption = text;
    this.listeners.forEach((fn) => fn(text));
  }

  /** Queue clips; resolves after the last one ends. */
  say(ids) {
    const list = Array.isArray(ids) ? ids : [ids];
    const gen = this.generation;
    const job = this.queue.then(async () => {
      for (const id of list) {
        if (gen !== this.generation) return;
        await this.playOne(id, gen);
      }
      // the last caption stays visible (also when a clip failed) until the next line / stop()
    });
    this.queue = job.catch(() => {});
    return job;
  }

  playOne(id, gen) {
    const a = this.el();
    this.setCaption(LINES[id] || '');
    if (!a) return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      let safety = null;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(safety);
        a.removeEventListener('ended', finish);
        a.removeEventListener('error', finish);
        a.removeEventListener('loadedmetadata', onMeta);
        this.cancelCurrent = null;
        resolve();
      };
      const onMeta = () => {
        // re-arm the safety net from the real duration
        clearTimeout(safety);
        const ms = (a.duration && Number.isFinite(a.duration) ? a.duration * 1000 : 6000) / this.rate;
        safety = setTimeout(finish, ms + 2000); // never wait past duration + 2s
      };
      this.cancelCurrent = finish;
      if (gen !== this.generation) return finish();
      a.addEventListener('ended', finish);
      a.addEventListener('error', finish);
      a.addEventListener('loadedmetadata', onMeta);
      safety = setTimeout(finish, 10000);
      a.muted = this.muted;
      a.src = this.url(id);
      a.playbackRate = this.rate;
      a.defaultPlaybackRate = this.rate;
      try {
        const p = a.play();
        if (p && p.catch) {
          p.catch(() => {
            // autoplay blocked or interrupted: keep the game moving at roughly the clip's pace
            clearTimeout(safety);
            safety = setTimeout(finish, 2500 / this.rate);
          });
        }
      } catch {
        finish();
      }
    });
  }

  /** Warm the HTTP cache for every clip of the current voice (call at game start). */
  preload(ids) {
    if (typeof fetch === 'undefined') return Promise.resolve();
    const voice = this.voice;
    this.preloaded = this.preloaded || new Set();
    return Promise.all(
      ids.map((id) => {
        const url = `/audio/${voice}/${id}.mp3`;
        if (this.preloaded.has(url)) return null;
        this.preloaded.add(url);
        return fetch(url).then((r) => r.blob()).catch(() => this.preloaded.delete(url));
      })
    );
  }

  /** Stop the current clip and drop everything queued. */
  stop() {
    this.generation += 1;
    if (this.audio) {
      try {
        this.audio.pause();
      } catch {
        // ignore
      }
    }
    this.cancelCurrent?.();
    this.queue = Promise.resolve();
    this.setCaption('');
  }
}

export const narrator = new Narrator();
