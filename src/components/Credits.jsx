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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Dismiss credits"
        data-testid="credits-backdrop"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 w-full h-full cursor-default bg-black/70 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="credits-title"
        className="relative w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/80 shadow-2xl text-left"
      >
        {/* the header stays put and only the body scrolls, so Close is reachable on short screens */}
        <div className="flex shrink-0 items-start justify-between gap-3 px-6 pt-6 pb-1">
          <h2 id="credits-title" className="text-2xl font-bold tracking-wide">Credits &amp; licences</h2>
          <button type="button" onClick={onClose} aria-label="Close credits" data-testid="credits-close" className="-mr-2.5 -mt-1 p-2.5 text-white/60 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <div data-testid="credits-scroll" className="min-h-0 overflow-y-auto px-6 pb-6">
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
        className={`px-3 py-3 text-xs tracking-widest uppercase text-white/55 hover:text-white/90 underline-offset-4 hover:underline ${className}`}
      >
        Credits &amp; licences
      </button>
      {open && <CreditsPanel onClose={() => setOpen(false)} />}
    </>
  );
}
