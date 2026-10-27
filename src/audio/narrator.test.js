import { describe, it, expect } from 'vitest';
import { LANGS, DEFAULT_LANG, VOICES, normalizeLang, narratorVoice, voicesFor, linesFor, clipUrl, LINES, LINES_TA, narrator, captionedItems } from './narrator';
import { nameEngine, nameText, KOKORO_VOICES, PIPER_VOICES } from './nameVoice';

describe('narrator language + voice selection', () => {
  it('offers Tamil and English, Tamil first and by default', () => {
    expect(Object.keys(LANGS)).toEqual(['ta', 'en']);
    expect(LANGS.ta.label).toBe('தமிழ்');
    expect(DEFAULT_LANG).toBe('ta');
    expect(normalizeLang(undefined)).toBe('ta');
    expect(normalizeLang('fr')).toBe('ta');
    expect(normalizeLang('en')).toBe('en');
  });

  it('maps language + gender to the clip folder', () => {
    expect(narratorVoice('en', 'george')).toBe('george');
    expect(narratorVoice('en', 'heart')).toBe('heart');
    expect(narratorVoice('ta', 'george')).toBe('ta_rasa');
    expect(narratorVoice('ta', 'heart')).toBe('ta_jaya');
    expect(narratorVoice(undefined, undefined)).toBe('ta_rasa');
  });

  it('lists a male and a female voice per language', () => {
    expect(voicesFor('ta').map((v) => [v.id, v.gender])).toEqual([['ta_rasa', 'george'], ['ta_jaya', 'heart']]);
    expect(voicesFor('en').map((v) => [v.id, v.gender])).toEqual([['george', 'george'], ['heart', 'heart']]);
  });

  it('captions and clip urls follow the voice', () => {
    expect(linesFor('ta_jaya')).toBe(LINES_TA);
    expect(linesFor('ta_rasa')).toBe(LINES_TA);
    expect(linesFor('george')).toBe(LINES);
    expect(clipUrl('ta_jaya', 'killed_pre')).toBe('/audio/ta_jaya/killed_pre.mp3');
    expect(clipUrl('heart', 'vote')).toBe('/audio/heart/vote.mp3');
  });

  it('names: Kokoro for English, Piper Tamil Rasa (matching gender) for Tamil', () => {
    expect(nameEngine('george')).toEqual({ engine: 'kokoro', voice: KOKORO_VOICES.george });
    expect(nameEngine('heart').voice).toBe('af_heart');
    expect(nameEngine('ta_rasa')).toMatchObject({ engine: 'piper', voice: 'rasa_male' });
    expect(nameEngine('ta_jaya')).toMatchObject({ engine: 'piper', voice: 'rasa_female' });
    expect(nameEngine('ta_jaya').model).toMatch(/tinisoft\/piper-ta_IN-rasa_female-medium\/.*\.onnx$/);
    expect(Object.keys(PIPER_VOICES).every((v) => VOICES[v]?.lang === 'ta')).toBe(true);
    expect(nameEngine('nope')).toBeNull();
  });

  it('name text: Tamil script + trailing full stop for Piper, as typed for Kokoro', () => {
    expect(nameText('ta_rasa', 'Karthik')).toBe('கார்த்திக்.');
    expect(nameText('ta_jaya', ' திவ்யா ')).toBe('திவ்யா.');
    expect(nameText('george', 'Karthik')).toBe('Karthik.');
  });
});

describe('the Detective catch is voice-only (ADR 0013)', () => {
  const morning = ['morning', 'killed_pre', { name: 'Bob' }, 'killed_post', 'detective_found', { name: 'Alice' }, 'voted_out_post'];

  it('captionedItems drops everything from detective_found on', () => {
    expect(captionedItems(morning)).toEqual(['morning', 'killed_pre', { name: 'Bob' }, 'killed_post']);
    expect(captionedItems(['morning', 'saved'])).toEqual(['morning', 'saved']);
    expect(captionedItems(['morning', 'saved', 'detective_found'])).toEqual(['morning', 'saved']);
  });

  it('the narrator speaks the catch but the caption keeps the previous line', async () => {
    const seen = [];
    const off = narrator.subscribe((t) => seen.push(t));
    narrator.setVoice('george');
    await narrator.say(morning);
    off();
    expect(narrator.caption).toBe(`${LINES.killed_pre} Bob ${LINES.killed_post}`);
    expect(seen.some((t) => t.includes('Alice') || t.includes(LINES.detective_found) || t.includes(LINES.voted_out_post))).toBe(false);
  }, 10000);
});
