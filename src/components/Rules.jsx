import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, ChevronRight, Users, Shield, Moon, Sun, Trophy, Lightbulb } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'overview', num: 1, title: 'GAME OVERVIEW', desc: 'Learn the basics of the game.', color: 'text-blue-400', bg: 'bg-blue-500', emoji: '👥' },
  { id: 'mafia', num: 2, title: 'MAFIA', desc: 'Eliminate villagers at night without getting caught.', color: 'text-red-400', bg: 'bg-red-500', emoji: '🔪' },
  { id: 'detective', num: 3, title: 'DETECTIVE', desc: 'Investigate one player each night to find the Mafia.', color: 'text-yellow-400', bg: 'bg-yellow-500', emoji: '🕵️' },
  { id: 'doctor', num: 4, title: 'DOCTOR', desc: 'Save one player from elimination each night.', color: 'text-blue-400', bg: 'bg-blue-500', emoji: '💉' },
  { id: 'villager', num: 5, title: 'VILLAGER', desc: 'Discuss, deduce and vote out the Mafia during the day.', color: 'text-green-400', bg: 'bg-green-500', emoji: '🧑‍🌾' },
  { id: 'win', num: 6, title: 'HOW TO WIN', desc: 'Complete goals and win the game.', color: 'text-purple-400', bg: 'bg-purple-500', emoji: '🏆' },
];

const STEPPER = [
  { icon: Users, label: 'Players', desc: 'Choose players', color: 'text-blue-400' },
  { icon: Shield, label: 'Roles', desc: 'Roles are assigned', color: 'text-green-400' },
  { icon: Moon, label: 'Night', desc: 'Mafia wakes up', color: 'text-indigo-400' },
  { icon: Sun, label: 'Day', desc: 'Discuss & vote', color: 'text-amber-400' },
  { icon: Trophy, label: 'Win', desc: 'Complete goals', color: 'text-yellow-400' },
];

const TUTORIAL_STEPS = [
  { num: 1, title: 'PLAYERS', desc: 'Choose number of players', emoji: '👥', sub: ['5', '6', '7', '8+'] },
  { num: 2, title: 'ROLES ASSIGNED', desc: 'Roles are hidden and assigned randomly', emoji: '🎭' },
  { num: 3, title: 'NIGHT FALLS', desc: 'The village sleeps... Mafia wakes up', emoji: '🌙' },
  { num: 4, title: 'ACTIONS', desc: 'Each role performs their special action', emoji: '⚡' },
  { num: 5, title: 'DAY BREAKS', desc: 'Discuss, share info and find the Mafia', emoji: '☀️' },
];

const GAME_FLOW = [
  { title: 'Players Join', desc: 'Choose number of players (5 - 20).', color: 'text-blue-400', emoji: '👥' },
  { title: 'Roles Assigned', desc: 'Roles are hidden and assigned randomly.', color: 'text-green-400', emoji: '🎭' },
  { title: 'Night Phase', desc: 'Mafia wakes up and eliminates. Others perform their actions.', color: 'text-indigo-400', emoji: '🌙' },
  { title: 'Day Phase', desc: 'Discuss, share info and vote to eliminate a player.', color: 'text-amber-400', emoji: '☀️' },
  { title: 'Voting', desc: 'Most votes out a player. Rinse and repeat.', color: 'text-red-400', emoji: '🗳️' },
  { title: 'Win', desc: 'Mafia eliminates all villagers or villagers outnumber Mafia.', color: 'text-yellow-400', emoji: '🏆' },
];

const SECTIONS_CONTENT = {
  overview: {
    title: 'GAME OVERVIEW',
    body: 'Each player gets a role. Work with your team, complete your goal, and outsmart the others.',
  },
  mafia: {
    title: 'MAFIA',
    body: 'The Mafia works in the shadows. Each night, they secretly choose a villager to eliminate. During the day, they must blend in and avoid suspicion. If the Mafia outnumbers the villagers, they win.',
    abilities: ['Eliminate one villager each night', 'Know who other Mafia members are', 'Must pretend to be innocent during the day'],
  },
  detective: {
    title: 'DETECTIVE',
    body: 'The Detective is the village\'s best hope. Each night, they can investigate one player to learn if they are Mafia or not. Use this information wisely during the day to guide the village.',
    abilities: ['Investigate one player each night', 'Learn if they are Mafia or innocent', 'Share findings during the day (carefully!)'],
  },
  doctor: {
    title: 'DOCTOR',
    body: 'The Doctor has the power to save lives. Each night, they choose one player to protect. If the Mafia targets that player, they survive. The Doctor can also save themselves.',
    abilities: ['Protect one player each night', 'If protected player is targeted, they survive', 'Can self-protect'],
  },
  villager: {
    title: 'VILLAGER',
    body: 'Villagers are the majority but have no special night abilities. Their power lies in discussion, deduction, and voting. Work together to identify and eliminate the Mafia before it\'s too late.',
    abilities: ['Vote to eliminate suspects during the day', 'Discuss and share observations', 'Use logic to find the Mafia'],
  },
  win: {
    title: 'HOW TO WIN',
    body: 'The game ends when one team achieves their goal.',
    conditions: [
      { team: 'Villagers Win', desc: 'Eliminate all Mafia members.', emoji: '🎉', color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/30' },
      { team: 'Mafia Wins', desc: 'Outnumber the Villagers.', emoji: '😈', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' },
    ],
  },
};

function Rules({ onClose }) {
  const [activeSection, setActiveSection] = useState('overview');

  const content = SECTIONS_CONTENT[activeSection];

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/90 backdrop-blur-md"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.3 }}
        className="relative w-full h-full flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Stepper */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-gray-900/80 backdrop-blur-xl">
          <div className="flex items-center gap-2 lg:gap-4 flex-1 justify-center">
            {STEPPER.map((step, i) => (
              <div key={step.label} className="flex items-center gap-2 lg:gap-4">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-white/10 flex items-center justify-center ${step.color}`}>
                    <step.icon size={18} />
                  </div>
                  <div className="hidden sm:block">
                    <div className="text-xs lg:text-sm font-bold text-white">{i + 1} {step.label}</div>
                    <div className="text-[10px] lg:text-xs text-gray-400">{step.desc}</div>
                  </div>
                </div>
                {i < STEPPER.length - 1 && <ChevronRight size={16} className="text-gray-500" />}
              </div>
            ))}
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors ml-4">
            <X size={24} />
          </button>
        </div>

        {/* Main 3-Column Layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar */}
          <div className="hidden lg:flex flex-col w-72 border-r border-white/10 bg-gray-900/50 overflow-y-auto p-4 gap-2">
            <div className="mb-4">
              <div className="text-xs text-gray-400 uppercase tracking-widest">HOW TO PLAY</div>
              <h2 className="text-3xl font-bold text-white tracking-tight">MAFIA</h2>
              <p className="text-xs text-gray-400 mt-1">Learn the rules. Play the game. Outsmart. Outspeak. Survive.</p>
            </div>

            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full text-left p-3 rounded-xl border transition-all ${
                  activeSection === item.id
                    ? 'bg-white/10 border-purple-500/50 shadow-lg shadow-purple-500/10'
                    : 'bg-white/5 border-white/5 hover:bg-white/10'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className={`flex-shrink-0 w-6 h-6 rounded-full ${item.bg} text-black text-xs font-bold flex items-center justify-center`}>
                    {item.num}
                  </span>
                  <div>
                    <div className={`text-sm font-bold ${item.color}`}>{item.title}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{item.desc}</div>
                  </div>
                </div>
              </button>
            ))}

            <div className="mt-auto pt-4 p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
              <div className="flex items-start gap-2">
                <Lightbulb size={16} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs font-bold text-yellow-400">Tip: </span>
                  <span className="text-xs text-gray-300">The key to winning is trust, strategy and reading people.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Center Content */}
          <div className="flex-1 overflow-y-auto p-6 lg:p-8">
            {/* Mobile nav */}
            <div className="lg:hidden flex gap-2 overflow-x-auto pb-4 mb-4">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                    activeSection === item.id ? 'bg-purple-600 text-white' : 'bg-white/10 text-gray-300'
                  }`}
                >
                  {item.emoji} {item.title}
                </button>
              ))}
            </div>

            {/* Section Content */}
            <div className="border border-white/10 rounded-2xl bg-gray-900/50 p-6 lg:p-8 mb-6">
              <h3 className="text-2xl lg:text-3xl font-bold text-purple-400 mb-4">{content.title}</h3>
              <p className="text-gray-300 text-sm lg:text-base">{content.body}</p>

              {content.abilities && (
                <ul className="mt-4 space-y-2">
                  {content.abilities.map((a, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-gray-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                      {a}
                    </li>
                  ))}
                </ul>
              )}

              {content.conditions && (
                <div className="grid sm:grid-cols-2 gap-4 mt-6">
                  {content.conditions.map((c) => (
                    <div key={c.team} className={`p-5 rounded-xl border text-center ${c.bg}`}>
                      <div className="text-3xl mb-2">{c.emoji}</div>
                      <div className={`font-bold ${c.color}`}>{c.team}</div>
                      <div className="text-xs text-gray-400 mt-1">{c.desc}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tutorial Preview - shown for overview */}
            {activeSection === 'overview' && (
              <div>
                <h4 className="text-sm font-bold text-purple-300 uppercase tracking-widest mb-4">TUTORIAL PREVIEW</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {TUTORIAL_STEPS.map((step) => (
                    <div key={step.num} className="border border-white/10 rounded-xl bg-gray-900/50 p-4 text-center">
                      <div className="flex items-center gap-1 mb-3">
                        <span className="w-5 h-5 rounded-full bg-purple-500 text-black text-[10px] font-bold flex items-center justify-center">{step.num}</span>
                        <span className="text-xs font-bold text-white uppercase">{step.title}</span>
                      </div>
                      <div className="text-3xl mb-2">{step.emoji}</div>
                      <p className="text-[10px] text-gray-400">{step.desc}</p>
                      {step.sub && (
                        <div className="flex gap-1 justify-center mt-2">
                          {step.sub.map((s) => (
                            <span key={s} className="w-5 h-5 rounded-full bg-white/10 text-[9px] text-gray-300 flex items-center justify-center">{s}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Sidebar */}
          <div className="hidden xl:flex flex-col w-72 border-l border-white/10 bg-gray-900/50 overflow-y-auto p-5">
            <h4 className="text-sm font-bold text-amber-400 uppercase tracking-widest mb-6">GAME FLOW EXAMPLE</h4>
            <div className="space-y-5">
              {GAME_FLOW.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-lg flex-shrink-0">
                    {item.emoji}
                  </div>
                  <div>
                    <div className={`text-sm font-bold ${item.color}`}>{item.title}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-gray-900/80 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎮</span>
            <div>
              <div className="text-sm font-bold text-purple-300">Ready to play?</div>
              <div className="text-xs text-gray-400">Read the rules, gather your friends and start the ultimate Mafia experience!</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl font-bold text-white text-sm uppercase tracking-widest hover:from-purple-500 hover:to-indigo-500 transition-all shadow-lg shadow-purple-500/25 whitespace-nowrap"
          >
            GOT IT, LET'S PLAY!
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default Rules;
