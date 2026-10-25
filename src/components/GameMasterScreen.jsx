import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Crown, Skull, Users } from 'lucide-react';
import { getWinner } from '../game/roles';
import { ROLES } from '../game/roleVisuals';
import { LiquidButton } from './ui';

function GameMasterScreen({ players, eliminated, onToggle, onBack, onRestart }) {
  const { mafiaAlive, othersAlive, winner } = getWinner(players, eliminated);

  return (
    <div className="min-h-screen flex flex-col items-center p-4 pt-6 sm:p-8 relative z-10">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md hover:bg-white/10 transition-colors text-violet-200 text-sm"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <span className="flex items-center gap-2 text-violet-300/60 font-mono tracking-widest text-xs uppercase">
            <Crown size={14} /> Game Master
          </span>
        </div>

        <motion.h2
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-violet-200 via-white to-violet-200 drop-shadow-[0_0_15px_rgba(139,92,246,0.5)] mb-2"
        >
          Moderator View
        </motion.h2>
        <p className="text-center text-violet-300/60 text-sm mb-6">Tap a player to mark them eliminated.</p>

        {/* Live counts */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 backdrop-blur-md p-4 text-center">
            <div className="flex items-center justify-center gap-2 text-red-400 text-xs font-mono tracking-widest uppercase">
              <Skull size={14} /> Mafia alive
            </div>
            <div data-testid="mafia-alive" className="text-4xl font-bold text-red-400 font-mono mt-1">{mafiaAlive}</div>
          </div>
          <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 backdrop-blur-md p-4 text-center">
            <div className="flex items-center justify-center gap-2 text-cyan-400 text-xs font-mono tracking-widest uppercase">
              <Users size={14} /> Others alive
            </div>
            <div data-testid="others-alive" className="text-4xl font-bold text-cyan-400 font-mono mt-1">{othersAlive}</div>
          </div>
        </div>

        {/* Win banner */}
        <AnimatePresence>
          {winner && (
            <motion.div
              key={winner}
              role="status"
              initial={{ opacity: 0, scale: 0.9, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={`mb-4 rounded-2xl border p-4 text-center backdrop-blur-md ${
                winner === 'villagers'
                  ? 'border-cyan-400/50 bg-cyan-400/15 shadow-[0_0_30px_rgba(34,211,238,0.4)]'
                  : 'border-red-500/50 bg-red-500/15 shadow-[0_0_30px_rgba(239,68,68,0.4)]'
              }`}
            >
              <div className="text-3xl mb-1">{winner === 'villagers' ? '🎉' : '😈'}</div>
              <div className={`text-2xl font-bold uppercase tracking-widest ${winner === 'villagers' ? 'text-cyan-300' : 'text-red-400'}`}>
                {winner === 'villagers' ? 'Villagers win' : 'Mafia win'}
              </div>
              <div className="text-xs text-white/60 mt-1">
                {winner === 'villagers'
                  ? 'Every Mafia member has been eliminated.'
                  : 'The Mafia now equal or outnumber everyone else.'}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Player list */}
        <ul className="flex flex-col gap-2 mb-8">
          {players.map((p) => {
            const role = ROLES[p.role];
            const out = eliminated.includes(p.name);
            const Icon = role.icon;
            return (
              <li key={p.name}>
                <motion.button
                  type="button"
                  layout
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onToggle(p.name)}
                  aria-pressed={out}
                  aria-label={`${p.name}, ${role.name}${out ? ', eliminated' : ''}`}
                  className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 backdrop-blur-md transition-colors text-left ${
                    out ? 'border-white/5 bg-black/40 opacity-50' : `${role.border} bg-white/5 hover:bg-white/10`
                  }`}
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${role.bg}`}>
                    <Icon className={`h-5 w-5 ${role.color}`} />
                  </span>
                  <span className={`flex-1 min-w-0 break-words [overflow-wrap:anywhere] text-left text-lg font-semibold ${out ? 'line-through text-white/50' : 'text-white'}`}>
                    {p.name}
                  </span>
                  <span className={`text-sm font-bold uppercase tracking-widest ${role.color} ${out ? 'line-through' : ''}`}>
                    {role.name}
                  </span>
                </motion.button>
              </li>
            );
          })}
        </ul>

        <div className="flex justify-center pb-8">
          <LiquidButton onClick={onRestart}>Start New Game</LiquidButton>
        </div>
      </div>
    </div>
  );
}

export default GameMasterScreen;
