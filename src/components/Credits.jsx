import { useEffect, useState } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { CREDITS } from '../credits';

const A = ({ href, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-violet-300 underline decoration-violet-300/40 underline-offset-2 hover:text-white">
    {children}<ExternalLink size={12} aria-hidden="true" />
  </a>
);

/** Voices, models and assets the app uses, with their licences (see THIRD_PARTY_NOTICES.md). */
export function CreditsPanel({ onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="credits-title"
        className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-white/10 bg-black/80 p-6 shadow-2xl text-left"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} aria-label="Close credits" className="absolute top-4 right-4 p-1 text-white/60 hover:text-white">
          <X size={20} />
        </button>
        <h2 id="credits-title" className="text-2xl font-bold tracking-wide mb-1">Credits &amp; licences</h2>
        <p className="text-sm text-white/60 mb-5">
          Mafia Dealer is MIT licensed, © 2026 Dhanush R. It uses these voices, models and assets:
        </p>
        <ul className="flex flex-col gap-4">
          {CREDITS.map((c) => (
            <li key={c.id} data-testid={`credit-${c.id}`} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h3 className="font-bold text-violet-100">{c.title}</h3>
              <p className="text-sm text-white/80 mt-1">{c.text}</p>
              <p className="text-sm mt-2">Licence: <A href={c.licenseUrl}>{c.license}</A></p>
              <p className="text-sm mt-1 flex flex-wrap gap-x-3 gap-y-1">
                {c.links.map((l) => <A key={l.url} href={l.url}>{l.label}</A>)}
              </p>
            </li>
          ))}
        </ul>
        <p className="text-xs text-white/50 mt-5">
          Open-source libraries (React, Framer Motion, Lucide, kokoro-js, ONNX Runtime Web, PartyKit and others) are listed with their licences in THIRD_PARTY_NOTICES.md in the source repository.
        </p>
      </div>
    </div>
  );
}

/** Small "Credits" link that opens the panel. */
export default function Credits({ className = '' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-testid="credits-link"
        onClick={() => setOpen(true)}
        className={`text-xs tracking-widest uppercase text-white/55 hover:text-white/90 underline-offset-4 hover:underline ${className}`}
      >
        Credits &amp; licences
      </button>
      {open && <CreditsPanel onClose={() => setOpen(false)} />}
    </>
  );
}
