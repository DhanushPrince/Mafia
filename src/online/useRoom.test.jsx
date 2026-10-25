// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

// PartySocket stand-in: records options and lets the test drive open / message / close.
const sockets = vi.hoisted(() => []);
vi.mock('partysocket', () => ({
  default: class FakeSocket extends EventTarget {
    constructor(opts) {
      super();
      this.opts = opts;
      this.readyState = 0;
      this.sent = [];
      this.close = vi.fn((code, reason) => { this.readyState = 3; this.closedWith = { code, reason }; });
      this.reconnect = vi.fn();
      sockets.push(this);
    }
    send(s) { this.sent.push(JSON.parse(s)); }
    open() { this.readyState = 1; this.dispatchEvent(new Event('open')); }
    message(m) { this.dispatchEvent(new MessageEvent('message', { data: typeof m === 'string' ? m : JSON.stringify(m) })); }
    drop(code) { this.readyState = 3; const e = new Event('close'); e.code = code; this.dispatchEvent(e); }
  },
}));

const { default: useRoom, CONNECT_TIMEOUT_MS } = await import('./useRoom.js');

const GID = 'abcdefghijklmnopqrst';
const sock = () => sockets.at(-1);
const view = (extra = {}) => ({ code: 'KQTZ', you: 's1', joined: true, serverNow: Date.now() + 5000, members: [], ...extra });

beforeEach(() => { sockets.length = 0; vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('useRoom', () => {
  it('does not connect without a room code or guest id', () => {
    renderHook(() => useRoom({ code: '', gid: GID }));
    renderHook(() => useRoom({ code: 'KQTZ', gid: '' }));
    expect(sockets).toHaveLength(0);
  });

  it('connects to the room party with gid, name and the create/fast flags', () => {
    renderHook(() => useRoom({ code: 'KQTZ', gid: GID, name: 'Priya', create: true, fast: true }));
    const { opts } = sock();
    expect(opts).toMatchObject({ party: 'room', room: 'KQTZ', host: window.location.host });
    expect(opts.query()).toEqual({ gid: GID, name: 'Priya', create: '1', fast: '1' });
  });

  it('re-reads the latest name on every reconnect without reconnecting on rename', () => {
    const { rerender } = renderHook((p) => useRoom(p), { initialProps: { code: 'KQTZ', gid: GID, name: 'Priya' } });
    rerender({ code: 'KQTZ', gid: GID, name: 'Divya' });
    expect(sockets).toHaveLength(1);
    expect(sock().opts.query()).toEqual({ gid: GID, name: 'Divya' });
  });

  it('tracks online state and the server view, and corrects for the server clock', () => {
    const { result } = renderHook(() => useRoom({ code: 'KQTZ', gid: GID }));
    expect(result.current.online).toBe(false);
    act(() => sock().open());
    expect(result.current.online).toBe(true);
    const v = view();
    act(() => sock().message({ t: 'view', view: v }));
    expect(result.current.view).toEqual(v);
    expect(result.current.serverNow() - Date.now()).toBe(5000);
    act(() => sock().drop(1006));
    expect(result.current.online).toBe(false);
    expect(sock().close).not.toHaveBeenCalled(); // a network drop: PartySocket reconnects by itself
  });

  it('ignores malformed frames', () => {
    const { result } = renderHook(() => useRoom({ code: 'KQTZ', gid: GID }));
    act(() => sock().message('{nope'));
    expect(result.current.view).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('keeps errors until cleared; a successful join clears a join error only', () => {
    const { result } = renderHook(() => useRoom({ code: 'KQTZ', gid: GID }));
    act(() => sock().message({ t: 'error', action: 'join', code: 'name_taken' }));
    expect(result.current.error).toMatchObject({ action: 'join', code: 'name_taken', at: Date.now() });
    act(() => sock().message({ t: 'view', view: view({ joined: false }) }));
    expect(result.current.error?.code).toBe('name_taken');
    act(() => sock().message({ t: 'view', view: view() }));
    expect(result.current.error).toBeNull();
    act(() => sock().message({ t: 'error', action: 'pick', code: 'card_taken' }));
    act(() => sock().message({ t: 'view', view: view() }));
    expect(result.current.error?.code).toBe('card_taken');
    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });

  it('a fatal message ends the session (no reconnect)', () => {
    const { result } = renderHook(() => useRoom({ code: 'KQTZ', gid: GID }));
    act(() => sock().message({ t: 'fatal', code: 'kicked' }));
    expect(result.current.fatal).toBe('kicked');
    expect(sock().close).toHaveBeenCalled();
  });

  it.each([
    [4004, 'no_room'],
    [4003, 'kicked'],
    [4009, null],
    [4001, null],
  ])('close code %i stops reconnecting (fatal=%s)', (code, fatal) => {
    const { result } = renderHook(() => useRoom({ code: 'KQTZ', gid: GID }));
    act(() => sock().drop(code));
    expect(sock().close).toHaveBeenCalled();
    expect(result.current.fatal).toBe(fatal);
  });

  it("the server's {t:'left'} closes the socket for good", () => {
    renderHook(() => useRoom({ code: 'KQTZ', gid: GID }));
    act(() => sock().message({ t: 'left' }));
    expect(sock().close).toHaveBeenCalled();
  });

  it('passes rtc signals to the latest onRtc callback', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook((p) => useRoom(p), { initialProps: { code: 'KQTZ', gid: GID, onRtc: first } });
    rerender({ code: 'KQTZ', gid: GID, onRtc: second });
    act(() => sock().message({ t: 'rtc', from: 's2', data: { sdp: 1 } }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('s2', { sdp: 1 });
  });

  it('send() only writes while the socket is open', () => {
    const { result } = renderHook(() => useRoom({ code: 'KQTZ', gid: GID }));
    act(() => result.current.send({ t: 'ready', ready: true }));
    expect(sock().sent).toEqual([]);
    act(() => sock().open());
    act(() => result.current.send({ t: 'ready', ready: true }));
    expect(sock().sent).toEqual([{ t: 'ready', ready: true }]);
  });

  it('flags the server unreachable after the timeout; retry restarts the timer and reconnects', () => {
    const { result } = renderHook(() => useRoom({ code: 'KQTZ', gid: GID }));
    act(() => vi.advanceTimersByTime(CONNECT_TIMEOUT_MS - 1));
    expect(result.current.unreachable).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.unreachable).toBe(true);
    act(() => result.current.retry());
    expect(result.current.unreachable).toBe(false);
    expect(sock().reconnect).toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(CONNECT_TIMEOUT_MS));
    expect(result.current.unreachable).toBe(true);
    act(() => sock().open());
    expect(result.current.unreachable).toBe(false);
  });

  it('opening in time cancels the unreachable timer', () => {
    const { result } = renderHook(() => useRoom({ code: 'KQTZ', gid: GID }));
    act(() => sock().open());
    act(() => vi.advanceTimersByTime(CONNECT_TIMEOUT_MS * 2));
    expect(result.current.unreachable).toBe(false);
  });

  it('leave() sends {t:leave} before closing with 1000, then send/retry/leave are no-ops', () => {
    const { result } = renderHook(() => useRoom({ code: 'KQTZ', gid: GID }));
    const s = sock();
    act(() => s.open());
    act(() => result.current.leave());
    expect(s.sent).toEqual([{ t: 'leave' }]);
    expect(s.closedWith).toEqual({ code: 1000, reason: 'left room' });
    act(() => { result.current.send({ t: 'ping' }); result.current.retry(); result.current.leave(); });
    expect(s.sent).toHaveLength(1);
    expect(s.reconnect).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(CONNECT_TIMEOUT_MS * 2));
    expect(result.current.unreachable).toBe(false);
  });

  it('leave() before the socket opened just closes it', () => {
    const { result } = renderHook(() => useRoom({ code: 'KQTZ', gid: GID }));
    act(() => result.current.leave());
    expect(sock().sent).toEqual([]);
    expect(sock().close).toHaveBeenCalledWith(1000, 'left room');
  });

  it('closes the socket on unmount and opens a new one for a new room', () => {
    const { rerender, unmount } = renderHook((p) => useRoom(p), { initialProps: { code: 'KQTZ', gid: GID } });
    const first = sock();
    rerender({ code: 'ABCD', gid: GID });
    expect(first.close).toHaveBeenCalled();
    expect(sockets).toHaveLength(2);
    unmount();
    expect(sock().close).toHaveBeenCalled();
  });
});
