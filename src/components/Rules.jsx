import React from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

function Rules({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto bg-gray-900/90 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between px-8 py-6 border-b bg-gray-900/95 border-white/10 backdrop-blur-xl">
          <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
            🎮 How to Play Mafia
          </h2>
          <button
            onClick={onClose}
            className="p-2 transition-colors rounded-full hover:bg-white/10 text-white/70 hover:text-white"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-8 space-y-10">
          {/* Role Distribution */}
          <section>
            <h3 className="flex items-center gap-3 mb-6 text-2xl font-bold text-purple-300">
              <span className="text-3xl">📋</span> Role Distribution
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { count: '5 Players', setup: '1 Mafia, 1 Doctor, 1 Detective, 2 Villagers' },
                { count: '6 Players', setup: '1 Mafia, 1 Doctor, 1 Detective, 3 Villagers' },
                { count: '7 Players', setup: '2 Mafia, 1 Doctor, 1 Detective, 3 Villagers' },
                { count: '8+ Players', setup: 'More Mafia and Villagers added' },
              ].map((item, idx) => (
                <div key={idx} className="p-4 transition-colors border rounded-xl bg-white/5 border-white/10 hover:bg-white/10">
                  <div className="mb-1 text-lg font-bold text-white">{item.count}</div>
                  <div className="text-sm text-gray-300">{item.setup}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Roles Explained */}
          <section>
            <h3 className="flex items-center gap-3 mb-6 text-2xl font-bold text-purple-300">
              <span className="text-3xl">🎭</span> Roles Explained
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="p-4 border rounded-xl bg-red-500/10 border-red-500/20">
                <div className="flex items-center gap-2 mb-2 text-lg font-bold text-red-400">
                  <span>🔪</span> Mafia
                </div>
                <p className="text-sm text-gray-300">Eliminate villagers at night without getting caught.</p>
              </div>
              <div className="p-4 border rounded-xl bg-blue-500/10 border-blue-500/20">
                <div className="flex items-center gap-2 mb-2 text-lg font-bold text-blue-400">
                  <span>💉</span> Doctor
                </div>
                <p className="text-sm text-gray-300">Save one person from elimination each night.</p>
              </div>
              <div className="p-4 border rounded-xl bg-yellow-500/10 border-yellow-500/20">
                <div className="flex items-center gap-2 mb-2 text-lg font-bold text-yellow-400">
                  <span>🕵️‍♂️</span> Detective
                </div>
                <p className="text-sm text-gray-300">Investigate one player nightly to find the Mafia.</p>
              </div>
              <div className="p-4 border rounded-xl bg-green-500/10 border-green-500/20">
                <div className="flex items-center gap-2 mb-2 text-lg font-bold text-green-400">
                  <span>🧑‍🌾</span> Villager
                </div>
                <p className="text-sm text-gray-300">Discuss, deduce, and vote out the Mafia during the day.</p>
              </div>
            </div>
          </section>

          {/* Game Phases */}
          <div className="grid gap-8 lg:grid-cols-2">
            {/* Night Phase */}
            <section className="p-6 border rounded-2xl bg-indigo-950/30 border-indigo-500/20">
              <h3 className="flex items-center gap-3 mb-4 text-xl font-bold text-indigo-300">
                <span className="text-2xl">🌙</span> Night Phase
              </h3>
              <ol className="space-y-4">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 text-xs font-bold text-black bg-indigo-400 rounded-full">1</span>
                  <p className="text-sm text-gray-300"><strong className="text-white">Mafia wakes:</strong> Silently choose a victim. 🤫</p>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 text-xs font-bold text-black bg-indigo-400 rounded-full">2</span>
                  <p className="text-sm text-gray-300"><strong className="text-white">Doctor wakes:</strong> Choose someone to save. 🚑</p>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 text-xs font-bold text-black bg-indigo-400 rounded-full">3</span>
                  <p className="text-sm text-gray-300"><strong className="text-white">Detective wakes:</strong> Investigate a suspect. 🔍</p>
                </li>
              </ol>
            </section>

            {/* Day Phase */}
            <section className="p-6 border rounded-2xl bg-amber-950/30 border-amber-500/20">
              <h3 className="flex items-center gap-3 mb-4 text-xl font-bold text-amber-300">
                <span className="text-2xl">☀️</span> Day Phase
              </h3>
              <ol className="space-y-4">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 text-xs font-bold text-black bg-amber-400 rounded-full">1</span>
                  <p className="text-sm text-gray-300">Announce Detective's findings. 📢</p>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 text-xs font-bold text-black bg-amber-400 rounded-full">2</span>
                  <p className="text-sm text-gray-300">Reveal night's victim (if any). ☠️</p>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 text-xs font-bold text-black bg-amber-400 rounded-full">3</span>
                  <p className="text-sm text-gray-300">Discuss and vote to eliminate. 🗣️</p>
                </li>
              </ol>
            </section>
          </div>

          {/* Winning Conditions */}
          <section>
            <h3 className="flex items-center gap-3 mb-6 text-2xl font-bold text-purple-300">
              <span className="text-3xl">🏆</span> Winning Conditions
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="p-5 text-center border rounded-xl bg-cyan-500/10 border-cyan-500/20">
                <div className="mb-2 text-4xl">🎉</div>
                <h4 className="mb-1 text-lg font-bold text-cyan-400">Villagers Win</h4>
                <p className="text-sm text-gray-400">Eliminate all Mafia members.</p>
              </div>
              <div className="p-5 text-center border rounded-xl bg-red-500/10 border-red-500/20">
                <div className="mb-2 text-4xl">😈</div>
                <h4 className="mb-1 text-lg font-bold text-red-400">Mafia Wins</h4>
                <p className="text-sm text-gray-400">Outnumber the Villagers.</p>
              </div>
            </div>
          </section>
        </div>
      </motion.div>
    </div>
  );
}

export default Rules;
