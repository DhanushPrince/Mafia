import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Users, ChevronUp, ChevronDown } from 'lucide-react';

// Synthesized tech tick sound
const playTickSound = () => {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    // High pitched short mechanical "blip"
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(1200, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.03);

    gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.03);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.03);
  } catch (e) {
    // Ignore audio errors
  }
};

const PlayerCounter = ({ count, onChange }) => {
  const [direction, setDirection] = useState(0);

  const updateCount = (newCount) => {
    if (newCount < 3 || newCount > 20) return;
    setDirection(newCount > count ? 1 : -1);
    onChange(newCount);
    playTickSound();
  };

  const handleDragEnd = (_, info) => {
    const threshold = 20; // Drag pixel threshold to trigger change
    if (info.offset.y < -threshold) {
      // Swipe Up -> Increment
      updateCount(count + 1);
    } else if (info.offset.y > threshold) {
      // Swipe Down -> Decrement
      updateCount(count - 1);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <label className="text-violet-200/80 text-sm font-mono tracking-widest uppercase flex items-center gap-2 mb-2">
        <Users size={16} />
        Player Count
      </label>

      <div className="flex items-center gap-4 bg-black/40 border border-white/10 rounded-xl p-2 backdrop-blur-md">
        {/* Number Display as "Slot Machine" with Swipe Support */}
        <div className="relative w-24 h-20 bg-white/5 rounded-lg border border-white/5 overflow-hidden flex items-center justify-center cursor-ns-resize touch-none">
          {/* Visual cue for swipe */}
          <div className="absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-white/10 to-transparent pointer-events-none" />

          {/* Draggable Area */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center z-10"
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            whileHover={{ cursor: "grab" }}
            whileTap={{ cursor: "grabbing" }}
          >
            <AnimatePresence mode="popLayout" custom={direction}>
              <motion.span
                key={count}
                custom={direction}
                variants={{
                  enter: (direction) => ({
                    y: direction > 0 ? 50 : -50,
                    opacity: 0,
                    scale: 0.5,
                    filter: "blur(10px)"
                  }),
                  center: {
                    zIndex: 1,
                    y: 0,
                    opacity: 1,
                    scale: 1,
                    filter: "blur(0px)"
                  },
                  exit: (direction) => ({
                    zIndex: 0,
                    y: direction > 0 ? -50 : 50,
                    opacity: 0,
                    scale: 0.5,
                    filter: "blur(10px)"
                  })
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  y: { type: "spring", stiffness: 300, damping: 30 },
                  opacity: { duration: 0.2 },
                  scale: { duration: 0.2 }
                }}
                className="absolute text-5xl font-bold font-mono text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)] select-none pointer-events-none"
              >
                {count}
              </motion.span>
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-2">
          <motion.button
            whileHover={{ scale: 1.1, backgroundColor: "rgba(255,255,255,0.1)" }}
            whileTap={{ scale: 0.9 }}
            onClick={(e) => { e.preventDefault(); updateCount(count + 1); }}
            className="p-2 rounded-lg bg-white/5 border border-white/10 text-violet-200 hover:text-white transition-colors"
          >
            <ChevronUp size={20} />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.1, backgroundColor: "rgba(255,255,255,0.1)" }}
            whileTap={{ scale: 0.9 }}
            onClick={(e) => { e.preventDefault(); updateCount(count - 1); }}
            className="p-2 rounded-lg bg-white/5 border border-white/10 text-violet-200 hover:text-white transition-colors"
          >
            <ChevronDown size={20} />
          </motion.button>
        </div>
      </div>
      <div className="text-xs text-white/20 font-mono mt-1">MIN: 3 | SWIPE OR CLICK | MAX: 20</div>
    </div>
  );
};

function PlayerCountScreen({ onStart, onRules }) {
  const [playerCount, setPlayerCount] = useState(6);

  const handleStart = (e) => {
    e.preventDefault();
    onStart(playerCount);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative z-10">
      <motion.button
        className="absolute top-8 right-8 flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md hover:bg-white/10 transition-colors text-violet-200"
        onClick={onRules}
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
            <form className="flex flex-col gap-8 items-center">

              <PlayerCounter count={playerCount} onChange={setPlayerCount} />

              <motion.button
                type="submit"
                onClick={handleStart}
                className="relative w-full py-4 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-lg font-bold text-white tracking-widest uppercase overflow-hidden"
                whileHover={{ scale: 1.02, boxShadow: "0 0 20px rgba(139, 92, 246, 0.5)" }}
                whileTap={{ scale: 0.98 }}
                layout
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full hover:translate-y-0 transition-transform duration-300" />
                <span className="relative z-10 flex items-center justify-center gap-2">
                  Initialize Game
                </span>
              </motion.button>
            </form>
          </div>
        </div>
      </motion.div>

    </div>
  );
}

export default PlayerCountScreen;
