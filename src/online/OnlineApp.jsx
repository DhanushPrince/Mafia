import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { renderSVG } from 'uqr';
import {
  Dices, Copy, Check, Crown, X, Mic, MicOff, Video, VideoOff, ArrowLeft, Moon, Sun, Vote, Users, Pencil, RotateCcw, Eye, LogOut,
} from 'lucide-react';
import Card from '../components/Card';
import { PrimaryButton, LiquidButton } from '../components/ui';
import { ROLES } from '../game/roleVisuals';
import { narrator, narratorVoice, linesFor, voicesFor, LANGS, captionedItems } from '../audio/narrator';
import { nameVoice } from '../audio/nameVoice';
import { unlockAmbient } from '../audio/ambient';
import { TURN_OPTIONS_SEC, DISCUSS_OPTIONS_MIN } from '../game/timing';
import useWakeLock from '../hooks/useWakeLock';
import { validateName, randomFunName, NAME_MAX } from './names';
import { isRoomCode, randomRoomCode, VOTE_OPTIONS_SEC } from './roomLogic';
import { loadIdentity, saveIdentity } from './identity';
import useRoom from './useRoom';
import { apiUrl, ROOMS_HOST } from './roomsHost';
import { Mesh, getLocalMedia } from './video';
import VideoGrid from './VideoGrid';

const panel = 'relative bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-5 sm:p-6 shadow-2xl';
const chip = 'px-3 py-1.5 rounded-full border text-sm transition-colors';

// ------------------------------------------------------------------ routing helpers
export const isOnlinePath = (path = window.location.pathname) => path === '/online' || /^\/r\/[A-Za-z]{4}\/?$/.test(path);
const codeFromPath = () => (window.location.pathname.match(/^\/r\/([A-Za-z]{4})/)?.[1] || '').toUpperCase();
// keep ?fast / ?tts debug params when moving between /online and /r/CODE
// e2e / debugging hooks (window.__mafiaView = this player's own view) in dev or with ?debug=1
const debugHooks = () => import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');
const go = (path) => window.history.pushState({}, '', path + window.location.search);

function useNow(ms = 250) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

const ERRORS = {
  name_taken: 'That name is already taken in this room.',
  name_invalid: 'Use 2-16 letters (Tamil or English).',
  room_full: 'This room is full.',
  kicked: 'The host removed you from this room.',
  no_room: 'No room with that code. Check the code or create a new room.',
  rename_locked: 'Names can only be changed in the lobby.',
  card_taken: 'Someone just took that card. Pick another one.',
};

// ------------------------------------------------------------------ name entry
function NameForm({ initial = '', onSave, error, suggestions = [], submitLabel = 'Continue as guest' }) {
  const [name, setName] = useState(initial);
  const [touched, setTouched] = useState(false);
  const check = validateName(name);
  const shownError = error || (touched && !check.ok ? check.error : null);
  const submit = (n = name) => {
    const v = validateName(n);
    setTouched(true);
    if (v.ok) onSave(v.name);
  };
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="flex gap-2">
        <input
          data-testid="name-input"
          value={name}
          maxLength={NAME_MAX * 3}
          onChange={(e) => { setName(e.target.value); setTouched(false); }}
          placeholder="Your name / உங்கள் பெயர்"
          className="flex-1 min-w-0 rounded-lg bg-white/5 border border-white/15 px-4 py-3 text-lg text-white placeholder:text-white/30 focus:outline-none focus:border-violet-400"
        />
        <button
          type="button"
          data-testid="dice"
          aria-label="Suggest a name"
          title="Suggest a name"
          onClick={() => { setName(randomFunName(Math.random, [name])); setTouched(false); }}
          className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-3 text-violet-200 hover:bg-white/10"
        >
          <Dices className="w-6 h-6" />
        </button>
      </div>
      {shownError && <p data-testid="name-error" className="text-sm text-red-300">{ERRORS[shownError] || shownError}</p>}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="name-suggestions">
          <span className="text-xs text-white/50 w-full">Try one of these:</span>
          {suggestions.map((s) => (
            <button key={s} type="button" data-testid="name-suggestion" onClick={() => submit(s)} className={`${chip} border-violet-400/40 bg-violet-500/10 text-violet-100`}>
              {s}
            </button>
          ))}
        </div>
      )}
      <PrimaryButton type="submit" data-testid="name-save">{submitLabel}</PrimaryButton>
    </form>
  );
}

function NameScreen({ identity, onSave, google }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className={`${panel} w-full max-w-md flex flex-col gap-5`}>
        <h1 className="text-3xl font-bold text-center tracking-tight">Play online</h1>
        <p className="text-white/60 text-center text-sm">Pick the name other players will see.</p>
        <NameForm initial={identity.name} onSave={onSave} />
        {google ? (
          <a href="/api/auth/sign-in/social?provider=google" className="text-center text-sm text-white/60 underline">Sign in with Google instead</a>
        ) : (
          <p className="text-center text-xs text-white/30">Google sign-in is coming soon. Guests can host and join rooms.</p>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ home: create / join
function Home({ identity, onRename, onEnter, onExit, notice }) {
  const [code, setCode] = useState('');
  const [editing, setEditing] = useState(false);
  const fast = new URLSearchParams(window.location.search).get('fast') === '1';
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className={`${panel} w-full max-w-md flex flex-col gap-6`}>
        <button type="button" onClick={onExit} className="absolute top-4 left-4 text-white/50 hover:text-white" aria-label="Back"><ArrowLeft /></button>
        <h1 className="text-3xl font-bold text-center tracking-tight">Mafia online</h1>
        {notice && <p data-testid="home-notice" className="text-sm text-amber-200 text-center">{ERRORS[notice] || notice}</p>}
        {editing ? (
          <NameForm initial={identity.name} submitLabel="Save name" onSave={(n) => { onRename(n); setEditing(false); }} />
        ) : (
          <div className="flex items-center justify-center gap-2 text-white/70">
            Playing as <b data-testid="my-name" className="text-white">{identity.name}</b>
            <button type="button" aria-label="Change name" onClick={() => setEditing(true)} className="text-white/50 hover:text-white"><Pencil className="w-4 h-4" /></button>
          </div>
        )}
        <PrimaryButton data-testid="create-room" onClick={() => onEnter(randomRoomCode(), { create: true, fast })}>Create a room</PrimaryButton>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (isRoomCode(code)) onEnter(code, {}); }}>
          <input
            data-testid="join-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
            placeholder="CODE"
            className="flex-1 min-w-0 rounded-lg bg-white/5 border border-white/15 px-4 py-3 text-2xl text-center font-mono tracking-[0.4em] uppercase text-white placeholder:text-white/20 focus:outline-none focus:border-violet-400"
          />
          <button type="submit" data-testid="join-btn" disabled={!isRoomCode(code)} className="rounded-lg px-5 font-bold tracking-widest uppercase bg-white/10 border border-white/15 disabled:opacity-30">Join</button>
        </form>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ lobby
function InviteBox({ code }) {
  const link = `${window.location.origin}/r/${code}`;
  const [copied, setCopied] = useState(false);
  const qr = useMemo(() => renderSVG(link, { border: 1, pixelSize: 4, whiteColor: '#ffffff', blackColor: '#120f18' }), [link]);
  return (
    <div className="flex items-center gap-4">
      <div className="w-24 h-24 shrink-0 rounded-lg overflow-hidden bg-white" data-testid="invite-qr" dangerouslySetInnerHTML={{ __html: qr }} />
      <div className="min-w-0 flex flex-col gap-2">
        <div className="text-xs uppercase tracking-widest text-white/50">Room code</div>
        <div data-testid="room-code" className="text-4xl font-mono font-bold tracking-[0.25em]">{code}</div>
        <button
          type="button"
          data-testid="copy-link"
          onClick={() => { navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }}
          className="flex items-center gap-1.5 text-sm text-violet-200 hover:text-white truncate"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? 'Copied' : link.replace(/^https?:\/\//, '')}
        </button>
      </div>
    </div>
  );
}

function Select({ label, value, options, onChange, disabled, testid }) {
  return (
    <label className="flex flex-col gap-1 text-xs uppercase tracking-widest text-white/50">
      {label}
      <select data-testid={testid} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg bg-[#17141f] border border-white/15 px-3 py-2 text-sm normal-case tracking-normal text-white disabled:opacity-60">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function Lobby({ view, send, error, clearError }) {
  const me = view.members.find((m) => m.seat === view.you);
  const [renaming, setRenaming] = useState(false);
  const s = view.settings;
  const host = view.isHost;
  const set = (patch) => send({ t: 'settings', patch });
  const players = view.members.filter((m) => !m.spectator);
  const renameError = error?.action === 'rename' ? error : null;
  useEffect(() => { if (renaming && !renameError && error === null) setRenaming(false); }, [view.members]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-4">
      <div className={panel}><InviteBox code={view.code} /></div>
      <div className={panel}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold tracking-widest uppercase text-sm text-white/70 flex items-center gap-2"><Users className="w-4 h-4" /> Players ({players.length})</h2>
          <span className="text-xs text-white/40">4-15 players</span>
        </div>
        <ul className="flex flex-col gap-2" data-testid="lobby-players">
          {players.map((m) => (
            <li key={m.seat} data-testid="lobby-player" data-name={m.name} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
              {m.seat === view.hostSeat && <Crown className="w-4 h-4 text-amber-300" />}
              <span className={`truncate ${m.connected ? '' : 'text-white/40'}`}>{m.name}{m.seat === view.you ? ' (you)' : ''}</span>
              {!m.connected && <span className="text-xs text-white/40">offline</span>}
              <span className={`ml-auto text-xs font-bold tracking-widest uppercase ${m.seat === view.hostSeat ? 'text-amber-200/70' : m.ready ? 'text-green-400' : 'text-white/40'}`}>
                {m.seat === view.hostSeat ? 'host' : m.ready ? 'ready' : 'not ready'}
              </span>
              {host && m.seat !== view.you && (
                <button type="button" aria-label={`Remove ${m.name}`} data-testid="kick" onClick={() => send({ t: 'kick', seat: m.seat })} className="text-white/40 hover:text-red-300"><X className="w-4 h-4" /></button>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          {!host && (
            <button type="button" data-testid="ready-toggle" onClick={() => send({ t: 'ready', ready: !me?.ready })} className={`${chip} ${me?.ready ? 'border-green-400/50 bg-green-500/15 text-green-200' : 'border-white/20 bg-white/5 text-white'}`}>
              {me?.ready ? "I'm ready ✓" : "I'm ready"}
            </button>
          )}
          <button type="button" data-testid="rename" onClick={() => { clearError(); setRenaming((r) => !r); }} className={`${chip} border-white/20 bg-white/5 text-white/80`}>
            <Pencil className="w-3.5 h-3.5 inline mr-1" />Change name
          </button>
        </div>
        {renaming && (
          <div className="mt-3">
            <NameForm
              initial={me?.name}
              submitLabel="Save name"
              error={renameError?.code}
              suggestions={renameError?.suggestions || []}
              onSave={(name) => { clearError(); send({ t: 'rename', name }); setRenaming(false); }}
            />
          </div>
        )}
      </div>

      <div className={panel}>
        <h2 className="font-bold tracking-widest uppercase text-sm text-white/70 mb-3">Game settings {host ? '' : '(host)'}</h2>
        <div className="grid grid-cols-2 gap-3">
          <Select testid="set-lang" label="Language" disabled={!host} value={s.lang} onChange={(v) => set({ lang: v })} options={Object.entries(LANGS).map(([k, v]) => [k, v.label || v.name || k])} />
          <Select testid="set-voice" label="Narrator" disabled={!host} value={s.voice} onChange={(v) => set({ voice: v })} options={voicesFor(s.lang).map((v) => [v.gender, `${v.label} · ${v.description}`])} />
          <Select testid="set-turn" label="Night turn" disabled={!host} value={s.turnSec} onChange={(v) => set({ turnSec: Number(v) })} options={TURN_OPTIONS_SEC.map((v) => [v, `${v} s`])} />
          <Select testid="set-discuss" label="Discussion" disabled={!host} value={s.discussMin} onChange={(v) => set({ discussMin: Number(v) })} options={DISCUSS_OPTIONS_MIN.map((v) => [v, `${v} min`])} />
          <Select testid="set-vote" label="Voting" disabled={!host} value={s.voteSec} onChange={(v) => set({ voteSec: Number(v) })} options={VOTE_OPTIONS_SEC.map((v) => [v, `${v} s`])} />
        </div>
        <p className="mt-3 text-xs text-white/40">The narrator plays on the host's phone. Cameras and mics switch off at night.</p>
      </div>

      {host ? (
        <PrimaryButton data-testid="start-game" disabled={!view.canStart?.ok} onClick={() => send({ t: 'start' })}>
          {view.canStart?.ok ? 'Deal the cards' : players.length < 4 ? 'Waiting for 4+ players' : 'Waiting for everyone to be ready'}
        </PrimaryButton>
      ) : (
        <p className="text-center text-white/50 text-sm">Waiting for the host to start…</p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ card pick
function RevealHold({ role, onSeen, seen }) {
  const [holding, setHolding] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const data = ROLES[role];
  const stop = () => setHolding(false);
  return (
    <div className="flex flex-col items-center gap-5">
      <div
        data-testid="my-card"
        data-holding={holding ? '1' : '0'}
        className="select-none touch-none"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); setHolding(true); setRevealed(true); }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onLostPointerCapture={stop}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Card role={role} isFlipped={holding} cardNumber={null} />
      </div>
      <p className="text-sm text-white/60 flex items-center gap-1.5"><Eye className="w-4 h-4" /> Press and hold the card to see your role. Keep it hidden from cameras.</p>
      {holding && data && <span data-testid="role-name" className={`sr-only`}>{data.name}</span>}
      {revealed && !seen && <PrimaryButton data-testid="seen-btn" onClick={onSeen}>I've seen my card</PrimaryButton>}
      {seen && <p data-testid="waiting-others" className="text-white/60">Waiting for the others to look at their cards…</p>}
    </div>
  );
}

function DealPick({ view, send, names }) {
  const d = view.deal;
  if (!d) return <p className="text-center text-white/60">You're watching this game. You can play the next one.</p>;
  const seen = d.seen.includes(view.you);
  const missing = d.seats.filter((s) => !d.seen.includes(s));
  return (
    <div className="flex flex-col items-center gap-5">
      {d.myCard === null ? (
        <>
          <h2 className="text-2xl font-bold tracking-tight text-center">Pick a card</h2>
          <p className="text-sm text-white/60 text-center -mt-3">Tap any face-down card. Cards other players took turn grey.</p>
          <div data-testid="card-spread" className="flex flex-wrap justify-center gap-3 sm:gap-4 max-w-5xl">
            {d.cards.map((c) => (
              <div key={c.index} className="scale-[0.72] sm:scale-90 -m-5 sm:-m-3" data-testid="pick-card" data-index={c.index} data-taken={c.takenBy ? '1' : '0'}>
                <Card
                  cardNumber={c.index + 1}
                  isTaken={Boolean(c.takenBy)}
                  takenBy={c.takenBy ? names[c.takenBy] : null}
                  onClick={() => send({ t: 'pick', index: c.index })}
                />
              </div>
            ))}
          </div>
        </>
      ) : (
        <RevealHold role={d.myRole} seen={seen} onSeen={() => send({ t: 'seen' })} />
      )}
      <p className="text-xs text-white/40">{d.cards.filter((c) => c.takenBy).length}/{d.cards.length} cards taken · {d.seen.length} seen</p>
      {view.isHost && d.allPicked && missing.length > 0 && (
        <button type="button" data-testid="force-night" onClick={() => send({ t: 'forceNight' })} className="text-sm text-white/50 underline">Start the night now</button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ game
const STEP_TITLES = {
  intro: 'Night falls', introGap: 'Night falls', wake: 'Night', open: 'Night', sleep: 'Night', sleepGap: 'Night',
  morning: 'Morning', morningRead: 'Morning', discussCue: 'Discussion', discuss: 'Discussion',
  voteCue: 'Vote', voting: 'Vote', voteResult: 'The village decided', voteRead: 'The village decided', end: 'Game over', over: 'Game over',
};

function Countdown({ deadline, serverNow }) {
  useNow(250);
  if (!deadline) return null;
  const left = Math.max(0, Math.ceil((deadline - serverNow()) / 1000));
  return <span data-testid="countdown" className="font-mono text-white/70">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>;
}

function RoleBadge({ role }) {
  const r = ROLES[role];
  if (!r) return null;
  const Icon = r.icon;
  return <span className={`inline-flex items-center gap-1 text-xs font-bold uppercase tracking-widest ${r.color}`}><Icon className="w-3.5 h-3.5" />{r.name}</span>;
}

function NightAction({ view, send, names }) {
  const g = view.game;
  const role = g.me.role;
  const verb = { mafia: 'Choose who the Mafia kill', doctor: 'Choose who to save', detective: 'Choose who to check' }[role];
  return (
    <div className="flex flex-col gap-4" data-testid="night-action">
      <h2 className="text-xl font-bold text-center flex items-center justify-center gap-2"><RoleBadge role={role} /> {verb}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {g.targets.map((t) => {
          const picked = g.mySelection === t.seat;
          const mafiaBy = g.mafiaPicks ? Object.entries(g.mafiaPicks).filter(([, v]) => v === t.seat).map(([k]) => names[k]) : [];
          return (
            <button
              key={t.seat}
              type="button"
              data-testid="target"
              data-name={names[t.seat]}
              disabled={t.disabled}
              title={t.reason || ''}
              onClick={() => send({ t: 'select', target: t.seat })}
              className={`rounded-xl px-3 py-3 border text-left transition-colors disabled:opacity-30 ${picked ? 'border-violet-300 bg-violet-500/25' : 'border-white/15 bg-white/5 hover:bg-white/10'}`}
            >
              <div className="font-bold truncate">{names[t.seat]}</div>
              {t.reason && <div className="text-xs text-white/50">{t.reason}</div>}
              {mafiaBy.length > 0 && <div className="text-xs text-red-300 truncate">← {mafiaBy.join(', ')}</div>}
            </button>
          );
        })}
      </div>
      {g.detectiveResult && (
        <p data-testid="detective-result" className={`text-center text-lg font-bold ${g.detectiveResult.isMafia ? 'text-red-400' : 'text-cyan-300'}`}>
          {names[g.detectiveResult.target]} {g.detectiveResult.isMafia ? 'IS Mafia' : 'is not Mafia'}
        </p>
      )}
    </div>
  );
}

function MorningNews({ g, names }) {
  const m = g.morning;
  if (!m) return null;
  return (
    <div data-testid="morning" className="text-center text-lg">
      {m.victim ? <p><b className="text-red-300">{names[m.victim]}</b> was killed in the night.</p> : <p>Nobody died last night{m.saved ? ' — the Doctor saved them!' : '.'}</p>}
      {/* the Detective's catch is announced by the narrator's voice only (ADR 0013): no text here */}
    </div>
  );
}

function VotePanel({ view, send, names }) {
  const g = view.game;
  const alive = g.players.filter((p) => p.alive);
  const votes = g.votes || {};
  const mine = votes[view.you];
  const canVote = g.me?.alive && view.flow?.step === 'voting';
  const count = (seat) => Object.values(votes).filter((v) => v === seat).length;
  return (
    <div className="flex flex-col gap-3" data-testid="vote-panel">
      <h2 className="text-xl font-bold text-center">{canVote ? 'Who is the Mafia? Vote to eliminate' : 'Voting'}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {alive.map((p) => (
          <button
            key={p.seat}
            type="button"
            data-testid="vote-target"
            data-name={names[p.seat]}
            disabled={!canVote || p.seat === view.you}
            onClick={() => send({ t: 'vote', target: p.seat })}
            className={`rounded-xl px-3 py-3 border text-left disabled:opacity-50 ${mine === p.seat ? 'border-violet-300 bg-violet-500/25' : 'border-white/15 bg-white/5 hover:bg-white/10'}`}
          >
            <div className="font-bold truncate">{names[p.seat]}{p.seat === view.you ? ' (you)' : ''}</div>
            <div className="text-xs text-white/60">{count(p.seat)} vote{count(p.seat) === 1 ? '' : 's'}</div>
          </button>
        ))}
        <button type="button" data-testid="vote-skip" disabled={!canVote} onClick={() => send({ t: 'vote', target: 'skip' })} className={`rounded-xl px-3 py-3 border text-left disabled:opacity-50 ${mine === 'skip' ? 'border-violet-300 bg-violet-500/25' : 'border-white/15 bg-white/5'}`}>
          <div className="font-bold">Skip</div><div className="text-xs text-white/60">{count('skip')}</div>
        </button>
      </div>
      {/* open votes */}
      <ul className="text-sm text-white/60 flex flex-col gap-0.5" data-testid="vote-list">
        {Object.entries(votes).map(([from, to]) => <li key={from}>{names[from]} → {to === 'skip' ? 'skip' : names[to]}</li>)}
      </ul>
    </div>
  );
}

function Results({ view, send, names }) {
  const g = view.game;
  const mafiaWon = g.winner === 'mafia';
  return (
    <div className="flex flex-col gap-4" data-testid="results">
      <h2 data-testid="winner" className={`text-3xl font-bold text-center ${mafiaWon ? 'text-red-400' : 'text-cyan-300'}`}>{mafiaWon ? 'The Mafia win' : 'The village wins'}</h2>
      {/* ended straight from the morning (no vote that day): say why */}
      {!g.vote && g.morning?.caught && <p data-testid="end-caught" className="text-center text-amber-200">The Detective caught <b>{names[g.morning.caught]}</b>.</p>}
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {g.players.map((p) => (
          <li key={p.seat} className={`flex items-center gap-2 rounded-lg px-3 py-2 bg-white/5 ${p.alive ? '' : 'opacity-50 line-through'}`}>
            <span className="truncate">{names[p.seat]}</span><span className="ml-auto"><RoleBadge role={p.role} /></span>
          </li>
        ))}
      </ul>
      {view.isHost ? (
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <LiquidButton data-testid="rematch" onClick={() => send({ t: 'rematch' })}><RotateCcw className="w-4 h-4" /> Rematch</LiquidButton>
          <button type="button" data-testid="to-lobby" onClick={() => send({ t: 'lobby' })} className="text-white/60 underline">Back to lobby</button>
        </div>
      ) : <p className="text-center text-white/50 text-sm">The host can start a rematch.</p>}
    </div>
  );
}

function GameView({ view, send, names, caption, serverNow }) {
  const g = view.game;
  if (!g) return <p className="text-center text-white/60">A game is in progress. You can join the next one.</p>;
  const step = view.flow?.step;
  const dead = g.me && !g.me.alive;
  const ended = g.phase === 'END';
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-sm">
        <span data-testid="phase" data-phase={g.phase} data-step={step} className="flex items-center gap-2 font-bold uppercase tracking-widest text-white/80">
          {g.night ? <Moon className="w-4 h-4 text-indigo-300" /> : ended ? null : <Sun className="w-4 h-4 text-amber-300" />}
          {STEP_TITLES[step] || g.phase} · Round {g.round}
        </span>
        {g.me && <span className="flex items-center gap-2">You: <RoleBadge role={g.me.role} /></span>}
        <Countdown deadline={['open', 'discuss', 'voting'].includes(step) ? view.flow.deadline : null} serverNow={serverNow} />
      </div>
      {caption && <p data-testid="caption" className="text-center text-violet-100/90 italic min-h-[1.5rem]">{caption}</p>}
      {dead && !ended && <p data-testid="you-are-out" className="text-center text-red-300">You are out. Stay quiet and watch.</p>}

      <div className={panel}>
        {g.night && (g.myTurn ? (
          <NightAction view={view} send={send} names={names} />
        ) : (
          <div data-testid="night-screen" className="py-10 text-center flex flex-col items-center gap-3">
            <Moon className="w-14 h-14 text-indigo-300/70" />
            <p className="text-xl">Eyes closed.</p>
            <p className="text-white/50 text-sm">{g.awake ? 'Your turn is coming…' : g.turnRole ? `The ${ROLES[g.turnRole]?.name || g.turnRole} is awake.` : 'Everyone sleeps.'}</p>
            {g.detectiveResult && <p data-testid="detective-result" className="font-bold">{names[g.detectiveResult.target]} {g.detectiveResult.isMafia ? 'IS Mafia' : 'is not Mafia'}</p>}
          </div>
        ))}
        {!g.night && !ended && (step === 'morning' || step === 'morningRead') && <MorningNews g={g} names={names} />}
        {!g.night && !ended && (step === 'discussCue' || step === 'discuss') && (
          <div className="flex flex-col gap-3 items-center" data-testid="discussion">
            <MorningNews g={g} names={names} />
            <p className="text-white/70">Talk it over on video. Who is lying?</p>
            {view.isHost && step === 'discuss' && <button type="button" data-testid="skip-discussion" onClick={() => send({ t: 'skipDiscussion' })} className="text-sm underline text-white/60">Go to the vote now</button>}
          </div>
        )}
        {g.phase === 'VOTE' && (step === 'voteCue' || step === 'voting') && <VotePanel view={view} send={send} names={names} />}
        {g.phase === 'VOTE' && (step === 'voteResult' || step === 'voteRead') && (
          <p data-testid="vote-result" className="text-center text-xl">
            {g.vote?.out ? <><b className="text-red-300">{names[g.vote.out]}</b> is voted out.</> : 'No one is voted out.'}
          </p>
        )}
        {ended && <Results view={view} send={send} names={names} />}
      </div>
      {g.detectiveLog?.length > 0 && !ended && (
        <div className="text-xs text-white/50 text-center">Your checks: {g.detectiveLog.map((e) => `${names[e.target] || e.target}: ${e.isMafia ? 'Mafia' : 'not Mafia'}`).join(' · ')}</div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ room shell (video + narration)
function useVideo(view, send) {
  const meshRef = useRef(null);
  const pending = useRef([]); // signals received before the mesh exists
  const [local, setLocal] = useState(null);
  const [mediaError, setMediaError] = useState(null);
  const [remotes, setRemotes] = useState({});
  const [prefs, setPrefs] = useState({ cam: true, mic: true });
  const stopRef = useRef(() => {});
  const joined = Boolean(view?.joined);
  const you = view?.you;

  useEffect(() => {
    if (!joined || !you) return undefined;
    let cancelled = false;
    let mesh = null;
    let watchdog = null;
    const start = async () => {
      // no config (offline / static preview): fall back to the Mesh's public STUN default
      const cfg = await fetch(apiUrl('/api/config')).then((r) => r.json()).catch(() => ({}));
      const { stream, error } = await getLocalMedia();
      if (cancelled) { stream?.getTracks().forEach((t) => t.stop()); return; }
      setMediaError(error);
      setLocal(stream);
      mesh = new Mesh({ self: you, iceServers: cfg.iceServers, send: (to, data) => send({ t: 'rtc', to, data }), onChange: () => setRemotes(mesh.streams()) });
      mesh.local = stream;
      meshRef.current = mesh;
      // offers that arrived while we were still asking for the camera
      pending.current.splice(0).forEach(([f, d]) => mesh.onSignal(f, d));
      watchdog = setInterval(() => mesh.check(), 3000);
      if (debugHooks()) window.__mesh = mesh;
      setRemotes({});
    };
    start().catch((e) => {
      // e.g. no WebRTC in this browser: the game still works, the tiles show names only
      console.warn('[video] could not start', e);
      if (!cancelled) setMediaError('unavailable');
    });
    stopRef.current = () => { cancelled = true; clearInterval(watchdog); mesh?.close(); meshRef.current = null; };
    return () => { stopRef.current(); setLocal(null); };
  }, [joined, you, send]);

  const connectedSeats = (view?.members || []).filter((m) => m.connected).map((m) => m.seat).join(',');
  useEffect(() => { meshRef.current?.sync(connectedSeats ? connectedSeats.split(',') : []); }, [connectedSeats, local]);

  const night = Boolean(view?.game?.night) && view?.status === 'game';
  const effective = { cam: prefs.cam && !night, mic: prefs.mic && !night };
  useEffect(() => { meshRef.current?.setMedia(effective); }, [effective.cam, effective.mic, local]); // eslint-disable-line react-hooks/exhaustive-deps

  const onRtc = useCallback((from, data) => {
    if (meshRef.current) meshRef.current.onSignal(from, data);
    else pending.current.push([from, data]);
  }, []);
  /** Hang up now: close every peer connection and stop camera/mic tracks (also a still-pending getUserMedia). */
  const stop = useCallback(() => { stopRef.current(); setLocal(null); setRemotes({}); }, []);
  return { local, remotes, mediaError, prefs, setPrefs, effective, night, onRtc, stop };
}

/** Host device speaks the server's cues and acks them; everyone shows the caption. */
function useNarration(view, send, names) {
  const [caption, setCaption] = useState('');
  const lastCue = useRef(null);
  const voice = narratorVoice(view?.settings?.lang, view?.settings?.voice);
  const isHost = Boolean(view?.isHost);
  useEffect(() => { narrator.setVoice(voice); }, [voice]);
  useEffect(() => (isHost ? narrator.subscribe(setCaption) : undefined), [isHost]);
  // prepare spoken names once a game starts (skipped in fast/test rooms: it downloads a voice model)
  const gameKey = view?.status === 'game' ? view.game?.players.map((p) => p.seat).join() : '';
  useEffect(() => {
    if (isHost && gameKey && !view.settings.fast) {
      // background download; on failure names fall back to speechSynthesis / "look at the screen"
      nameVoice.prepare(voice, Object.values(names)).catch((e) => console.warn('[names] voice prepare failed', e));
    }
  }, [isHost, gameKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const cue = view?.flow?.cue;
  useEffect(() => {
    if (!cue || cue.id === lastCue.current) return;
    lastCue.current = cue.id;
    const items = cue.clips.map((c) => (typeof c === 'object' && c ? { name: names[c.name] || c.name } : c));
    if (isHost) {
      narrator.stop(); // the server moved on: drop whatever is left of the previous cue
      const ack = () => send({ t: 'cueDone', id: cue.id });
      // a clip that cannot play (autoplay block, network) must not hold the table: ack and move on
      narrator.say(items).then(ack, (e) => { console.warn('[narrator] cue failed', e); ack(); });
    } else {
      const lines = linesFor(voice);
      setCaption(captionedItems(items).map((c) => (typeof c === 'object' ? c.name : lines[c] || '')).join(' ').trim());
    }
  }, [cue?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => narrator.stop(), []);
  return caption;
}

/** Exit icon (top corner of every room screen) + "Leave room?" confirm. */
function LeaveButton({ inGame, onConfirm }) {
  const [open, setOpen] = useState(false);
  const stayRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    stayRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <>
      <motion.button
        type="button"
        data-testid="leave"
        aria-label="Leave room"
        title="Leave room"
        whileTap={{ scale: 0.92 }}
        onClick={() => setOpen(true)}
        className="shrink-0 w-11 h-11 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-white/70 hover:text-red-200 hover:bg-red-500/15 hover:border-red-400/40 transition-colors"
      >
        <LogOut className="w-5 h-5" />
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            key="leave-confirm"
            data-testid="leave-confirm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          >
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="leave-title"
              aria-describedby="leave-desc"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              className={`${panel} w-full max-w-sm flex flex-col gap-4 bg-black/70`}
            >
              <div className="flex items-center gap-3">
                <span className="w-11 h-11 shrink-0 rounded-full bg-red-500/15 border border-red-400/30 flex items-center justify-center text-red-200"><LogOut className="w-5 h-5" /></span>
                <h3 id="leave-title" className="text-xl font-bold text-white">Leave room?</h3>
              </div>
              <p id="leave-desc" className="text-sm text-white/70">
                {inGame
                  ? "You'll be out of this game: you count as eliminated and can't rejoin it as a player. Your camera and mic turn off."
                  : 'You can join again later with the room code. Your camera and mic turn off.'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button ref={stayRef} type="button" data-testid="leave-stay" onClick={() => setOpen(false)} className="min-h-11 rounded-lg bg-white/5 border border-white/15 px-4 py-3 font-semibold text-white hover:bg-white/10">
                  Stay
                </button>
                <button type="button" data-testid="leave-confirm-btn" onClick={() => { setOpen(false); onConfirm(); }} className="min-h-11 rounded-lg bg-red-600/80 border border-red-400/40 px-4 py-3 font-bold text-white hover:bg-red-600">
                  Leave
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Room({ code, identity, opts, onLeave, onIdentity }) {
  const [name, setName] = useState(identity.name);
  const videoRef = useRef(null);
  const room = useRoom({ code, gid: identity.gid, name, create: opts.create, fast: opts.fast, onRtc: (f, d) => videoRef.current?.(f, d) });
  const { view, error, clearError, fatal, online, unreachable, retry, send, leave, serverNow } = room;
  const v = useVideo(view, send);
  videoRef.current = v.onRtc;
  const names = useMemo(() => Object.fromEntries((view?.members || []).map((m) => [m.seat, m.name])), [view?.members]);
  const caption = useNarration(view, send, names);
  useWakeLock(view?.status === 'game' || view?.status === 'deal');
  useEffect(() => { if (debugHooks()) window.__mafiaView = view; }, [view]); // e2e / debugging

  // keep the URL shareable and the stored name in sync with the room
  useEffect(() => { if (view?.code && window.location.pathname !== `/r/${view.code}`) window.history.replaceState({}, '', `/r/${view.code}${window.location.search}`); }, [view?.code]);
  const myName = view?.members.find((m) => m.seat === view.you)?.name;
  useEffect(() => { if (myName && myName !== identity.name) onIdentity({ ...identity, name: myName }); }, [myName]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (fatal) onLeave(fatal); }, [fatal]);
  /** Exit button: tell the server, hang up camera/mic and peers, close the socket for good, go home. */
  const exitRoom = () => {
    v.stop();
    narrator.stop();
    leave();
    onLeave(null);
  }; // eslint-disable-line react-hooks/exhaustive-deps

  const joinError = error?.action === 'join' ? error : null;
  if (joinError && !view?.joined) {
    if (joinError.code === 'room_exists') { onLeave(null, true); return null; }
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className={`${panel} w-full max-w-md flex flex-col gap-4`} data-testid="join-name-error">
          <h2 className="text-xl font-bold">Join room {code}</h2>
          <NameForm
            key={joinError.at}
            initial={name}
            submitLabel="Join"
            error={joinError.code}
            suggestions={joinError.suggestions || []}
            onSave={(n) => { setName(n); clearError(); send({ t: 'join', name: n }); }}
          />
          <button type="button" onClick={() => onLeave(null)} className="text-sm text-white/50 underline">Back</button>
        </div>
      </div>
    );
  }
  if (!view?.joined && unreachable && !online) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className={`${panel} w-full max-w-md flex flex-col gap-4 text-center`} data-testid="server-unreachable" role="alert">
          <h2 className="text-xl font-bold">Can&apos;t reach the room server</h2>
          <p className="text-sm text-white/70">
            Online rooms need the Mafia Dealer room server, and it isn&apos;t answering.
            {ROOMS_HOST ? ` (${ROOMS_HOST})` : ' This site may be a static preview without one.'} Check your connection and try again.
          </p>
          <PrimaryButton onClick={retry} data-testid="server-retry">Try again</PrimaryButton>
          <button type="button" onClick={() => onLeave(null)} className="text-sm text-white/50 underline">Back</button>
        </div>
      </div>
    );
  }
  if (!view?.joined) return <div className="min-h-screen flex items-center justify-center text-white/60" data-testid="connecting">{online ? 'Joining…' : 'Connecting…'}</div>;

  const deadSeats = new Set((view.game?.players || []).filter((p) => !p.alive).map((p) => p.seat));
  const toastError = error && error.action !== 'join' && error.action !== 'rename' && Date.now() - error.at < 4000 ? error : null;

  return (
    <div className="min-h-screen flex flex-col gap-3 p-3 sm:p-5 max-w-5xl mx-auto" data-testid="room" data-status={view.status}>
      <div className="flex items-center gap-2">
        <span className="font-mono tracking-[0.25em] font-bold">{view.code}</span>
        {!online && <span className="text-xs text-amber-300">reconnecting…</span>}
        <span className="ml-auto flex items-center gap-2">
          {v.mediaError && <span data-testid="media-error" className="text-xs text-amber-200/80">{v.mediaError === 'denied' ? 'Camera blocked: others can still see you as a name tile' : v.mediaError === 'no_camera' ? 'No camera found' : 'Video unavailable'}</span>}
          <button type="button" data-testid="toggle-mic" aria-label={v.prefs.mic ? 'Mute mic' : 'Unmute mic'} disabled={!v.local} onClick={() => v.setPrefs((p) => ({ ...p, mic: !p.mic }))} className="p-2 rounded-full bg-white/5 border border-white/10 disabled:opacity-30">
            {v.effective.mic ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4 text-red-300" />}
          </button>
          <button type="button" data-testid="toggle-cam" aria-label={v.prefs.cam ? 'Camera off' : 'Camera on'} disabled={!v.local} onClick={() => v.setPrefs((p) => ({ ...p, cam: !p.cam }))} className="p-2 rounded-full bg-white/5 border border-white/10 disabled:opacity-30">
            {v.effective.cam ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4 text-red-300" />}
          </button>
          <LeaveButton inGame={view.status !== 'lobby' && !(view.status === 'game' && view.game?.phase === 'END')} onConfirm={exitRoom} />
        </span>
      </div>
      {v.night && <p className="text-center text-xs text-indigo-200/70" data-testid="night-media-note">Night: cameras and mics are off.</p>}
      <VideoGrid view={view} local={v.local} remotes={v.remotes} media={v.effective} asleep={v.night} deadSeats={deadSeats} />
      <AnimatePresence>
        {toastError && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="toast" className="text-center text-sm text-amber-200">
            {ERRORS[toastError.code] || toastError.code}
          </motion.p>
        )}
      </AnimatePresence>
      {view.status === 'lobby' && <Lobby view={view} send={send} error={error} clearError={clearError} />}
      {view.status === 'deal' && <DealPick view={view} send={send} names={names} />}
      {view.status === 'game' && <GameView view={view} send={send} names={names} caption={caption} serverNow={serverNow} />}
    </div>
  );
}

// ------------------------------------------------------------------ app
export default function OnlineApp({ onExit }) {
  const [identity, setIdentity] = useState(() => loadIdentity());
  const [google, setGoogle] = useState(false);
  const [roomCode, setRoomCode] = useState(() => codeFromPath());
  const [opts, setOpts] = useState({});
  const [notice, setNotice] = useState(null);
  const [named, setNamed] = useState(() => validateName(loadIdentity().name).ok);

  useEffect(() => { fetch(apiUrl('/api/config')).then((r) => r.json()).then((c) => setGoogle(Boolean(c.google))).catch(() => {}); }, []);
  useEffect(() => {
    const onPop = () => { setRoomCode(codeFromPath()); setOpts({}); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  // unlock audio inside the first tap (mobile autoplay rules)
  useEffect(() => {
    const unlock = () => { narrator.unlock(); unlockAmbient(); };
    window.addEventListener('pointerdown', unlock, { capture: true });
    return () => window.removeEventListener('pointerdown', unlock, { capture: true });
  }, []);

  const updateIdentity = (next) => { saveIdentity(next); setIdentity(next); };

  if (!named) {
    return <NameScreen identity={identity} google={google} onSave={(name) => { updateIdentity({ ...identity, name }); setNamed(true); }} />;
  }
  if (!roomCode) {
    return (
      <Home
        identity={identity}
        notice={notice}
        onExit={onExit}
        onRename={(name) => updateIdentity({ ...identity, name })}
        onEnter={(code, o) => { setNotice(null); setOpts(o); go(`/r/${code}`); setRoomCode(code); }}
      />
    );
  }
  return (
    <Room
      key={`${roomCode}:${opts.create ? 'c' : 'j'}`}
      code={roomCode}
      identity={identity}
      opts={opts}
      onIdentity={updateIdentity}
      onLeave={(why, retryCreate) => {
        if (retryCreate) { const c = randomRoomCode(); go(`/r/${c}`); setRoomCode(c); return; }
        setNotice(why);
        go('/online');
        setRoomCode('');
        setOpts({});
      }}
    />
  );
}
