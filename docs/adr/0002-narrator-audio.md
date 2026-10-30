# 2. Pre-rendered narrator clips plus live name synthesis

- Status: Accepted
- Date: 2026-10-23 (English, `3036e23`, `a28de6b`); Tamil added 2026-10-25 (`8d87038`, `b538ef0`)

## Context

In narrator mode the app is the game master and must speak. Fixed lines ("Mafia, wake up") are the same
every game; player names change every game. Browser `speechSynthesis` quality and Tamil support vary a lot
by device, and the game must never stall waiting for audio.

## Decision

- Fixed lines are pre-rendered MP3 clips in `public/audio/<voice>/` (mono, 80 kbps, 24 kHz, -16 LUFS):
  - English: Kokoro-82M voices `bm_george` (George) and `af_heart` (Heart).
  - Tamil (default language): Piper Tamil Rasa (male) and AI4Bharat Indic Parler-TTS `jaya` (female).
    Each Tamil take was checked with IndicConformer ASR and re-rendered when the character error rate was
    above 0.15 (best of up to 5 takes).
- Player names are synthesised live in the browser, in a Web Worker:
  - English: kokoro-js (Kokoro-82M ONNX, q8, wasm), same voice as the clips.
  - Tamil: Piper Tamil Rasa VITS ONNX (63 MB, fetched from Hugging Face only when a Tamil game needs names,
    then kept in the Cache API). Phonemes come from vendored `piper_phonemize` WASM with Tamil-only
    espeak-ng data (0.9 MB). Latin names are transliterated to Tamil script first.
- Fallbacks: name clip not ready -> `speechSynthesis`; no voices -> "Look at the screen" lines.
  `?tts=off` and `?tts=none` force the fallbacks (used by tests).

## Consequences

- Consistent, good-sounding narration with no server cost; works offline after first load (except the
  first Tamil name model download).
- Licences:
  - Piper Tamil Rasa voices are CC-BY-4.0: the app must credit AI4Bharat Rasa and tinisoft. Done: since
    2026-10-30 the home screen has a *Credits & licences* panel (`src/components/Credits.jsx`, data in
    `src/credits.js`) crediting the Rasa voices, Indic Parler-TTS, Kokoro-82M, piper-phonemize / espeak-ng
    and the Rajdhani font with their licences; the same list is in `THIRD_PARTY_NOTICES.md`.
  - The vendored phonemizer bundles espeak-ng, which is GPL-3.0. This only matters if the app is ever
    distributed in a store or as closed source (then replace it, or comply with GPL-3.0); the app is a
    prototype today.
- New lines need clips rendered for all 4 voices; `src/audio/clips.test.js` checks parity.

## Alternatives considered

- `speechSynthesis` only: free and small, but voice quality and Tamil availability depend on the device.
- Cloud TTS API at play time: per-use cost, needs a network and a key on a server.
