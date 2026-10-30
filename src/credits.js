/**
 * Third-party voices, models and assets shown in the in-app Credits (src/components/Credits.jsx) and listed
 * in THIRD_PARTY_NOTICES.md. Licences checked against the model / repo pages on 2026-10-30.
 */
export const CC_BY_4 = 'https://creativecommons.org/licenses/by/4.0/';
export const APACHE_2 = 'https://www.apache.org/licenses/LICENSE-2.0';
export const GPL_3 = 'https://www.gnu.org/licenses/gpl-3.0.html';
export const OFL_1_1 = 'https://openfontlicense.org/';

export const CREDITS = [
  {
    id: 'piper-rasa',
    title: 'Tamil voices: Piper Tamil Rasa',
    text: 'Piper Tamil Rasa voices (male and female) by tinisoft, trained on the AI4Bharat Rasa dataset. Used for the Tamil Rasa narration and for speaking player names in Tamil games.',
    license: 'CC-BY-4.0',
    licenseUrl: CC_BY_4,
    links: [
      { label: 'rasa_male model', url: 'https://huggingface.co/tinisoft/piper-ta_IN-rasa_male-medium' },
      { label: 'rasa_female model', url: 'https://huggingface.co/tinisoft/piper-ta_IN-rasa_female-medium' },
      { label: 'AI4Bharat Rasa dataset', url: 'https://huggingface.co/datasets/ai4bharat/Rasa' },
    ],
  },
  {
    id: 'indic-parler',
    title: 'Tamil female narration: Indic Parler-TTS',
    text: 'The Tamil Jaya narration was recorded with AI4Bharat Indic Parler-TTS.',
    license: 'Apache-2.0',
    licenseUrl: APACHE_2,
    links: [{ label: 'ai4bharat/indic-parler-tts', url: 'https://huggingface.co/ai4bharat/indic-parler-tts' }],
  },
  {
    id: 'kokoro',
    title: 'English narration: Kokoro-82M',
    text: 'English narration (George and Heart voices) and English player names use Kokoro-82M by hexgrad, run in the browser with kokoro-js.',
    license: 'Apache-2.0',
    licenseUrl: APACHE_2,
    links: [
      { label: 'hexgrad/Kokoro-82M', url: 'https://huggingface.co/hexgrad/Kokoro-82M' },
      { label: 'kokoro-js', url: 'https://github.com/hexgrad/kokoro' },
    ],
  },
  {
    id: 'phonemizer',
    title: 'Tamil phonemizer: piper-phonemize and espeak-ng',
    text: 'Tamil names are turned into phonemes by piper-phonemize (MIT) compiled to WebAssembly together with espeak-ng and its Tamil data (GPL-3.0). The combined phonemizer files are covered by GPL-3.0; their source code is at the links below.',
    license: 'GPL-3.0',
    licenseUrl: GPL_3,
    links: [
      { label: 'piper-phonemize source', url: 'https://github.com/rhasspy/piper-phonemize' },
      { label: 'espeak-ng source', url: 'https://github.com/espeak-ng/espeak-ng' },
    ],
  },
  {
    id: 'rajdhani',
    title: 'Font: Rajdhani',
    text: 'Rajdhani by Indian Type Foundry, served by Google Fonts.',
    license: 'OFL-1.1',
    licenseUrl: OFL_1_1,
    links: [{ label: 'Rajdhani on Google Fonts', url: 'https://fonts.google.com/specimen/Rajdhani' }],
  },
];
