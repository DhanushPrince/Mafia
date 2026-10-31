// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import PlayerCountScreen from './PlayerCountScreen';
import { narrator, narratorVoice } from '../audio/narrator';

vi.mock('../audio/narrator', async (importOriginal) => ({
  ...(await importOriginal()),
  narrator: { voice: 'george', unlock: vi.fn(), stop: vi.fn(), setVoice: vi.fn(), say: vi.fn(async () => {}), subscribe: vi.fn(() => () => {}) },
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const settings = { mode: 'narrator', lang: 'en', voice: 'george', ambient: true, noRepeatSave: true, turnSec: 15, discussMin: 3 };

describe('PlayerCountScreen (App is Game Master)', () => {
  it('previews the other narrator voice without changing the saved choice', () => {
    const onSettings = vi.fn();
    render(<PlayerCountScreen onStart={() => {}} onRules={() => {}} settings={settings} onSettings={onSettings} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview Heart voice' }));
    expect(narrator.unlock).toHaveBeenCalled();
    expect(narrator.stop).toHaveBeenCalled();
    expect(narrator.setVoice).toHaveBeenCalledWith(narratorVoice('en', 'heart'));
    expect(narrator.say).toHaveBeenCalledWith('night_start');
    expect(onSettings).not.toHaveBeenCalled();
  });
});
