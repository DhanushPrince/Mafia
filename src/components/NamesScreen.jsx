import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, UserPen } from 'lucide-react';
import { PrimaryButton } from './ui';

function validate(names) {
  const counts = new Map();
  names.forEach((n) => {
    const key = n.trim().toLowerCase();
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  });
  return names.map((n) => {
    const key = n.trim().toLowerCase();
    if (!key) return 'Name required';
    if (counts.get(key) > 1) return 'Duplicate name';
    return null;
  });
}

function NamesScreen({ initialNames, onBack, onConfirm, mode = 'human' }) {
  const [names, setNames] = useState(initialNames);
  const errors = validate(names);
  const hasErrors = errors.some(Boolean);

  const update = (i, value) => {
    setNames((prev) => prev.map((n, idx) => (idx === i ? value : n)));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (hasErrors) return;
    onConfirm(names.map((n) => n.trim()));
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 pt-6 sm:p-8 relative z-10">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="flex items-center justify-between mb-6">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md hover:bg-white/10 transition-colors text-violet-200 text-sm"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <span className="text-violet-300/60 font-mono tracking-widest text-xs uppercase">
            {names.length} Players
          </span>
        </div>

        <h2 className="text-4xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-violet-200 via-white to-violet-200 drop-shadow-[0_0_15px_rgba(139,92,246,0.5)] mb-2">
          Player Names
        </h2>
        <p className="text-center text-violet-300/60 text-sm mb-6">
          {mode === 'narrator'
            ? 'Enter everyone who is playing. Everyone gets a card; the app is the Game Master.'
            : <>Game Master: enter everyone who will receive a card. You don&apos;t get one.</>}
        </p>

        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-2xl blur opacity-30" />
          <form
            onSubmit={handleSubmit}
            className="relative bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col gap-3"
          >
            {names.map((name, i) => (
              <div key={i}>
                <label className="flex items-center gap-3">
                  <span className="w-8 shrink-0 text-right font-mono text-sm text-white/30">{i + 1}</span>
                  <div className="relative flex-1">
                    <UserPen size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-violet-300/50 pointer-events-none" />
                    <input
                      type="text"
                      value={name}
                      maxLength={20}
                      autoComplete="off"
                      aria-label={`Player ${i + 1} name`}
                      aria-invalid={Boolean(errors[i])}
                      onChange={(e) => update(i, e.target.value)}
                      onFocus={(e) => e.target.select()}
                      className={`w-full rounded-lg bg-white/5 border pl-9 pr-3 py-3 text-lg font-semibold text-white placeholder-white/30 outline-none transition-colors focus:bg-white/10 ${
                        errors[i] ? 'border-red-500/70' : 'border-white/10 focus:border-violet-400/60'
                      }`}
                    />
                  </div>
                </label>
                {errors[i] && <p className="ml-11 mt-1 text-xs text-red-400">{errors[i]}</p>}
              </div>
            ))}

            <PrimaryButton type="submit" disabled={hasErrors} className="mt-3">
              Deal Cards
            </PrimaryButton>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

export default NamesScreen;
