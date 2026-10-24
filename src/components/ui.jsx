import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { createHoldTimer } from './holdTimer';

// The "liquid light" pill button used for Start New Game (original DealingScreen style).
export function LiquidButton({ children, onClick, className = '', ...rest }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className={`group relative px-8 py-4 bg-transparent overflow-hidden rounded-full ${className}`}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      {...rest}
    >
      {/* Rotating gradient border: an oversized conic square spun behind the pill */}
      <div
        className="absolute left-1/2 top-1/2 aspect-square w-[160%] -translate-x-1/2 -translate-y-1/2 animate-spin-slow opacity-70 group-hover:opacity-100 transition-opacity"
        style={{ background: 'conic-gradient(from 0deg, #8b5cf6, #d946ef, #8b5cf6, #d946ef, #8b5cf6)' }}
      />
      <div className="absolute inset-[2px] bg-black/80 rounded-full backdrop-blur-md z-10" />
      <span className="relative z-20 text-violet-200 font-bold tracking-widest uppercase group-hover:text-white transition-colors flex items-center justify-center gap-2">
        {children}
      </span>
      <div className="absolute inset-0 bg-violet-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
    </motion.button>
  );
}

// Solid violet gradient button (same look as the count screen's main CTA).
export function PrimaryButton({ children, className = '', disabled, ...rest }) {
  return (
    <motion.button
      className={`relative w-full py-4 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-lg font-bold text-white tracking-widest uppercase overflow-hidden disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
      whileHover={disabled ? undefined : { scale: 1.02, boxShadow: '0 0 20px rgba(139, 92, 246, 0.5)' }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      disabled={disabled}
      {...rest}
    >
      <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>
    </motion.button>
  );
}

/**
 * Press-and-hold button: fires onComplete only after the pointer (or Space/Enter)
 * has been held for `holdMs`. Releasing early resets the progress.
 */
export function HoldButton({ children, onComplete, holdMs = 1500, className = '', ...rest }) {
  const [progress, setProgress] = useState(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const timerRef = useRef(null);
  if (!timerRef.current) {
    timerRef.current = createHoldTimer({ holdMs, onProgress: setProgress, onComplete: () => onCompleteRef.current?.() });
  }
  const start = () => timerRef.current.start();
  const stop = () => timerRef.current.stop();

  useEffect(() => () => timerRef.current?.stop(), []);

  return (
    <button
      type="button"
      className={`relative overflow-hidden rounded-full border border-violet-400/40 bg-black/60 backdrop-blur-md px-8 py-4 font-bold tracking-widest uppercase text-violet-100 select-none touch-none ${className}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        start();
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') stop();
      }}
      onContextMenu={(e) => e.preventDefault()}
      data-progress={Math.round(progress * 100)}
      {...rest}
    >
      <span
        className="absolute inset-y-0 left-0 bg-gradient-to-r from-violet-600 to-fuchsia-600"
        style={{ width: `${progress * 100}%` }}
        aria-hidden="true"
      />
      <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>
    </button>
  );
}
