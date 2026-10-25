import { Skull, User, HeartPulse, Search } from 'lucide-react';

// Single source of truth for role visuals (used by Card, the Game Master view and online mode).
// Kept apart from roles.js so the server bundle never pulls in React icons.
export const ROLES = {
  mafia: { name: 'Mafia', icon: Skull, color: 'text-red-500', glow: 'shadow-[0_0_30px_rgba(239,68,68,0.6)]', bg: 'bg-red-500/20', border: 'border-red-500/40' },
  villager: { name: 'Villager', icon: User, color: 'text-cyan-400', glow: 'shadow-[0_0_30px_rgba(34,211,238,0.6)]', bg: 'bg-cyan-400/20', border: 'border-cyan-400/40' },
  doctor: { name: 'Doctor', icon: HeartPulse, color: 'text-teal-400', glow: 'shadow-[0_0_30px_rgba(45,212,191,0.6)]', bg: 'bg-teal-400/20', border: 'border-teal-400/40' },
  detective: { name: 'Detective', icon: Search, color: 'text-amber-400', glow: 'shadow-[0_0_30px_rgba(251,191,36,0.6)]', bg: 'bg-amber-400/20', border: 'border-amber-400/40' },
};

