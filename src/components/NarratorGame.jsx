import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Volume2, VolumeX, X, Moon, Sun, Skull, HelpCircle, ThumbsUp, ThumbsDown, Timer, Vote, ShieldCheck, Search, Trophy,
} from 'lucide-react';
import { ROLES } from '../game/roleVisuals';
import {
  PHASES, isTurnPhase, currentTurnRole, selectTargets, selectCurrentSelection, selectDetectiveResult,
  entryClips, exitClips, voteClips, alivePlayers, selectWinner,
} from '../game/engine';
import { narrator } from '../audio/narrator';
import { nameVoice, canSpeakName } from '../audio/nameVoice';
import { startAmbient, stopAmbient } from '../audio/ambient';
import { TIMING, timingFor, remainingMs } from '../game/timing';
import useWakeLock from '../hooks/useWakeLock';
import { LiquidButton, PrimaryButton } from './ui';
import { nameFitClass } from '../game/nameFit';

const TURN_TITLES = {
  mafia: { wake: 'Mafia, open your eyes', hint: 'Tap who to eliminate' },
  doctor: { wake: 'Doctor, open your eyes', hint: 'Tap who to save' },
  detective: { wake: 'Detective, open your eyes', hint: 'Tap who to investigate' },
};

// a name is spoken if its Kokoro clip is ready, else via speechSynthesis; otherwise the "Look at the screen" lines
const nameOpts = { canSayName: (name) => Boolean(nameVoice.get(narrator.voice, name)) || canSpeakName() };

const NIGHT_PHASES = new Set([PHASES.NIGHT_INTRO, PHASES.MAFIA_TURN, PHASES.DOCTOR_TURN, PHASES.DETECTIVE_TURN]);

function useNow(active, every = 200) {
  const [now, setNow] = useState(() => Date.now());
  // `now` is frozen while inactive: refresh it before paint when a window starts, otherwise the first
  // frame of a turn shows the stale gap (e.g. "39" for a 30 s turn)
  useLayoutEffect(() => {
    if (active) setNow(Date.now());
  }, [active]);
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(id);
  }, [active, every]);
  return now;
}

const fmt = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function Caption({ night, inline = false }) {
  const [text, setText] = useState('');
  useEffect(() => narrator.subscribe(setText), []);
  return (
    <div className={`${inline ? 'relative -mt-24 pb-6' : 'fixed inset-x-0 bottom-0 z-[70]'} pointer-events-none p-3 flex justify-center`}>
      <p
        data-testid="narrator-caption"
        aria-live="polite"
        className={`max-w-md min-h-[2.5rem] text-center text-sm italic px-4 py-2 rounded-xl ${
          night ? 'text-neutral-500 bg-black/80' : 'text-violet-100/80 bg-black/50 backdrop-blur-md'
        } ${text ? 'opacity-100' : 'opacity-0'}`}
      >
        {text ? `“${text}”` : ''}
      </p>
    </div>
  );
}

function Header({ state, night, muted, onToggleMute, onQuit }) {
  const [confirmQuit, setConfirmQuit] = useState(false);
  useEffect(() => {
    if (!confirmQuit) return undefined;
    const t = setTimeout(() => setConfirmQuit(false), 3000);
    return () => clearTimeout(t);
  }, [confirmQuit]);
  const isNight = NIGHT_PHASES.has(state.phase);
  const label = state.phase === PHASES.END ? 'Game over' : `${isNight ? 'Night' : 'Day'} ${state.round}`;
  const btn = night
    ? 'border-neutral-800 bg-neutral-950 text-neutral-500'
    : 'border-white/10 bg-white/5 text-violet-200 backdrop-blur-md';
  return (
    <div className="fixed inset-x-0 top-0 z-[70] flex items-center justify-between p-3">
      <span data-testid="round-label" className={`flex items-center gap-2 font-mono text-xs tracking-widest uppercase ${night ? 'text-neutral-600' : 'text-violet-300/70'}`}>
        {isNight ? <Moon size={14} /> : <Sun size={14} />} {label}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? 'Unmute narrator' : 'Mute narrator'}
          aria-pressed={muted}
          className={`h-11 w-11 flex items-center justify-center rounded-full border ${btn}`}
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <button
          type="button"
          onClick={() => (confirmQuit ? onQuit() : setConfirmQuit(true))}
          aria-label={confirmQuit ? 'Tap again to quit' : 'Quit game'}
          className={`h-11 px-3 flex items-center justify-center gap-1 rounded-full border text-xs ${btn}`}
        >
          <X size={18} /> {confirmQuit && 'Tap again to quit'}
        </button>
      </div>
    </div>
  );
}

/** Dark, low-contrast screen shared by every night turn (identical layout for all roles). */
function NightTurn({ state, dispatch, stage, endsAt, now, showResult, timing }) {
  const role = currentTurnRole(state);
  const titles = TURN_TITLES[role] || { wake: 'Open your eyes', hint: 'Tap a name' };
  const targets = selectTargets(state);
  const selected = selectCurrentSelection(state);
  const remaining = remainingMs(endsAt, now, timing.turnMs);
  // detective result needs time to be read, so the detective's taps close resultMs before the end
  const detectiveLocked = role === 'detective' && (Boolean(selected) || remaining < timing.resultMs);
  const canTap = stage === 'open' && !detectiveLocked;
  return (
    <div data-testid="night-turn" data-role={role} data-stage={stage} className="fixed inset-0 z-40 bg-black flex flex-col items-center px-4 pt-20 pb-24 overflow-y-auto">
      <div className="w-full max-w-md flex flex-col items-center">
        <h2 className="text-2xl font-semibold text-neutral-400 text-center">{stage === 'sleep' ? 'Close your eyes' : titles.wake}</h2>
        <p className="text-neutral-600 text-sm mt-1">{stage === 'open' ? titles.hint : stage === 'wake' ? 'Listen…' : ' '}</p>
        <div data-testid="turn-countdown" className="mt-4 mb-6 font-mono text-5xl text-neutral-500 tabular-nums">
          {stage === 'sleep' ? '0' : Math.ceil(remaining / 1000)}
        </div>
        {stage !== 'sleep' && (
          <ul className="w-full flex flex-col gap-3">
            {targets.map((t) => {
              const isSel = selected === t.name;
              return (
                <li key={t.name}>
                  <button
                    type="button"
                    disabled={!canTap || t.disabled}
                    aria-pressed={isSel}
                    onClick={() => dispatch({ type: 'SELECT', name: t.name })}
                    className={`w-full min-h-16 rounded-2xl border px-5 py-4 text-left text-xl font-semibold transition-colors ${
                      isSel ? 'border-neutral-500 bg-neutral-800 text-neutral-200' : 'border-neutral-800 bg-neutral-950 text-neutral-500'
                    } ${t.disabled ? 'opacity-30' : ''} disabled:cursor-default`}
                  >
                    {t.name}
                    {t.reason && <span className="ml-2 text-xs font-normal">({t.reason})</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <AnimatePresence>
        {showResult !== null && showResult !== undefined && (
          <motion.div
            key="result"
            data-testid="detective-result"
            data-mafia={String(showResult)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center gap-6"
          >
            <div data-testid="detective-result-name" className="text-center">
              <div className="text-3xl font-semibold text-white/90">{selected}</div>
              <div className="text-xl text-neutral-300 mt-1">is</div>
            </div>
            {showResult ? (
              <ThumbsUp className="w-36 h-36 text-red-500" strokeWidth={1.75} />
            ) : (
              <ThumbsDown className="w-36 h-36 text-emerald-400" strokeWidth={1.75} />
            )}
            <div className={`text-5xl font-bold tracking-widest text-center ${showResult ? 'text-red-500' : 'text-emerald-400'}`}>
              {showResult ? 'MAFIA' : 'NOT MAFIA'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NightIntro({ state }) {
  return (
    <div data-testid="night-intro" className="fixed inset-0 z-40 bg-black flex flex-col items-center justify-center gap-4 px-6 text-center">
      <Moon className="w-16 h-16 text-neutral-700" />
      <h2 className="text-3xl font-semibold text-neutral-400">Night {state.round}</h2>
      <p className="text-neutral-600">
        {state.round === 1 ? 'Place the phone in the middle where everyone can reach it.' : 'Everyone, close your eyes.'}
      </p>
    </div>
  );
}

function PlayerTiles({ players, highlight }) {
  return (
    <div className="grid grid-cols-3 gap-2 w-full">
      {players.map((p) => (
        <div
          key={p.name}
          data-player={p.name}
          data-dead={String(!p.alive)}
          className={`relative aspect-[3/4] rounded-xl border flex flex-col items-center justify-center gap-2 p-2 ${
            p.alive ? 'border-white/15 bg-white/10' : 'border-white/5 bg-black/60 grayscale opacity-40'
          } ${highlight === p.name ? 'ring-2 ring-red-500/60' : ''}`}
        >
          {p.alive ? <HelpCircle className="w-7 h-7 text-white/40" /> : <Skull className="w-7 h-7 text-white/50" />}
          <span className={`max-w-full text-center ${nameFitClass(p.name, { normal: 'text-sm', long: 'text-xs', veryLong: 'text-[11px]' })} font-semibold ${p.alive ? 'text-white/80' : 'line-through text-white/50'}`}>{p.name}</span>
        </div>
      ))}
    </div>
  );
}

const Panel = ({ children, className = '' }) => (
  <div className={`relative w-full ${className}`}>
    <div className="absolute -inset-0.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-2xl blur opacity-20" />
    <div className="relative bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl p-5">{children}</div>
  </div>
);

function Morning({ state, dispatch }) {
  const { victim, saved, detectiveFoundMafia, caught } = state.morning || {};
  const gameOver = Boolean(selectWinner(state)); // e.g. the Detective caught the last Mafia
  return (
    <div className="min-h-screen flex flex-col items-center px-4 pt-20 pb-28">
      <div className="w-full max-w-md flex flex-col items-center gap-5">
        <h2 className="text-4xl font-bold text-white flex items-center gap-3"><Sun className="text-amber-300/80" /> Morning</h2>
        <Panel>
          <div data-testid="morning-result" className="text-center">
            {victim ? (
              <>
                <Skull className="mx-auto w-10 h-10 text-red-400/80 mb-2" />
                <div className="text-white/60 text-sm uppercase tracking-widest">Killed in the night</div>
                <div data-testid="morning-victim" className="text-3xl font-bold text-red-300 mt-1">{victim}</div>
              </>
            ) : (
              <>
                <ShieldCheck className="mx-auto w-10 h-10 text-teal-300/80 mb-2" />
                <div data-testid="morning-victim" className="text-2xl font-bold text-teal-200">No one died</div>
                {saved && <div className="text-white/50 text-sm mt-1">The Doctor saved their target.</div>}
              </>
            )}
          </div>
          {caught ? (
            <div data-testid="morning-detective-caught" className="mt-4 pt-4 border-t border-white/10 text-center">
              <div className="flex items-center justify-center gap-2 text-amber-200/90 text-base font-medium">
                <Search size={18} className="text-amber-300/80" /> The Detective caught a Mafia
              </div>
              <div data-testid="morning-caught" className="text-2xl font-bold text-amber-200 mt-1">{caught}</div>
              <div className="text-white/50 text-sm">is out of the game.</div>
            </div>
          ) : detectiveFoundMafia && (
            <div data-testid="morning-detective-found" className="mt-4 pt-4 border-t border-white/10 flex items-center justify-center gap-2 text-amber-200/90 text-base font-medium">
              <Search size={18} className="text-amber-300/80" /> The Detective found a Mafia
            </div>
          )}
        </Panel>
        <PlayerTiles players={state.players} highlight={victim} />
        <PrimaryButton type="button" onClick={() => dispatch({ type: 'ADVANCE', from: state.phase })}>{gameOver ? 'See who won' : 'Continue to discussion'}</PrimaryButton>
      </div>
    </div>
  );
}

function Discuss({ state, dispatch, endsAt, now, timing }) {
  return (
    <div className="min-h-screen flex flex-col items-center px-4 pt-20 pb-28">
      <div className="w-full max-w-md flex flex-col items-center gap-5">
        <h2 className="text-4xl font-bold text-white">Discussion</h2>
        <p className="text-violet-200/70 text-center">Talk it over. Who is the Mafia?</p>
        <div data-testid="discuss-timer" className="flex items-center gap-3 font-mono text-6xl text-white tabular-nums">
          <Timer className="w-10 h-10 text-violet-300/70" /> {fmt(remainingMs(endsAt, now, timing.discussMs))}
        </div>
        <PlayerTiles players={state.players} />
        <PrimaryButton type="button" onClick={() => dispatch({ type: 'ADVANCE', from: state.phase })}>Skip to vote</PrimaryButton>
      </div>
    </div>
  );
}

function VoteScreen({ state, dispatch, onContinue }) {
  const [pick, setPick] = useState(null);
  const alive = alivePlayers(state);
  if (state.vote) {
    return (
      <div className="min-h-screen flex flex-col items-center px-4 pt-20 pb-28">
        <div className="w-full max-w-md flex flex-col items-center gap-5">
          <h2 className="text-4xl font-bold text-white">The village has spoken</h2>
          <Panel>
            <div data-testid="vote-result" className="text-center">
              {state.vote.tie ? (
                <div className="text-2xl font-bold text-violet-200">Tie: no one is eliminated</div>
              ) : (
                <>
                  <div className="text-white/60 text-sm uppercase tracking-widest">Voted out</div>
                  <div className="text-3xl font-bold text-red-300 mt-1">{state.vote.out}</div>
                </>
              )}
            </div>
          </Panel>
          <PlayerTiles players={state.players} highlight={state.vote.out} />
          <PrimaryButton type="button" onClick={onContinue}>Continue</PrimaryButton>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen flex flex-col items-center px-4 pt-20 pb-28">
      <div className="w-full max-w-md flex flex-col items-center gap-4">
        <h2 className="text-4xl font-bold text-white flex items-center gap-3"><Vote className="text-violet-300" /> Vote</h2>
        <p className="text-violet-200/70 text-center">Tap the player the village voted out.</p>
        <ul className="w-full flex flex-col gap-2">
          {alive.map((p) => (
            <li key={p.name}>
              <button
                type="button"
                aria-pressed={pick === p.name}
                onClick={() => setPick(p.name)}
                className={`w-full min-h-14 rounded-xl border px-5 py-3 text-left text-lg font-semibold transition-colors ${
                  pick === p.name ? 'border-red-400/70 bg-red-500/15 text-white' : 'border-white/10 bg-white/5 text-violet-100'
                }`}
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
        <PrimaryButton type="button" disabled={!pick} onClick={() => dispatch({ type: 'VOTE', name: pick })}>
          {pick ? `Eliminate ${pick}` : 'Select a player'}
        </PrimaryButton>
        <button
          type="button"
          onClick={() => dispatch({ type: 'VOTE', name: null })}
          className="w-full py-4 rounded-lg border border-white/15 bg-white/5 text-violet-200 font-bold tracking-widest uppercase"
        >
          Tie / no elimination
        </button>
      </div>
    </div>
  );
}

function EndScreen({ state, onRestart }) {
  const villagers = state.winner === 'villagers';
  return (
    <div className="min-h-screen flex flex-col items-center px-4 pt-20 pb-28">
      <div className="w-full max-w-md flex flex-col items-center gap-5">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          data-testid="winner"
          data-winner={state.winner}
          className={`w-full rounded-2xl border p-5 text-center ${villagers ? 'border-cyan-400/50 bg-cyan-400/15' : 'border-red-500/50 bg-red-500/15'}`}
        >
          <Trophy className={`mx-auto w-10 h-10 mb-2 ${villagers ? 'text-cyan-300' : 'text-red-400'}`} />
          <div className={`text-3xl font-bold uppercase tracking-widest ${villagers ? 'text-cyan-300' : 'text-red-400'}`}>
            {villagers ? 'Villagers win' : 'Mafia win'}
          </div>
          <div className="text-white/60 text-sm mt-1">After {state.round} {state.round === 1 ? 'round' : 'rounds'}</div>
        </motion.div>

        <Panel>
          <h3 className="text-sm font-mono tracking-widest uppercase text-violet-300/70 mb-3">Roles</h3>
          <ul className="flex flex-col gap-2" data-testid="role-reveal">
            {state.players.map((p) => {
              const r = ROLES[p.role];
              const Icon = r.icon;
              return (
                <li key={p.name} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${r.border} ${p.alive ? '' : 'opacity-60'}`}>
                  <span className={`h-9 w-9 shrink-0 flex items-center justify-center rounded-full ${r.bg}`}><Icon className={`w-5 h-5 ${r.color}`} /></span>
                  <span className={`flex-1 min-w-0 break-words [overflow-wrap:anywhere] font-semibold ${p.alive ? 'text-white' : 'line-through text-white/60'}`}>{p.name}</span>
                  <span className={`text-sm font-bold uppercase tracking-widest ${r.color}`}>{r.name}</span>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel>
          <h3 className="text-sm font-mono tracking-widest uppercase text-violet-300/70 mb-3">Game log</h3>
          <ol className="flex flex-col gap-3" data-testid="game-log">
            {state.log.map((e) => (
              <li key={e.round} className="text-sm text-violet-100/80">
                <div className="font-bold text-white mb-1">Round {e.round}</div>
                <div className="flex items-center gap-2"><Moon size={14} className="text-white/40" />
                  {e.killed ? <span>Mafia killed <b>{e.killed}</b></span> : e.saved ? <span>Mafia targeted <b>{e.mafiaTarget}</b>, Doctor saved them</span> : <span>No kill</span>}
                </div>
                {e.doctorSave && !e.saved && <div className="flex items-center gap-2"><ShieldCheck size={14} className="text-white/40" /> Doctor protected {e.doctorSave}</div>}
                {e.detectiveCheck && (
                  <div className="flex items-center gap-2"><Search size={14} className="text-white/40" /> Detective checked {e.detectiveCheck.target}: {e.detectiveCheck.isMafia ? 'Mafia' : 'not Mafia'}{e.caught ? ' - caught and out' : ''}</div>
                )}
                {(e.votedOut || e.tie) && (
                  <div className="flex items-center gap-2"><Vote size={14} className="text-white/40" /> {e.tie ? 'Vote tied, no elimination' : <span>Village voted out <b>{e.votedOut}</b></span>}</div>
                )}
              </li>
            ))}
          </ol>
        </Panel>

        <LiquidButton onClick={onRestart}>Start New Game</LiquidButton>
      </div>
    </div>
  );
}

/**
 * Narrator-mode game: drives the engine through time (clips, fixed turn windows,
 * discussion timer) and renders each phase.
 */
function NarratorGame({ state, dispatch, settings, onSettings, onRestart }) {
  const [stage, setStage] = useState(null); // night turn: 'wake' | 'open' | 'sleep'
  const [endsAt, setEndsAt] = useState(null); // turn window / discussion end
  const [showResult, setShowResult] = useState(null);
  const now = useNow(endsAt !== null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const timing = timingFor(state.timers);

  // e2e hook (only with ?fast=1): window.__forceCrash = true makes this screen throw
  if (TIMING.fast && typeof window !== 'undefined' && window.__forceCrash) {
    throw new Error('forced test crash');
  }

  useWakeLock(true);

  // Phase script: narration + fixed-length windows. Re-runs on every phase / round (and on resume).
  useEffect(() => {
    const ctl = { cancelled: false, timers: [] };
    const wait = (ms) => new Promise((r) => ctl.timers.push(setTimeout(r, ms)));
    const s = stateRef.current;
    const phase = s.phase;
    const T = timingFor(s.timers); // chosen at setup (saved with the game); ?fast=1 overrides
    setStage(null);
    setEndsAt(null);
    setShowResult(null);

    (async () => {
      if (phase === PHASES.CHECK_WIN) {
        dispatch({ type: 'ADVANCE', from: phase });
        return;
      }
      if (phase === PHASES.NIGHT_INTRO) {
        await narrator.say(entryClips(s));
        if (ctl.cancelled) return;
        await wait(T.gapMs);
        if (!ctl.cancelled) dispatch({ type: 'ADVANCE', from: phase });
        return;
      }
      if (isTurnPhase(phase)) {
        setStage('wake');
        await narrator.say(entryClips(s));
        if (ctl.cancelled) return;
        // the window is the same length whatever happens; taps never end it early
        setEndsAt(Date.now() + T.turnMs);
        setStage('open');
        await wait(T.turnMs);
        if (ctl.cancelled) return;
        setShowResult(null);
        setEndsAt(null);
        setStage('sleep');
        await narrator.say(exitClips(phase));
        if (ctl.cancelled) return;
        await wait(T.gapMs);
        if (!ctl.cancelled) dispatch({ type: 'ADVANCE', from: phase });
        return;
      }
      if (phase === PHASES.DAY_DISCUSS) {
        await narrator.say(entryClips(s));
        if (ctl.cancelled) return;
        setEndsAt(Date.now() + T.discussMs);
        await wait(T.discussMs);
        if (!ctl.cancelled) dispatch({ type: 'ADVANCE', from: phase });
        return;
      }
      if (phase === PHASES.VOTE && s.vote) {
        narrator.say(voteClips(s, nameOpts)); // resumed after the vote was cast
        return;
      }
      narrator.say(entryClips(s, nameOpts)); // MORNING, VOTE, END: user taps to continue
    })();

    return () => {
      ctl.cancelled = true;
      ctl.timers.forEach(clearTimeout);
      narrator.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.round]);

  // Vote outcome narration
  const voteKey = state.vote ? `${state.vote.tie}-${state.vote.out}` : null;
  const prevVoteKey = useRef(voteKey);
  useEffect(() => {
    if (voteKey && prevVoteKey.current !== voteKey) {
      narrator.stop();
      narrator.say(voteClips(stateRef.current, nameOpts));
    }
    prevVoteKey.current = voteKey;
  }, [voteKey]);

  // Detective result: big thumbs until the turn window ends (always >= resultMs), plus the "here is your answer" clip
  const detectiveResult = state.phase === PHASES.DETECTIVE_TURN ? selectDetectiveResult(state) : null;
  const investigated = state.phase === PHASES.DETECTIVE_TURN ? state.night.selections.detective : null;
  useEffect(() => {
    if (!investigated || detectiveResult === null) return undefined;
    setShowResult(detectiveResult);
    narrator.say('detective_result');
    // stays up until the turn's 'sleep' stage (cleared there); taps lock >= resultMs before the end
    return undefined;
  }, [investigated, detectiveResult]);

  // Ambient drone under night phases
  const nightish = NIGHT_PHASES.has(state.phase);
  useEffect(() => {
    if (nightish && settings.ambient && !settings.muted) startAmbient();
    else stopAmbient();
  }, [nightish, settings.ambient, settings.muted]);
  useEffect(() => () => stopAmbient(), []);

  const dark = nightish;
  const continueAfterVote = () => dispatch({ type: 'ADVANCE', from: state.phase });

  let body = null;
  if (state.phase === PHASES.NIGHT_INTRO) body = <NightIntro state={state} />;
  else if (isTurnPhase(state.phase))
    body = <NightTurn state={state} dispatch={dispatch} stage={stage || 'wake'} endsAt={endsAt} now={now} showResult={showResult} timing={timing} />;
  else if (state.phase === PHASES.MORNING) body = <Morning state={state} dispatch={dispatch} />;
  else if (state.phase === PHASES.DAY_DISCUSS) body = <Discuss state={state} dispatch={dispatch} endsAt={endsAt} now={now} timing={timing} />;
  else if (state.phase === PHASES.VOTE) body = <VoteScreen key={state.round} state={state} dispatch={dispatch} onContinue={continueAfterVote} />;
  else if (state.phase === PHASES.END) body = <EndScreen state={state} onRestart={onRestart} />;

  return (
    <div data-testid="narrator-game" data-phase={state.phase} data-turn-ms={timing.turnMs} data-discuss-ms={timing.discussMs} className="relative min-h-screen">
      <Header state={state} night={dark} muted={settings.muted} onToggleMute={() => onSettings({ muted: !settings.muted })} onQuit={onRestart} />
      {body}
      <Caption night={dark} inline={state.phase === PHASES.END} />
    </div>
  );
}

export default NarratorGame;
