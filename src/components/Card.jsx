import React, { useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Skull, User, HeartPulse, Search, HelpCircle } from 'lucide-react';

const ROLES = {
  mafia: { name: 'Mafia', icon: Skull, color: 'text-red-500', glow: 'shadow-[0_0_30px_rgba(239,68,68,0.6)]', bg: 'bg-red-500/20' },
  villager: { name: 'Villager', icon: User, color: 'text-cyan-400', glow: 'shadow-[0_0_30px_rgba(34,211,238,0.6)]', bg: 'bg-cyan-400/20' },
  doctor: { name: 'Doctor', icon: HeartPulse, color: 'text-teal-400', glow: 'shadow-[0_0_30px_rgba(45,212,191,0.6)]', bg: 'bg-teal-400/20' },
  detective: { name: 'Detective', icon: Search, color: 'text-amber-400', glow: 'shadow-[0_0_30px_rgba(251,191,36,0.6)]', bg: 'bg-amber-400/20' }
};

function Card({ role, isFlipped, isDealing, cardNumber, onClick }) {
  const roleData = role ? ROLES[role] : null;
  const Icon = roleData ? roleData.icon : HelpCircle;

  // 3D Tilt Logic
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseX = useSpring(x, { stiffness: 500, damping: 30 });
  const mouseY = useSpring(y, { stiffness: 500, damping: 30 });

  const rotateX = useTransform(mouseY, [-0.5, 0.5], ["15deg", "-15deg"]);
  const rotateY = useTransform(mouseX, [-0.5, 0.5], ["-15deg", "15deg"]);

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseXVal = e.clientX - rect.left;
    const mouseYVal = e.clientY - rect.top;
    const xPct = mouseXVal / width - 0.5;
    const yPct = mouseYVal / height - 0.5;
    x.set(xPct);
    y.set(yPct);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  // Random float animation
  const randomDuration = Math.random() * 2 + 4;
  const randomDelay = Math.random() * 2;

  return (
    <motion.div
      className="relative w-48 h-72 perspective-1000 cursor-pointer"
      onClick={onClick}
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
          ease: "easeInOut",
          delay: randomDelay
        },
        default: { duration: 0.5 }
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX: isFlipped ? 0 : rotateX,
        rotateY: isFlipped ? 180 : rotateY,
        transformStyle: "preserve-3d",
      }}
    >
      {/* Card Container for Flip */}
      <motion.div
        className="w-full h-full relative preserve-3d transition-all duration-700"
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* Front (Hidden initially, shows role) */}
        <div
          className={`absolute inset-0 backface-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl flex flex-col items-center justify-center p-4 ${roleData?.glow || ''}`}
          style={{ transform: "rotateY(180deg)" }}
        >
          <div className={`absolute inset-0 ${roleData?.bg || ''} opacity-30 rounded-2xl`} />
          <div className="z-10 flex flex-col items-center gap-4">
            {roleData && (
              <>
                <roleData.icon className={`w-16 h-16 ${roleData.color} drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]`} />
                <h2 className={`text-2xl font-bold tracking-widest uppercase ${roleData.color} drop-shadow-lg`}>
                  {roleData.name}
                </h2>
              </>
            )}
          </div>
          {cardNumber && (
            <div className="absolute bottom-4 text-white/20 text-sm font-mono tracking-widest">
              #{String(cardNumber).padStart(3, '0')}
            </div>
          )}
        </div>

        {/* Back (Visible initially) */}
        <div className="absolute inset-0 backface-hidden rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md shadow-2xl flex items-center justify-center overflow-hidden group">
          {/* Glass Shard Effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-50 group-hover:opacity-70 transition-opacity" />
          <div className="absolute -inset-[100%] bg-gradient-to-r from-transparent via-white/10 to-transparent rotate-45 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />

          <div className="relative z-10 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500">
            <HelpCircle className="w-12 h-12 text-white/50 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]" />
          </div>

          {/* Card Pattern/Texture */}
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
        </div>
      </motion.div>
    </motion.div>
  );
}

export default Card;
