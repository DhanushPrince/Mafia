import { useEffect, useRef, useState, useCallback } from 'react';
import PartySocket from 'partysocket';
import { socketHost } from './roomsHost.js';

/** Show "can't reach the room server" if the first connection takes longer than this. */
export const CONNECT_TIMEOUT_MS = 8000;

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
  const [unreachable, setUnreachable] = useState(false);
  const timerRef = useRef(null);
  const sockRef = useRef(null);
  const clockRef = useRef(0); // serverNow - Date.now()
  const rtcRef = useRef(onRtc);
  rtcRef.current = onRtc;
  const nameRef = useRef(name);
  nameRef.current = name;

  useEffect(() => {
    if (!code || !gid) return undefined;
    setFatal(null);
    setUnreachable(false);
    const sock = new PartySocket({
      host: socketHost(),
      party: 'room',
      room: code,
      // re-read on every (re)connect: the name can change in the lobby
      query: () => ({ gid, name: nameRef.current || '', ...(create ? { create: '1' } : {}), ...(fast ? { fast: '1' } : {}) }),
    });
    sockRef.current = sock;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setUnreachable(true), CONNECT_TIMEOUT_MS);
    sock.addEventListener('open', () => { setOnline(true); setUnreachable(false); clearTimeout(timerRef.current); });
    sock.addEventListener('close', (e) => {
      setOnline(false);
      if (e.code === 4004) { setFatal('no_room'); sock.close(); }
      if (e.code === 4003) { setFatal('kicked'); sock.close(); }
      if (e.code === 4009) sock.close();
      if (e.code === 4001) sock.close(); // we left on purpose: never reconnect
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
      else if (m.t === 'left') sock.close();
    });
    return () => { clearTimeout(timerRef.current); sock.close(); sockRef.current = null; };
  }, [code, gid, create, fast]);

  const send = useCallback((msg) => {
    const s = sockRef.current;
    if (s && s.readyState === 1) s.send(JSON.stringify(msg));
  }, []);

  /** Try again now (after the timeout message), and restart the timeout. */
  const retry = useCallback(() => {
    const s = sockRef.current;
    if (!s) return;
    setUnreachable(false);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setUnreachable(true), CONNECT_TIMEOUT_MS);
    s.reconnect();
  }, []);

  /**
   * Leave the room on purpose: tell the server (it frees the seat / takes us out of the game), then
   * close the socket for good. PartySocket's close() also stops its auto-reconnect.
   */
  const leave = useCallback(() => {
    const s = sockRef.current;
    clearTimeout(timerRef.current);
    if (!s) return;
    if (s.readyState === 1) s.send(JSON.stringify({ t: 'leave' })); // queued before the close frame
    s.close(1000, 'left room');
    sockRef.current = null;
  }, []);

  const serverNow = useCallback(() => Date.now() + clockRef.current, []);
  return { view, error, clearError: () => setError(null), fatal, online, unreachable, retry, send, leave, serverNow };
}
