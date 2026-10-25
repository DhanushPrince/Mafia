import { useEffect, useRef } from 'react';
import { MicOff, VideoOff, Moon, Skull, Crown, WifiOff } from 'lucide-react';

function Tile({ name, stream, self, camOn, micOn, asleep, dead, host, offline, speaking }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream || null;
  }, [stream]);
  const showVideo = stream && camOn && !asleep && !offline;
  return (
    <div
      data-testid="video-tile"
      data-name={name}
      data-live={showVideo ? '1' : '0'}
      className={`relative shrink-0 w-24 h-[4.5rem] sm:w-32 sm:h-24 rounded-xl overflow-hidden border ${speaking ? 'border-violet-400' : 'border-white/10'} bg-[#17141f]/90`}
    >
      {/* the element stays mounted so audio keeps playing while the picture is hidden */}
      <video ref={ref} autoPlay playsInline muted={self} className={`w-full h-full object-cover ${self ? '-scale-x-100' : ''} ${showVideo ? '' : 'invisible'}`} />
      {!showVideo && (
        <div className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-white/40">
          {asleep ? <Moon className="w-7 h-7 text-indigo-300/60" /> : (name || '?').slice(0, 1).toUpperCase()}
        </div>
      )}
      {dead && <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><Skull className="w-7 h-7 text-red-400/80" /></div>}
      <div className="absolute bottom-0 inset-x-0 px-1.5 py-0.5 bg-black/60 text-[11px] leading-tight text-white/90 flex items-center gap-1">
        {host && <Crown className="w-3 h-3 text-amber-300 shrink-0" />}
        <span className="truncate">{name}{self ? ' (you)' : ''}</span>
        <span className="ml-auto flex gap-0.5 shrink-0">
          {offline && <WifiOff className="w-3 h-3 text-red-300" />}
          {!micOn && <MicOff className="w-3 h-3 text-red-300" />}
          {!camOn && !asleep && <VideoOff className="w-3 h-3 text-white/60" />}
        </span>
      </div>
    </div>
  );
}

/** One tile per seated member; own tile first. */
export default function VideoGrid({ view, local, remotes, media, asleep, deadSeats }) {
  const members = view.members.filter((m) => !m.spectator || m.seat === view.you);
  const ordered = [...members.filter((m) => m.seat === view.you), ...members.filter((m) => m.seat !== view.you)];
  return (
    <div data-testid="video-grid" className="flex gap-2 overflow-x-auto pb-1 px-1 justify-start sm:justify-center">
      {ordered.map((m) => {
        const self = m.seat === view.you;
        const r = remotes[m.seat];
        return (
          <Tile
            key={m.seat}
            name={m.name}
            self={self}
            stream={self ? local : r?.stream}
            camOn={self ? media.cam && Boolean(local?.getVideoTracks().length) : r?.media?.cam !== false && Boolean(r?.stream)}
            micOn={self ? media.mic && Boolean(local?.getAudioTracks().length) : r?.media?.mic !== false}
            asleep={asleep}
            dead={deadSeats.has(m.seat)}
            host={m.seat === view.hostSeat}
            offline={!m.connected}
          />
        );
      })}
    </div>
  );
}
