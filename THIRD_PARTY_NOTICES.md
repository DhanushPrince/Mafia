# Third-party notices

Mafia Dealer itself is MIT licensed, Copyright (c) 2026 Dhanush R (see [LICENSE](LICENSE)).
It ships or downloads the third-party voices, models and assets below. The same list is shown to players in
the app: home screen > **Credits & licences** (`src/components/Credits.jsx`, data in `src/credits.js`).
Licences were checked against the model and repository pages on 2026-10-30.

## Voices and speech models

| Component | Used for | Author | Licence | Source |
|-----------|----------|--------|---------|--------|
| Piper Tamil Rasa voices (`ta_IN-rasa_male-medium`, `ta_IN-rasa_female-medium`) | Tamil Rasa narration clips (`public/audio/ta_rasa/`) and live Tamil player names (downloaded from Hugging Face at play time) | tinisoft, trained on the AI4Bharat Rasa dataset | [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) | [male](https://huggingface.co/tinisoft/piper-ta_IN-rasa_male-medium), [female](https://huggingface.co/tinisoft/piper-ta_IN-rasa_female-medium), [Rasa dataset](https://huggingface.co/datasets/ai4bharat/Rasa) (CC-BY-4.0) |
| Indic Parler-TTS (`jaya` speaker) | Tamil female (Jaya) narration clips (`public/audio/ta_jaya/`) | AI4Bharat | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) | [ai4bharat/indic-parler-tts](https://huggingface.co/ai4bharat/indic-parler-tts) |
| Kokoro-82M (`bm_george`, `af_heart`) | English narration clips (`public/audio/george/`, `public/audio/heart/`) and live English player names via [onnx-community/Kokoro-82M-v1.0-ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) | hexgrad | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) | [hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M), [kokoro-js](https://github.com/hexgrad/kokoro) |

Rasa attribution, as asked by the model card: Praveen Srinivasa Varadhan, Ashwin Sankar, Giri Raju, Mitesh M.
Khapra, *Rasa: Building Expressive Speech Synthesis Systems for Indian Languages in Low-resource Settings*,
Proc. INTERSPEECH 2024 ([arXiv 2407.14056](https://arxiv.org/abs/2407.14056)).

## Tamil phonemizer (GPL-3.0)

`public/tts/piper_phonemize.wasm`, `public/tts/piper_phonemize_ta.data` and `src/audio/vendor/piper_phonemize_ta.mjs`
are piper-phonemize compiled to WebAssembly together with espeak-ng and its Tamil data only.

- piper-phonemize: MIT, Copyright (c) 2023 Michael Hansen. Source: https://github.com/rhasspy/piper-phonemize
- espeak-ng: GPL-3.0-or-later. Source: https://github.com/espeak-ng/espeak-ng

Because espeak-ng is GPL-3.0, these combined phonemizer files are distributed under
[GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.html); their source is at the two links above. The rest of the
app runs them as a separate WebAssembly module and stays MIT (see ADR 0002 for when this would need a review).

## Fonts and images

| Component | Licence | Notes |
|-----------|---------|-------|
| Rajdhani, Indian Type Foundry | [SIL OFL 1.1](https://openfontlicense.org/) | Loaded from Google Fonts (`src/index.css`), not bundled. |
| `public/noise.svg`, `public/favicon.svg` | MIT (this project) | Made for this project (procedural SVG noise filter). |

Night ambience (`src/audio/ambient.js`) is generated live with Web Audio oscillators: no music or sound files.

## npm runtime dependencies

Bundled into the app or Worker; licence texts are in each package under `node_modules/`.

| Package | Licence |
|---------|---------|
| react, react-dom | MIT |
| framer-motion | MIT |
| lucide-react | ISC |
| kokoro-js | Apache-2.0 |
| onnxruntime-web | MIT |
| partyserver | ISC |
| partysocket | MIT |
| better-auth | MIT |
| clsx, tailwind-merge, uqr | MIT |
