import { useEffect, useRef, useState, useCallback } from 'react';
import PartySocket from 'partysocket';

/**
 * Live connection to one room. Returns the latest per-seat view from the server, the last error,
 * a fatal state (no_room / kicked), and `send`. PartySocket reconnects on its own; the same guest
 * id brings the same seat back.
 */
export default function useRoom({ code, gid, name, create, fast, onRtc }) {
  const [view, setView] = useState(null);
  const [error, setError] = useState(null);
  const [fatal, setFatal] = useState(null);
  const [online, setOnline] = useState(false);
  const sockRef = useRef(null);
  const clockRef = useRef(0); // serverNow - Date.now()
  const rtcRef = useRef(onRtc);
  rtcRef.current = onRtc;
  const nameRef = useRef(name);
  nameRef.current = name;

  useEffect(() => {
    if (!code || !gid) return undefined;
    setFatal(null);
    const sock = new PartySocket({
      host: window.location.host,
      party: 'room',
      room: code,
      // re-read on every (re)connect: the name can change in the lobby
      query: () => ({ gid, name: nameRef.current || '', ...(create ? { create: '1' } : {}), ...(fast ? { fast: '1' } : {}) }),
    });
    sockRef.current = sock;
    sock.addEventListener('open', () => setOnline(true));
    sock.addEventListener('close', (e) => {
      setOnline(false);
      if (e.code === 4004) { setFatal('no_room'); sock.close(); }
      if (e.code === 4003) { setFatal('kicked'); sock.close(); }
      if (e.code === 4009) sock.close();
    });
    sock.addEventListener('message', (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'view') {
        clockRef.current = m.view.serverNow - Date.now();
        setView(m.view);
        if (m.view.joined) setError((err) => (err?.action === 'join' ? null : err));
      } else if (m.t === 'error') setError({ ...m, at: Date.now() });
      else if (m.t === 'fatal') { setFatal(m.code); sock.close(); }
      else if (m.t === 'rtc') rtcRef.current?.(m.from, m.data);
    });
    return () => { sock.close(); sockRef.current = null; };
  }, [code, gid, create, fast]);

  const send = useCallback((msg) => {
    const s = sockRef.current;
    if (s && s.readyState === 1) s.send(JSON.stringify(msg));
  }, []);

  const serverNow = useCallback(() => Date.now() + clockRef.current, []);
  return { view, error, clearError: () => setError(null), fatal, online, send, serverNow };
}
