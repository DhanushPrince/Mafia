// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import Credits from './Credits';
import PlayerCountScreen from './PlayerCountScreen';

vi.mock('../audio/narrator', () => ({
  narrator: { voice: 'ta_rasa', say: vi.fn(async () => {}), stop: vi.fn(), subscribe: vi.fn(() => () => {}) },
  LANGS: [{ id: 'ta', label: 'தமிழ்' }, { id: 'en', label: 'English' }],
  normalizeLang: (l) => l || 'ta',
  narratorVoice: () => 'ta_rasa',
  voicesFor: () => [],
}));

afterEach(cleanup);

const open = () => {
  fireEvent.click(screen.getByTestId('credits-link'));
  return screen.getByRole('dialog', { name: /credits/i });
};

describe('Credits', () => {
  it('opens a dialog crediting every required voice, model and tool with its licence', () => {
    render(<Credits />);
    expect(screen.queryByRole('dialog')).toBeNull();
    const d = open();
    const text = d.textContent;
    for (const s of ['tinisoft', 'AI4Bharat Rasa', 'CC-BY-4.0', 'Indic Parler-TTS', 'Kokoro-82M', 'hexgrad', 'Apache-2.0', 'piper-phonemize', 'espeak-ng', 'GPL-3.0', 'Rajdhani', 'Dhanush R', 'MIT']) {
      expect(text).toContain(s);
    }
    const hrefs = [...d.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining([
      'https://creativecommons.org/licenses/by/4.0/',
      'https://huggingface.co/tinisoft/piper-ta_IN-rasa_male-medium',
      'https://huggingface.co/tinisoft/piper-ta_IN-rasa_female-medium',
      'https://huggingface.co/ai4bharat/indic-parler-tts',
      'https://huggingface.co/hexgrad/Kokoro-82M',
      'https://github.com/rhasspy/piper-phonemize',
      'https://github.com/espeak-ng/espeak-ng',
    ]));
    for (const a of d.querySelectorAll('a')) expect(a.getAttribute('rel')).toContain('noopener');
    expect(within(screen.getByTestId('credit-piper-rasa')).getByText('CC-BY-4.0')).toBeTruthy();
    expect(within(screen.getByTestId('credit-phonemizer')).getByText('GPL-3.0')).toBeTruthy();
  });

  it('closes with the close button, Escape, and a backdrop click', () => {
    render(<Credits />);
    open();
    fireEvent.click(screen.getByRole('button', { name: /close credits/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
    open();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    const d = open();
    fireEvent.click(d); // clicks inside the panel keep it open
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(d.parentElement);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is reachable from the home screen', () => {
    render(<PlayerCountScreen onStart={() => {}} onRules={() => {}} />);
    expect(open().textContent).toContain('Piper Tamil Rasa');
  });
});
