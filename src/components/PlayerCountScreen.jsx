import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Users, ChevronUp, ChevronDown, Crown, Smartphone, Play, RotateCcw, Timer, Moon, Sun, Languages } from 'lucide-react';
import { narrator, LANGS, normalizeLang, narratorVoice, voicesFor } from '../audio/narrator';

import { MIN_PLAYERS, MAX_PLAYERS } from '../game/roles';
import { TURN_OPTIONS_SEC, DISCUSS_OPTIONS_MIN, normalizeTimers, resultMsFor, formatTurn, formatDiscuss } from '../game/timing';

// One shared AudioContext for every tick (browsers cap the number of live contexts).
let sharedAudioCtx = null;
const getAudioContext = () => {
  if (!sharedAudioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    sharedAudioCtx = new Ctx();
  }
  if (sharedAudioCtx.state === 'suspended') sharedAudioCtx.resume();
  return sharedAudioCtx;
};

// Synthesized tech tick sound
const playTickSound = () => {
  try {
    const audioCtx = getAudioContext();
    if (!audioCtx) return;
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
  } catch {
    // Ignore audio errors
  }
};

const PlayerCounter = ({ count, onChange }) => {
  const [direction, setDirection] = useState(0);

  const updateCount = (newCount) => {
    if (newCount < MIN_PLAYERS || newCount > MAX_PLAYERS) return;
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
            aria-label="Increase player count"
            onClick={(e) => { e.preventDefault(); updateCount(count + 1); }}
            className="p-2 rounded-lg bg-white/5 border border-white/10 text-violet-200 hover:text-white transition-colors"
          >
            <ChevronUp size={20} />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.1, backgroundColor: "rgba(255,255,255,0.1)" }}
            whileTap={{ scale: 0.9 }}
            aria-label="Decrease player count"
            onClick={(e) => { e.preventDefault(); updateCount(count - 1); }}
            className="p-2 rounded-lg bg-white/5 border border-white/10 text-violet-200 hover:text-white transition-colors"
          >
            <ChevronDown size={20} />
          </motion.button>
        </div>
      </div>
      <output data-testid="player-count" aria-live="polite" className="sr-only">{count}</output>
      <div className="text-xs text-white/20 font-mono mt-1">MIN: {MIN_PLAYERS} | SWIPE OR TAP | MAX: {MAX_PLAYERS}</div>
    </div>
  );
};

const Toggle = ({ label, checked, onChange }) => (
  <label className="flex items-center justify-between gap-3 text-sm text-violet-100/80 cursor-pointer">
    <span>{label}</span>
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 accent-violet-500" />
  </label>
);

/** One row of preset chips (a radio group). */
const PresetRow = ({ label, icon: Icon, options, value, format, onChange, testId }) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex items-center gap-1.5 text-xs text-violet-200/70">
      <Icon size={13} className="text-violet-300/70" /> {label}
    </div>
    <div role="radiogroup" aria-label={label} data-testid={testId} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          onClick={() => onChange(o)}
          className={`rounded-lg border py-2 text-xs font-bold font-mono tabular-nums transition-colors ${
            value === o ? 'bg-violet-600/40 border-violet-400/60 text-white' : 'bg-black/20 border-white/10 text-violet-200/70'
          }`}
        >
          {format(o)}
        </button>
      ))}
    </div>
  </div>
);

/** Night turn + day discussion length for narrator mode (saved in settings and with the game). */
function TimerSettings({ settings, onSettings }) {
  const { turnSec, discussMin } = normalizeTimers(settings);
  const resultSec = Math.round(resultMsFor(turnSec * 1000) / 1000);
  return (
    <div data-testid="timer-settings" className="flex flex-col gap-3 rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex items-center gap-2 text-xs font-mono tracking-widest uppercase text-violet-200/80">
        <Timer size={14} /> Timers
      </div>
      <PresetRow
        label="Night turn (Mafia, Doctor, Detective)"
        icon={Moon}
        options={TURN_OPTIONS_SEC}
        value={turnSec}
        format={formatTurn}
        onChange={(v) => onSettings({ turnSec: v })}
        testId="turn-length"
      />
      <PresetRow
        label="Day discussion"
        icon={Sun}
        options={DISCUSS_OPTIONS_MIN}
        value={discussMin}
        format={(m) => `${m}m`}
        onChange={(v) => onSettings({ discussMin: v })}
        testId="discuss-length"
      />
      <p data-testid="timer-summary" className="text-[11px] leading-snug text-white/40">
        Each role gets {formatTurn(turnSec)} with eyes open. The Detective sees the answer for at least {resultSec}s. Discussion: {formatDiscuss(discussMin)} (can be skipped).
      </p>
    </div>
  );
}

/** Mode choice (Human GM vs App narrator) + narrator voice/options. */
function ModeSettings({ settings, onSettings }) {
  const narratorMode = settings.mode === 'narrator';
  const seg = (active) =>
    `flex-1 flex flex-col items-center gap-1 rounded-lg px-2 py-3 text-xs font-bold uppercase tracking-wider transition-colors border ${
      active ? 'bg-violet-600/40 border-violet-400/60 text-white' : 'bg-white/5 border-white/10 text-violet-200/70'
    }`;
  const lang = normalizeLang(settings.lang);
  const preview = (gender) => {
    narrator.unlock();
    narrator.stop();
    narrator.setVoice(narratorVoice(lang, gender));
    narrator.say('night_start');
  };
  return (
    <div className="w-full flex flex-col gap-3">
      <div className="text-violet-200/80 text-sm font-mono tracking-widest uppercase text-center">Game Master</div>
      <div role="radiogroup" aria-label="Game mode" className="flex gap-2">
        <button type="button" role="radio" aria-checked={!narratorMode} className={seg(!narratorMode)} onClick={() => onSettings({ mode: 'human' })}>
          <Crown size={18} /> Human Game Master
        </button>
        <button type="button" role="radio" aria-checked={narratorMode} className={seg(narratorMode)} onClick={() => onSettings({ mode: 'narrator' })}>
          <Smartphone size={18} /> App is Game Master
        </button>
      </div>
      {narratorMode && (
        <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs text-violet-200/60 text-center">Everyone gets a card. The app narrates the nights.</div>
          <div data-testid="narrator-language" className="flex items-center gap-2">
            <Languages size={16} className="shrink-0 text-violet-200/70" aria-hidden="true" />
            <div role="radiogroup" aria-label="Narrator language" className="flex flex-1 gap-2">
              {Object.values(LANGS).map((l) => (
                <button
                  key={l.id}
                  type="button"
                  role="radio"
                  lang={l.id}
                  aria-checked={lang === l.id}
                  onClick={() => {
                    narrator.stop();
                    onSettings({ lang: l.id });
                  }}
                  className={`flex-1 rounded-lg border py-2 text-sm font-bold transition-colors ${
                    lang === l.id ? 'border-violet-400/60 bg-violet-600/30 text-white' : 'border-white/10 bg-black/20 text-violet-200/70'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <div role="radiogroup" aria-label="Narrator voice" className="flex gap-2">
            {voicesFor(lang).map((v) => (
              <div key={v.id} className={`flex-1 flex items-center rounded-lg border ${settings.voice === v.gender ? 'border-violet-400/60 bg-violet-600/30' : 'border-white/10 bg-black/20'}`}>
                <button
                  type="button"
                  role="radio"
                  data-voice={v.id}
                  aria-checked={settings.voice === v.gender}
                  onClick={() => onSettings({ voice: v.gender })}
                  className="flex-1 py-2 pl-3 text-left text-sm text-white"
                >
                  <span className="block font-bold">{v.label}</span> <span className="block whitespace-nowrap text-white/50 text-xs">{v.description}</span>
                </button>
                <button type="button" aria-label={`Preview ${v.label} voice`} onClick={() => preview(v.gender)} className="p-2 text-violet-200/70 hover:text-white">
                  <Play size={14} />
                </button>
              </div>
            ))}
          </div>
          <Toggle label="Night ambience (masks taps)" checked={settings.ambient} onChange={(ambient) => onSettings({ ambient })} />
          <Toggle label="Doctor can't save the same person twice in a row" checked={settings.noRepeatSave} onChange={(noRepeatSave) => onSettings({ noRepeatSave })} />
          <TimerSettings settings={settings} onSettings={onSettings} />
        </div>
      )}
    </div>
  );
}

function PlayerCountScreen({ initialCount = 6, onStart, onRules, settings, onSettings, resume, onResume }) {
  const [playerCount, setPlayerCount] = useState(initialCount);

  const handleStart = (e) => {
    e.preventDefault();
    onStart(playerCount);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative z-10">
      <motion.button
        className="absolute top-4 right-4 sm:top-8 sm:right-8 flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md hover:bg-white/10 transition-colors text-violet-200"
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
        {resume && (
          <button
            type="button"
            onClick={onResume}
            className="mb-6 w-full flex items-center justify-center gap-2 rounded-xl border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-amber-100 font-bold tracking-widest uppercase"
          >
            <RotateCcw size={18} /> Resume game <span className="font-normal normal-case tracking-normal text-amber-100/70">({resume})</span>
          </button>
        )}
        <h1 className="text-5xl font-bold text-center mb-12 text-transparent bg-clip-text bg-gradient-to-b from-white to-white/50 drop-shadow-[0_0_25px_rgba(255,255,255,0.3)] tracking-tighter">
          MAFIA DEALER
        </h1>

        {/* Floating HUD Modal */}
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-1000"></div>
          <div className="relative bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
            <form className="flex flex-col gap-8 items-center">

              <PlayerCounter count={playerCount} onChange={setPlayerCount} />

              {settings && <ModeSettings settings={settings} onSettings={onSettings} />}

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
                  Next: Player Names
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
