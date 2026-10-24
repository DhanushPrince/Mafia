import { describe, it, expect } from 'vitest';
import { generateDeck, mafiaCountFor, getWinner, MIN_PLAYERS, MAX_PLAYERS } from './roles';

// README "Role Assignment": 4-6 -> 1 Mafia, 7-9 -> 2, 10-20 -> 3; always 1 Doctor + 1 Detective; rest Villagers.
const readmeMafia = (n) => (n <= 6 ? 1 : n <= 9 ? 2 : 3);

describe('player count limits', () => {
  it('min 4, max 20', () => {
    expect(MIN_PLAYERS).toBe(4);
    expect(MAX_PLAYERS).toBe(20);
  });
});

describe('generateDeck for every supported player count', () => {
  for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
    it(`${n} players`, () => {
      expect(mafiaCountFor(n)).toBe(readmeMafia(n));
      for (let rep = 0; rep < 20; rep++) {
        const deck = generateDeck(n);
        expect(deck).toHaveLength(n);
        const c = deck.reduce((a, r) => ({ ...a, [r]: (a[r] || 0) + 1 }), {});
        expect(c).toEqual({ mafia: readmeMafia(n), doctor: 1, detective: 1, villager: n - readmeMafia(n) - 2 });
      }
    });
  }
});

describe('getWinner with several Mafia', () => {
  const players = [
    ...['M1', 'M2', 'M3'].map((name) => ({ name, role: 'mafia' })),
    { name: 'Doc', role: 'doctor' }, { name: 'Det', role: 'detective' },
    ...['V1', 'V2', 'V3', 'V4', 'V5'].map((name) => ({ name, role: 'villager' })),
  ];
  it('no winner while Mafia are outnumbered', () => {
    expect(getWinner(players, ['V1', 'V2', 'V3'])).toEqual({ mafiaAlive: 3, othersAlive: 4, winner: null });
  });
  it('Mafia win at parity', () => {
    expect(getWinner(players, ['V1', 'V2', 'V3', 'V4']).winner).toBe('mafia');
  });
  it('Villagers win only when every Mafia is out', () => {
    expect(getWinner(players, ['M1', 'M2']).winner).toBe(null);
    expect(getWinner(players, ['M1', 'M2', 'M3']).winner).toBe('villagers');
  });
});
