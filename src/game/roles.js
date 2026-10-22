import { Skull, User, HeartPulse, Search } from 'lucide-react';

// Single source of truth for role visuals (used by Card and the Game Master view).
export const ROLES = {
  mafia: { name: 'Mafia', icon: Skull, color: 'text-red-500', glow: 'shadow-[0_0_30px_rgba(239,68,68,0.6)]', bg: 'bg-red-500/20', border: 'border-red-500/40' },
  villager: { name: 'Villager', icon: User, color: 'text-cyan-400', glow: 'shadow-[0_0_30px_rgba(34,211,238,0.6)]', bg: 'bg-cyan-400/20', border: 'border-cyan-400/40' },
  doctor: { name: 'Doctor', icon: HeartPulse, color: 'text-teal-400', glow: 'shadow-[0_0_30px_rgba(45,212,191,0.6)]', bg: 'bg-teal-400/20', border: 'border-teal-400/40' },
  detective: { name: 'Detective', icon: Search, color: 'text-amber-400', glow: 'shadow-[0_0_30px_rgba(251,191,36,0.6)]', bg: 'bg-amber-400/20', border: 'border-amber-400/40' },
};

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 20;

export function mafiaCountFor(playerCount) {
  if (playerCount <= 6) return 1;
  if (playerCount <= 9) return 2;
  return 3;
}

export function shuffle(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function generateDeck(playerCount) {
  const roles = [];
  const mafiaCount = mafiaCountFor(playerCount);
  for (let i = 0; i < mafiaCount; i++) roles.push('mafia');
  if (playerCount >= 4) {
    roles.push('doctor');
    roles.push('detective');
  }
  while (roles.length < playerCount) roles.push('villager');
  return shuffle(roles);
}

/**
 * Win check for the Game Master view.
 * Villagers win when every Mafia is eliminated; Mafia win when alive Mafia >= alive non-Mafia.
 */
export function getWinner(players, eliminated) {
  const alive = players.filter((p) => !eliminated.includes(p.name));
  const mafiaAlive = alive.filter((p) => p.role === 'mafia').length;
  const othersAlive = alive.length - mafiaAlive;
  let winner = null;
  if (mafiaAlive === 0) winner = 'villagers';
  else if (mafiaAlive >= othersAlive) winner = 'mafia';
  return { mafiaAlive, othersAlive, winner };
}
