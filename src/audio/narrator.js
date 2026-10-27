import LINES from './lines.json';
import LINES_TA from './lines.ta.json';
import { nameVoice, speakName } from './nameVoice';

export { LINES, LINES_TA };

/** Narrator languages. Tamil is the default. */
export const LANGS = {
  ta: { id: 'ta', label: 'தமிழ்', description: 'Tamil' },
  en: { id: 'en', label: 'English', description: 'English' },
};
export const DEFAULT_LANG = 'ta';
export const normalizeLang = (lang) => (LANGS[lang] ? lang : DEFAULT_LANG);

/**
 * The voice setting is the narrator's gender ('george' = male, 'heart' = female, kept for old saves);
 * the clip folder under public/audio/ depends on the language too.
 *  en: Kokoro bm_george / af_heart.   ta: Piper Tamil Rasa male / AI4Bharat Indic Parler-TTS 'jaya' female.
 */
export const VOICES = {
  george: { id: 'george', label: 'George', description: 'Male', lang: 'en', gender: 'george' },
  heart: { id: 'heart', label: 'Heart', description: 'Female', lang: 'en', gender: 'heart' },
  ta_rasa: { id: 'ta_rasa', label: 'Rasa', description: 'ஆண் · Male', lang: 'ta', gender: 'george' },
  ta_jaya: { id: 'ta_jaya', label: 'Jaya', description: 'பெண் · Female', lang: 'ta', gender: 'heart' },
};
const FOLDERS = { en: { george: 'george', heart: 'heart' }, ta: { george: 'ta_rasa', heart: 'ta_jaya' } };

/** Narrator voice (= clip folder) for a language + gender setting, e.g. ('ta', 'heart') -> 'ta_jaya'. */
export const narratorVoice = (lang, gender) => FOLDERS[normalizeLang(lang)][gender === 'heart' ? 'heart' : 'george'];
export const voicesFor = (lang) => Object.values(VOICES).filter((v) => v.lang === normalizeLang(lang));
export const linesFor = (voice) => (VOICES[voice]?.lang === 'ta' ? LINES_TA : LINES);
export const clipUrl = (voice, id) => `/audio/${voice}/${id}.mp3`;

/**
 * The Detective's catch is announced by voice only (ADR 0013): from this clip on, the rest of a
 * narration list ("The Detective found one of the Mafia last night. <name> has been eliminated.")
 * is spoken but never shown as caption text.
 */
export const VOICE_ONLY_FROM = 'detective_found';
/** The part of a narration list that may be shown as caption text. */
export const captionedItems = (list) => {
  const i = list.indexOf(VOICE_ONLY_FROM);
  return i < 0 ? list : list.slice(0, i);
};

// 44-byte silent WAV, played on the user's first tap to unlock the shared element (iOS/Android autoplay).
const NAME_GAP_MS = 150;

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
    return clipUrl(this.voice, id);
  }

  lines() {
    return linesFor(this.voice);
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

  /**
   * Queue items; resolves after the last one ends. An item is a clip id or { name } (a player's
   * name, synthesised in the browser - see nameVoice.js). Names get a short gap on either side and
   * extend the current caption ("Last night, the Mafia struck. Arjun did not survive.").
   */
  say(ids) {
    const list = (Array.isArray(ids) ? ids : [ids]).filter((x) => x !== null && x !== undefined);
    const gen = this.generation;
    const job = this.queue.then(async () => {
      let prev = null;
      const captioned = captionedItems(list).length; // the voice-only tail keeps the last caption
      for (const [i, id] of list.entries()) {
        if (gen !== this.generation) return;
        const isName = typeof id === 'object';
        if (prev !== null && (isName || typeof prev === 'object')) await new Promise((r) => setTimeout(r, NAME_GAP_MS / this.rate));
        if (gen !== this.generation) return;
        const append = prev !== null && (isName || typeof prev === 'object');
        const caption = i < captioned;
        await (isName ? this.playName(id.name, gen, caption) : this.playOne(id, gen, append, null, caption));
        prev = id;
      }
      // the last caption stays visible (also when a clip failed) until the next line / stop()
    });
    this.queue = job.catch(() => {});
    return job;
  }

  /** A player's name: Kokoro clip if ready, else speechSynthesis, else just a short pause. */
  playName(name, gen, caption = true) {
    if (caption) this.setCaption(`${this.caption} ${name}`.trim());
    const url = nameVoice.get(this.voice, name);
    const lang = VOICES[this.voice]?.lang || 'en';
    const speak = () => (gen === this.generation ? speakName(name, { rate: this.rate, muted: this.muted, lang }) : undefined);
    if (!url) return Promise.resolve(speak());
    // a broken blob falls back to the browser's speech for just the name
    return this.playOne(null, gen, true, url).then((ok) => (ok === false ? speak() : undefined));
  }

  playOne(id, gen, append = false, srcOverride = null, caption = true) {
    const a = this.el();
    const lines = this.lines();
    if (id !== null && caption) this.setCaption(append ? `${this.caption} ${lines[id] || ''}`.trim() : lines[id] || '');
    if (!a) return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      let failed = false;
      let safety = null;
      const onError = () => {
        failed = true;
        finish();
      };
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(safety);
        a.removeEventListener('ended', finish);
        a.removeEventListener('error', onError);
        a.removeEventListener('loadedmetadata', onMeta);
        this.cancelCurrent = null;
        resolve(!failed);
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
      a.addEventListener('error', onError);
      a.addEventListener('loadedmetadata', onMeta);
      safety = setTimeout(finish, 10000);
      a.muted = this.muted;
      a.src = srcOverride || this.url(id);
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
        onError();
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
        const url = clipUrl(voice, id);
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
    try {
      if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
    this.queue = Promise.resolve();
    this.setCaption('');
  }
}

export const narrator = new Narrator();
