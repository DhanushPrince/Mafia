import { useState } from 'react';
import { motion } from 'framer-motion';
import Card from './Card';

function DealingScreen({ deck, onRestart }) {
  const [flippedCards, setFlippedCards] = useState([]);

  const handleCardClick = (index) => {
    if (!flippedCards.includes(index)) {
      setFlippedCards([...flippedCards, index]);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 relative z-10">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12"
      >
        <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-200 via-white to-violet-200 drop-shadow-[0_0_15px_rgba(139,92,246,0.5)] mb-2">
          Click to Reveal
        </h2>
        <p className="text-violet-300/60 font-mono tracking-widest text-sm uppercase">
          Total Players: {deck.length}
        </p>
      </motion.div>

      <motion.div
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8 mb-16 perspective-1000"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0 },
          visible: {
            opacity: 1,
            transition: {
              staggerChildren: 0.1
            }
          }
        }}
      >
        {deck.map((role, index) => (
          <motion.div
            key={index}
            variants={{
              hidden: { opacity: 0, y: 50, rotateX: -20 },
              visible: {
                opacity: 1,
                y: 0,
                rotateX: 0,
                transition: {
                  type: "spring",
                  stiffness: 100,
                  damping: 12
                }
              }
            }}
            className="relative z-10"
            style={{ zIndex: flippedCards.includes(index) ? 50 : 1 }}
          >
            <Card
              role={role}
              isFlipped={flippedCards.includes(index)}
              isDealing={false}
              cardNumber={index + 1}
              onClick={() => handleCardClick(index)}
            />
          </motion.div>
        ))}
      </motion.div>

      {/* Liquid Light Button */}
      <motion.button
        onClick={onRestart}
        className="group relative px-8 py-4 bg-transparent overflow-hidden rounded-full"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        {/* Animated Gradient Border */}
        <div className="absolute inset-0 p-[2px] rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-violet-500 animate-spin-slow opacity-70 group-hover:opacity-100 transition-opacity"
          style={{ backgroundSize: '200% 200%' }} />

        {/* Inner Background */}
        <div className="absolute inset-[2px] bg-black/80 rounded-full backdrop-blur-md z-10" />

        {/* Button Text & Glow */}
        <span className="relative z-20 text-violet-200 font-bold tracking-widest uppercase group-hover:text-white transition-colors flex items-center gap-2">
          Start New Game
        </span>

        {/* Hover Glow */}
        <div className="absolute inset-0 bg-violet-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      </motion.button>
    </div>
  );
}

export default DealingScreen;
