import { useEffect, useMemo } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { HelpCircle, CheckCircle } from 'lucide-react';
import { ROLES } from '../game/roleVisuals';
import { nameFitClass } from '../game/nameFit';

// The build's CSS minifier drops -webkit-backface-visibility from the utility, so set it inline as well.
const FACE_STYLE = { WebkitBackfaceVisibility: 'hidden', backfaceVisibility: 'hidden' };

function Card({ role, isFlipped, isTaken, takenBy, playerName, cardNumber, onClick, disabled }) {
  const roleData = role ? ROLES[role] : null;

  // 3D Tilt Logic
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseX = useSpring(x, { stiffness: 500, damping: 30 });
  const mouseY = useSpring(y, { stiffness: 500, damping: 30 });

  const rotateX = useTransform(mouseY, [-0.5, 0.5], ['15deg', '-15deg']);
  const rotateY = useTransform(mouseX, [-0.5, 0.5], ['-15deg', '15deg']);

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  // Flip angle as a spring motion value, so each face can be hidden explicitly once it turns away.
  // CSS backface-visibility alone is unreliable in WebKit (and ignored by some renderers), which
  // showed the mirrored front face (#00N) through the card back.
  const flip = useSpring(isFlipped ? 180 : 0, { stiffness: 260, damping: 20 });
  useEffect(() => {
    flip.set(isFlipped ? 180 : 0);
  }, [isFlipped, flip]);
  const facingFront = (v) => {
    const a = ((v % 360) + 360) % 360;
    return a > 90 && a < 270;
  };
  const frontVisibility = useTransform(flip, (v) => (facingFront(v) ? 'visible' : 'hidden'));
  const backVisibility = useTransform(flip, (v) => (facingFront(v) ? 'hidden' : 'visible'));

  // Random float animation - rolled once per card, not on every render
  const { randomDuration, randomDelay } = useMemo(
    () => ({ randomDuration: Math.random() * 2 + 4, randomDelay: Math.random() * 2 }),
    []
  );

  const label = isTaken
    ? `Card ${cardNumber} taken by ${takenBy}`
    : isFlipped
      ? `Card ${cardNumber} revealed`
      : `Card ${cardNumber}, tap to reveal`;

  return (
    <motion.div
      role="button"
      tabIndex={isTaken || disabled ? -1 : 0}
      aria-label={label}
      aria-disabled={isTaken || disabled}
      data-card={cardNumber}
      data-state={isTaken ? 'taken' : isFlipped ? 'revealed' : 'hidden'}
      className={`relative w-36 h-52 sm:w-48 sm:h-72 perspective-1000 ${isTaken || disabled ? 'cursor-default' : 'cursor-pointer'}`}
      onClick={isTaken || disabled ? undefined : onClick}
      onKeyDown={(e) => {
        if (!isTaken && !disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick?.();
        }
      }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{
        opacity: 1,
        scale: 1,
        y: [0, -15, 0],
      }}
      transition={{
        y: {
          duration: randomDuration,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: randomDelay,
        },
        default: { duration: 0.5 },
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX: isFlipped ? 0 : rotateX,
        rotateY: isFlipped ? 0 : rotateY,
        transformStyle: 'preserve-3d',
      }}
    >
      {/* Card Container for Flip */}
      <motion.div
        className="w-full h-full relative preserve-3d"
        style={{ rotateY: flip, transformStyle: 'preserve-3d', WebkitTransformStyle: 'preserve-3d' }}
      >
        {/* Front (Hidden initially, shows role) */}
        <motion.div
          className={`absolute inset-0 backface-hidden rounded-2xl border border-white/10 bg-[#17141f]/90 flex flex-col items-center justify-center p-3 sm:p-4 ${roleData?.glow || ''}`}
          style={{ ...FACE_STYLE, transform: 'rotateY(180deg) translateZ(1px)', visibility: frontVisibility }}
        >
          <div className={`absolute inset-0 ${roleData?.bg || ''} opacity-30 rounded-2xl`} />
          {playerName && (
            <div className="absolute top-3 inset-x-2 text-center text-xs sm:text-sm leading-tight font-semibold text-white/70 break-words [overflow-wrap:anywhere]">
              {playerName}
            </div>
          )}
          <div className="z-10 flex flex-col items-center gap-3 sm:gap-4">
            {roleData && (
              <>
                <roleData.icon className={`w-12 h-12 sm:w-16 sm:h-16 ${roleData.color} drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]`} />
                <h2 className={`text-xl sm:text-2xl font-bold tracking-widest uppercase ${roleData.color} drop-shadow-lg`}>
                  {roleData.name}
                </h2>
              </>
            )}
          </div>
          {cardNumber && (
            <div className="absolute bottom-3 sm:bottom-4 text-white/20 text-xs sm:text-sm font-mono tracking-widest">
              #{String(cardNumber).padStart(3, '0')}
            </div>
          )}
        </motion.div>

        {/* Back (Visible initially) */}
        {/* No backdrop-filter on the 3D faces: in WebKit it breaks backface-visibility (mirrored #00N showing through) */}
        <motion.div
          className="absolute inset-0 backface-hidden rounded-2xl border border-white/20 bg-[#2a2633]/90 shadow-2xl flex items-center justify-center overflow-hidden group"
          style={{ ...FACE_STYLE, transform: 'rotateY(0deg) translateZ(1px)', visibility: backVisibility }}
        >
          {/* Glass Shard Effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-50 group-hover:opacity-70 transition-opacity" />
          <div className="absolute -inset-[100%] bg-gradient-to-r from-transparent via-white/10 to-transparent rotate-45 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />

          <div className="relative z-10 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-[opacity,transform] duration-500">
            <HelpCircle className="w-10 h-10 sm:w-12 sm:h-12 text-white/50 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]" />
          </div>

          {/* Card Pattern/Texture */}
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
        </motion.div>
      </motion.div>

      {/* Taken overlay: shows who took the card, never the role */}
      {isTaken && (
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          // the faces sit at translateZ(1px) inside the 3D context, where z-index doesn't apply; lift the overlay above them
          style={{ z: 4 }}
          className="absolute inset-0 rounded-2xl bg-black/80 backdrop-blur-sm border border-green-500/30 flex flex-col items-center justify-center gap-3 p-3 z-20"
        >
          <CheckCircle className="w-12 h-12 sm:w-16 sm:h-16 text-green-500 drop-shadow-[0_0_20px_rgba(34,197,94,0.6)]" />
          {takenBy && (
            <span className={`max-w-full text-center ${nameFitClass(takenBy, { normal: 'text-base sm:text-lg', long: 'text-sm sm:text-base', veryLong: 'text-xs sm:text-base' })} font-bold text-white tracking-wide`}>
              {takenBy}
            </span>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

export default Card;
