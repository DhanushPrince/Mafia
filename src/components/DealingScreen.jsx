import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EyeOff, Crown, X } from 'lucide-react';
import Card from './Card';
import { LiquidButton, HoldButton } from './ui';
import { ROLES } from '../game/roles';

const AUTO_HIDE_MS = 3000; // card flips back on its own after this long
const FLIP_BACK_MS = 700; // let the flip-back animation finish before marking taken

function DealingScreen({ deck, names, assignments, onAssign, onOpenGameMaster, onRestart }) {
  const [pickerCard, setPickerCard] = useState(null); // card index awaiting "Who are you?"
  const [revealing, setRevealing] = useState(null); // { index, name } while face-up
  const [hiding, setHiding] = useState(null); // { index, name } while flipping back
  const autoHideTimer = useRef(null);
  const flipBackTimer = useRef(null);

  // Clear any pending timers on unmount
  useEffect(
    () => () => {
      clearTimeout(autoHideTimer.current);
      clearTimeout(flipBackTimer.current);
    },
    []
  );

  const assignedNames = Object.values(assignments);
  const availableNames = names.filter(
    (n) => !assignedNames.includes(n) && n !== revealing?.name && n !== hiding?.name
  );
  const takenCount = Object.keys(assignments).length;
  const allDealt = deck.length > 0 && takenCount === deck.length;
  const busy = pickerCard !== null || revealing !== null || hiding !== null;

  const handleCardClick = (index) => {
    if (busy || assignments[index] !== undefined) return;
    setPickerCard(index);
  };

  const hideAndPass = () => {
    if (!revealing) return;
    clearTimeout(autoHideTimer.current);
    const current = revealing;
    setRevealing(null);
    setHiding(current);
    flipBackTimer.current = setTimeout(() => {
      onAssign(current.index, current.name);
      setHiding(null);
    }, FLIP_BACK_MS);
  };

  // Auto hide after a few seconds; re-armed whenever a new card is revealed
  useEffect(() => {
    if (!revealing) return undefined;
    autoHideTimer.current = setTimeout(hideAndPass, AUTO_HIDE_MS);
    return () => clearTimeout(autoHideTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealing]);

  const choosePlayer = (name) => {
    const index = pickerCard;
    setPickerCard(null);
    setRevealing({ index, name });
  };

  const revealedRole = revealing ? ROLES[deck[revealing.index]] : null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 pb-32 sm:p-8 relative z-10">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8 sm:mb-12"
      >
        <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-200 via-white to-violet-200 drop-shadow-[0_0_15px_rgba(139,92,246,0.5)] mb-2">
          {allDealt ? 'All Roles Dealt' : 'Tap to Reveal'}
        </h2>
        <p className="text-violet-300/60 font-mono tracking-widest text-sm uppercase">
          Dealt {takenCount} / {deck.length}
        </p>
      </motion.div>

      {allDealt && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative mb-10 w-full max-w-sm"
        >
          <div className="absolute -inset-0.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-2xl blur opacity-30" />
          <div className="relative bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 flex flex-col items-center gap-4 text-center">
            <p className="text-violet-200/80 text-sm">
              Hand the device to the Game Master.
            </p>
            <HoldButton onComplete={onOpenGameMaster} className="w-full" aria-label="Game Master (press and hold)">
              <Crown size={18} /> Game Master
            </HoldButton>
            <p className="text-xs text-white/30 font-mono tracking-widest uppercase">Press &amp; hold to open</p>
          </div>
        </motion.div>
      )}

      <motion.div
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-8 mb-12 sm:mb-16 perspective-1000"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0 },
          visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
        }}
      >
        {deck.map((role, index) => {
          const active = revealing?.index === index ? revealing : hiding?.index === index ? hiding : null;
          return (
            <motion.div
              key={index}
              variants={{
                hidden: { opacity: 0, y: 50, rotateX: -20 },
                visible: {
                  opacity: 1,
                  y: 0,
                  rotateX: 0,
                  transition: { type: 'spring', stiffness: 100, damping: 12 },
                },
              }}
              className="relative z-10"
              style={{ zIndex: active ? 50 : 1 }}
            >
              <Card
                // the role is only handed to the card while its owner is looking at it
                role={active ? role : null}
                playerName={active?.name}
                isFlipped={revealing?.index === index}
                isTaken={assignments[index] !== undefined}
                takenBy={assignments[index]}
                cardNumber={index + 1}
                disabled={busy}
                onClick={() => handleCardClick(index)}
              />
            </motion.div>
          );
        })}
      </motion.div>

      <LiquidButton onClick={onRestart}>Start New Game</LiquidButton>

      {/* "Who are you?" picker */}
      <AnimatePresence>
        {pickerCard !== null && (
          <motion.div
            key="picker"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setPickerCard(null)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="picker-title"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              className="relative w-full max-w-md max-h-[80vh] overflow-y-auto bg-black/70 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-1">
                <h3 id="picker-title" className="text-2xl font-bold text-white">Who are you?</h3>
                <button
                  type="button"
                  onClick={() => setPickerCard(null)}
                  className="p-1 rounded-full text-white/50 hover:text-white hover:bg-white/10"
                  aria-label="Cancel"
                >
                  <X size={22} />
                </button>
              </div>
              <p className="text-violet-300/60 font-mono tracking-widest text-xs uppercase mb-4">
                Card #{String(pickerCard + 1).padStart(3, '0')} · pick your name
              </p>
              <div className="grid grid-cols-2 gap-2">
                {availableNames.map((name) => (
                  <motion.button
                    key={name}
                    type="button"
                    whileTap={{ scale: 0.95 }}
                    onClick={() => choosePlayer(name)}
                    className="truncate rounded-lg bg-white/5 border border-white/10 px-3 py-3 text-lg font-semibold text-violet-100 hover:bg-violet-500/20 hover:border-violet-400/50 transition-colors"
                  >
                    {name}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hide & pass bar while a card is face-up */}
      <AnimatePresence>
        {revealing && (
          <motion.div
            key="hide-bar"
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed inset-x-0 bottom-0 z-[60] p-4 flex justify-center"
          >
            <div className="w-full max-w-md bg-black/70 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex flex-col gap-3 shadow-2xl">
              <p className="text-center text-violet-100">
                <span className="font-bold">{revealing.name}</span>, you are{' '}
                <span className={`font-bold uppercase ${revealedRole?.color}`}>{revealedRole?.name}</span>
              </p>
              <div className="relative h-1 rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  key={revealing.index}
                  className="absolute inset-y-0 left-0 bg-violet-400"
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: AUTO_HIDE_MS / 1000, ease: 'linear' }}
                />
              </div>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={hideAndPass}
                className="w-full py-3 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 font-bold tracking-widest uppercase text-white flex items-center justify-center gap-2"
              >
                <EyeOff size={18} /> Hide &amp; Pass
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default DealingScreen;
