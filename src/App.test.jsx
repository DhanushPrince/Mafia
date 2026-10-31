// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import App from './App';

vi.mock('./audio/narrator', async (importOriginal) => ({
  ...(await importOriginal()),
  narrator: {
    voice: 'george',
    subscribe: vi.fn(() => () => {}),
    say: vi.fn(async () => {}),
    stop: vi.fn(),
    unlock: vi.fn(),
    preload: vi.fn(),
    setVoice: vi.fn(),
    setMuted: vi.fn(),
    setRate: vi.fn(),
  },
}));
vi.mock('./audio/nameVoice', () => ({ nameVoice: { get: vi.fn(() => null), prepare: vi.fn() }, canSpeakName: vi.fn(() => false) }));
vi.mock('./audio/ambient', () => ({ startAmbient: vi.fn(), stopAmbient: vi.fn(), unlockAmbient: vi.fn() }));
vi.mock('./hooks/useWakeLock', () => ({ default: vi.fn() }));
vi.mock('./online/OnlineApp', () => ({ default: () => null }));

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const count = () => screen.getByTestId('player-count').textContent;

describe('App rules overlay', () => {
  it('opens the rules over the home screen and keeps the chosen player count after closing', () => {
    render(<App />);
    expect(count()).toBe('6');
    fireEvent.click(screen.getByLabelText('Decrease player count'));
    fireEvent.click(screen.getByLabelText('Decrease player count'));
    expect(count()).toBe('4');

    fireEvent.click(screen.getByTestId('rules-button'));
    expect(screen.getByRole('button', { name: 'Close rules' })).toBeTruthy();
    expect(screen.getAllByText('GAME OVERVIEW').length).toBeGreaterThan(0);
    // the home screen stays mounted underneath, so its local state survives
    expect(count()).toBe('4');

    fireEvent.click(screen.getByRole('button', { name: 'Close rules' }));
    expect(screen.queryByRole('button', { name: 'Close rules' })).toBeNull();
    expect(count()).toBe('4');

    fireEvent.click(screen.getByTestId('rules-button'));
    fireEvent.click(screen.getByRole('button', { name: /GOT IT/ }));
    expect(screen.queryByRole('button', { name: 'Close rules' })).toBeNull();
    expect(count()).toBe('4');
  });
});
