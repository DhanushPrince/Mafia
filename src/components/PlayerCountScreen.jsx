import { useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Users } from 'lucide-react';
import Rules from './Rules';

function PlayerCountScreen({ onStart }) {
  const [playerCount, setPlayerCount] = useState('');
  const [showRules, setShowRules] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    const count = parseInt(playerCount);
    if (count >= 3 && count <= 20) {
      onStart(count);
    } else {
      alert('Please enter a valid number of players (3-20)');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative z-10">
      <motion.button
        className="absolute top-8 right-8 flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md hover:bg-white/10 transition-colors text-violet-200"
        onClick={() => setShowRules(!showRules)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <BookOpen size={18} />
        <span className="text-sm font-medium tracking-wide">Rules</span>
      </motion.button>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <h1 className="text-5xl font-bold text-center mb-12 text-transparent bg-clip-text bg-gradient-to-b from-white to-white/50 drop-shadow-[0_0_25px_rgba(255,255,255,0.3)] tracking-tighter">
          MAFIA DEALER
        </h1>

        {/* Floating HUD Modal */}
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-1000"></div>
          <div className="relative bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-violet-200/80 text-sm font-mono tracking-widest uppercase flex items-center gap-2">
                  <Users size={16} />
                  Player Count
                </label>
                <input
                  type="number"
                  min="3"
                  max="20"
                  placeholder="3-20"
                  value={playerCount}
                  onChange={(e) => setPlayerCount(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-violet-500/50 focus:bg-white/10 transition-all font-mono text-lg text-center"
                  autoFocus
                />
              </div>

              <motion.button
                type="submit"
                className="relative w-full py-4 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-lg font-bold text-white tracking-widest uppercase overflow-hidden"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full hover:translate-y-0 transition-transform duration-300" />
                <span className="relative z-10">Initialize Game</span>
              </motion.button>
            </form>
          </div>
        </div>
      </motion.div>

      {showRules && <Rules onClose={() => setShowRules(false)} />}
    </div>
  );
}

export default PlayerCountScreen;
