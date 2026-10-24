import { useEffect, useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import { nameVoice } from '../audio/nameVoice';

const mb = (b) => `${Math.round(b / 1e6)} MB`;

/** Small, non-blocking status for the in-browser name voice (narrator mode only). */
export default function NameVoiceStatus({ className = '' }) {
  const [s, setS] = useState(nameVoice.status);
  useEffect(() => nameVoice.subscribe(setS), []);
  if (s.state === 'idle' || s.state === 'off' || s.state === 'error') return null;
  let text;
  if (s.state === 'ready') text = 'Narrator voice ready';
  else if (s.state === 'loading') text = `Preparing narrator voice… ${s.size ? `${Math.min(99, Math.round((100 * s.loaded) / s.size))}% of ${mb(s.size)}` : ''}`;
  else text = `Preparing narrator voice… ${s.done}/${s.total} names`;
  return (
    <p
      data-testid="name-voice-status"
      data-state={s.state}
      role="status"
      className={`flex items-center justify-center gap-2 text-xs font-mono text-violet-300/60 ${className}`}
    >
      {s.state === 'ready' ? <Check size={14} className="text-teal-300/70" /> : <Loader2 size={14} className="animate-spin" />}
      {text}
    </p>
  );
}
