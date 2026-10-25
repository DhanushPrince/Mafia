import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LOBBY_GRACE_MS, IDLE_EXPIRE_MS, MIN_ALARM_DELAY_MS } from '../src/online/roomLogic.js';

// PartyServer's base class needs the workerd runtime; the Room only uses ctx, name and getConnections.
vi.mock('partyserver', () => ({
  Server: class {
    constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  },
}));

const { Room, seatFromGuestId } = await import('./room.js');

const T0 = Date.UTC(2026, 0, 1, 12);

/** Durable Object storage with a count of everything that bills as rows_written. */
function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial.data || {}));
  const s = {
    data,
    alarm: initial.alarm ?? null,
    writes: { put: 0, setAlarm: 0, deleteAlarm: 0, deleteAll: 0 },
    get: vi.fn(async (k) => structuredClone(data.get(k))),
    put: vi.fn(async (k, v) => { s.writes.put++; data.set(k, structuredClone(v)); }),
    getAlarm: vi.fn(async () => s.alarm),
    setAlarm: vi.fn(async (t) => { s.writes.setAlarm++; s.alarm = t; }),
    deleteAlarm: vi.fn(async () => { s.writes.deleteAlarm++; s.alarm = null; }),
    deleteAll: vi.fn(async () => { s.writes.deleteAll++; data.clear(); }),
  };
  return s;
}

/** A Room with fake sockets: `connect(gid, query)` mimics a WebSocket upgrade tagged with the seat. */
async function makeRoom({ storage = fakeStorage(), code = 'KQTZ' } = {}) {
  const room = new Room({ storage }, {});
  room.name = code;
  const conns = [];
  room.getConnections = (tag) => (tag ? conns.filter((c) => c.tag === tag) : conns)[Symbol.iterator]();
  await room.onStart();

  const connect = async (gid, query = {}) => {
    const seat = /^[A-Za-z0-9_-]{16,64}$/.test(gid) ? await seatFromGuestId(gid) : 'none';
    const conn = {
      tag: seat,
      state: null,
      sent: [],
      closed: null,
      setState(st) { this.state = st; },
      send(str) { if (this.closed) throw new Error('closed'); this.sent.push(JSON.parse(str)); },
      close: vi.fn(function close(code, reason) { this.closed = { code, reason }; }),
    };
    expect(room.getConnectionTags(conn, { request: { headers: new Headers({ 'x-seat': seat }) } })).toEqual([seat]);
    conns.push(conn);
    const qs = new URLSearchParams({ gid, ...query });
    await room.onConnect(conn, { request: { url: `https://x/parties/room/${code}?${qs}` } });
    return conn;
  };
  const disconnect = async (conn) => {
    conns.splice(conns.indexOf(conn), 1);
    await room.onClose(conn);
  };
  // the runtime clears a fired alarm before calling the handler
  const fire = async () => { storage.alarm = null; await room.onAlarm(); };
  const msg = (conn, m) => room.onMessage(conn, typeof m === 'string' ? m : JSON.stringify(m));
  return { room, storage, conns, connect, disconnect, msg, fire };
}

const gid = (n) => `guest-${String(n).padStart(2, '0')}-abcdefghijkl`;
const lastView = (conn) => [...conn.sent].reverse().find((m) => m.t === 'view')?.view;
const totalWrites = (s) => Object.values(s.writes).reduce((a, b) => a + b, 0);

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); });
afterEach(() => { vi.useRealTimers(); });

describe('seatFromGuestId', () => {
  it('derives a stable 18-hex-char seat that differs per guest id', async () => {
    const a = await seatFromGuestId(gid(1));
    expect(a).toMatch(/^[0-9a-f]{18}$/);
    expect(await seatFromGuestId(gid(1))).toBe(a);
    expect(await seatFromGuestId(gid(2))).not.toBe(a);
  });
});

describe('Room: connect', () => {
  it('answers the health ping without touching storage', async () => {
    const { room, storage } = await makeRoom();
    expect(await room.ping()).toBe(T0);
    expect(totalWrites(storage)).toBe(0);
  });

  it('rejects a malformed guest id with bad_guest / 4000', async () => {
    const { connect, storage } = await makeRoom();
    const c = await connect('short');
    expect(c.sent).toEqual([{ t: 'fatal', code: 'bad_guest' }]);
    expect(c.closed.code).toBe(4000);
    expect(totalWrites(storage)).toBe(0);
  });

  it('refuses to join a room that does not exist (no_room / 4004)', async () => {
    const { connect, storage } = await makeRoom();
    const c = await connect(gid(1), { name: 'Arjun' });
    expect(c.sent).toEqual([{ t: 'fatal', code: 'no_room' }]);
    expect(c.closed.code).toBe(4004);
    expect(totalWrites(storage)).toBe(0);
  });

  it('create=1 makes the room, seats the creator as host and persists it once', async () => {
    const { connect, storage } = await makeRoom();
    const c = await connect(gid(1), { name: 'Arjun', create: '1', fast: '1' });
    const seat = await seatFromGuestId(gid(1));
    expect(c.state).toEqual({ seat });
    const v = lastView(c);
    expect(v).toMatchObject({ code: 'KQTZ', you: seat, joined: true, isHost: true, status: 'lobby' });
    expect(v.settings.fast).toBe(true);
    expect(v.members.map((m) => m.name)).toEqual(['Arjun']);
    expect(storage.writes.put).toBe(1);
    expect(storage.data.get('room').members[0].name).toBe('Arjun');
  });

  it('create=1 on a code someone else owns tells the client to pick another (room_exists / 4009)', async () => {
    const { connect } = await makeRoom();
    await connect(gid(1), { name: 'Arjun', create: '1' });
    const c = await connect(gid(2), { name: 'Priya', create: '1' });
    expect(c.sent).toEqual([{ t: 'error', action: 'join', code: 'room_exists' }]);
    expect(c.closed.code).toBe(4009);
  });

  it('create=1 from an existing member (reload of the creator) just reconnects', async () => {
    const { connect, disconnect } = await makeRoom();
    const first = await connect(gid(1), { name: 'Arjun', create: '1' });
    await disconnect(first);
    const again = await connect(gid(1), { name: 'Arjun', create: '1' });
    expect(again.closed).toBeNull();
    expect(lastView(again).members).toEqual([expect.objectContaining({ name: 'Arjun', connected: true })]);
  });

  it('a second guest joins and every socket gets its own view', async () => {
    const { connect } = await makeRoom();
    const a = await connect(gid(1), { name: 'Arjun', create: '1' });
    const b = await connect(gid(2), { name: 'Priya' });
    expect(lastView(a).members.map((m) => m.name)).toEqual(['Arjun', 'Priya']);
    expect(lastView(a).isHost).toBe(true);
    expect(lastView(b).isHost).toBe(false);
    expect(lastView(b).you).toBe(await seatFromGuestId(gid(2)));
  });

  it('a taken name is reported as a join error with suggestions; the socket stays open', async () => {
    const { connect } = await makeRoom();
    await connect(gid(1), { name: 'Arjun', create: '1' });
    const b = await connect(gid(2), { name: 'arjun' });
    const e = b.sent.find((m) => m.t === 'error');
    expect(e).toMatchObject({ action: 'join', code: 'name_taken' });
    expect(e.suggestions.length).toBeGreaterThan(0);
    expect(b.closed).toBeNull();
    expect(lastView(b).joined).toBe(false);
  });

  it('a kicked guest who reconnects is refused and closed with 4003', async () => {
    const { connect, msg } = await makeRoom();
    const a = await connect(gid(1), { name: 'Arjun', create: '1' });
    const b = await connect(gid(2), { name: 'Priya' });
    await msg(a, { t: 'kick', seat: b.state.seat });
    expect(b.sent.at(-1)).toEqual({ t: 'fatal', code: 'kicked' });
    expect(b.closed.code).toBe(4003);
    const again = await connect(gid(2), { name: 'Priya' });
    expect(again.sent.find((m) => m.t === 'error')).toMatchObject({ action: 'join', code: 'kicked' });
    expect(again.closed.code).toBe(4003);
  });
});

describe('Room: messages', () => {
  async function lobby(n = 2) {
    const h = await makeRoom();
    const names = ['Arjun', 'Priya', 'Karthik', 'Meena', 'Ravi'];
    h.players = [];
    for (let i = 0; i < n; i++) h.players.push(await h.connect(gid(i + 1), { name: names[i], ...(i === 0 ? { create: '1', fast: '1' } : {}) }));
    return h;
  }

  it('ignores garbage, messages without a type, and sockets without a seat', async () => {
    const h = await lobby(1);
    const [a] = h.players;
    const before = a.sent.length;
    const writes = totalWrites(h.storage);
    await h.msg(a, '{not json');
    await h.msg(a, { nope: 1 });
    await h.msg(a, 'null');
    await h.msg({ state: null, send: vi.fn() }, { t: 'ready', ready: true });
    await h.msg(a, { t: 'definitely-unknown' });
    expect(a.sent.length).toBe(before);
    expect(totalWrites(h.storage)).toBe(writes);
  });

  it('ignores messages before any room exists', async () => {
    const { room, storage } = await makeRoom();
    await room.onMessage({ state: { seat: 'x' }, send: vi.fn() }, JSON.stringify({ t: 'ping' }));
    expect(totalWrites(storage)).toBe(0);
  });

  it('ping answers pong with the server clock and writes nothing', async () => {
    const h = await lobby(1);
    const writes = totalWrites(h.storage);
    await h.msg(h.players[0], { t: 'ping' });
    expect(h.players[0].sent.at(-1)).toEqual({ t: 'pong', serverNow: T0 });
    expect(totalWrites(h.storage)).toBe(writes);
  });

  it('rename / ready / settings change the room, persist it and publish to everyone', async () => {
    const h = await lobby(2);
    const [a, b] = h.players;
    await h.msg(b, { t: 'rename', name: 'Divya' });
    await h.msg(b, { t: 'ready', ready: true });
    await h.msg(a, { t: 'settings', patch: { voteSec: 90 } });
    const v = lastView(a);
    expect(v.members.find((m) => m.seat === b.state.seat)).toMatchObject({ name: 'Divya', ready: true });
    expect(v.settings.voteSec).toBe(90);
    expect(lastView(b).settings.voteSec).toBe(90);
    expect(h.storage.data.get('room').settings.voteSec).toBe(90);
  });

  it('a rejected action is sent back as an error for that action', async () => {
    const h = await lobby(2);
    await h.msg(h.players[1], { t: 'rename', name: 'Arjun' });
    expect(h.players[1].sent.at(-1)).toMatchObject({ t: 'error', action: 'rename', code: 'name_taken' });
    await h.msg(h.players[1], { t: 'start' });
    expect(h.players[1].sent.at(-1)).toMatchObject({ t: 'error', action: 'start', code: 'not_allowed' });
  });

  it('saves only on change: a no-op message writes no rows and publishes nothing', async () => {
    const h = await lobby(2);
    const [a, b] = h.players;
    await h.msg(b, { t: 'ready', ready: true });
    const puts = h.storage.writes.put;
    const sentA = a.sent.length;
    vi.setSystemTime(T0 + 5); // same state, later clock: lastActivity would differ only via touch
    await h.msg(b, { t: 'settings', patch: { voteSec: 30 } }); // not host: ignored
    await h.msg(a, { t: 'kick', seat: 'nobody' }); // no such member: ignored
    await h.msg(a, { t: 'seen' }); // not dealing: ignored
    expect(h.storage.writes.put).toBe(puts);
    expect(a.sent.length).toBe(sentA);
  });

  it('settings without a patch are treated as an empty patch', async () => {
    const h = await lobby(1);
    await h.msg(h.players[0], { t: 'settings' });
    expect(lastView(h.players[0]).settings.voteSec).toBe(60);
  });

  it('relays rtc signaling to the target seat only, tagged with the sender, never stored', async () => {
    const h = await lobby(3);
    const [a, b, c] = h.players;
    const puts = h.storage.writes.put;
    const bBefore = b.sent.length;
    const cBefore = c.sent.length;
    await h.msg(a, { t: 'rtc', to: b.state.seat, data: { sdp: 'x' } });
    expect(b.sent.slice(bBefore)).toEqual([{ t: 'rtc', from: a.state.seat, data: { sdp: 'x' } }]);
    expect(c.sent.length).toBe(cBefore);
    expect(h.storage.writes.put).toBe(puts);
  });

  it('drops rtc without a string target, from non-members, and to closed sockets', async () => {
    const h = await lobby(2);
    const [a, b] = h.players;
    const stranger = await h.connect(gid(9), { name: 'x' }); // invalid name: connected but not a member
    const bBefore = b.sent.length;
    await h.msg(a, { t: 'rtc', to: 5, data: 1 });
    await h.msg(stranger, { t: 'rtc', to: b.state.seat, data: 1 });
    expect(b.sent.length).toBe(bBefore);
    b.closed = { code: 1006 };
    await expect(h.msg(a, { t: 'rtc', to: b.state.seat, data: 1 })).resolves.toBeUndefined();
  });

  it('runs a whole deal over messages: start, pick, seen → night', async () => {
    const h = await lobby(4);
    const [a, ...rest] = h.players;
    for (const p of rest) await h.msg(p, { t: 'ready', ready: true });
    expect(lastView(a).canStart.ok).toBe(true);
    await h.msg(a, { t: 'start' });
    expect(lastView(a).status).toBe('deal');
    for (const [i, p] of h.players.entries()) await h.msg(p, { t: 'pick', index: i });
    await h.msg(rest[0], { t: 'pick', index: 0 });
    expect(rest[0].sent.at(-1)).toMatchObject({ t: 'error', action: 'pick', code: 'already_picked' });
    expect(lastView(a).deal.allPicked).toBe(true);
    await h.msg(a, { t: 'forceNight' }); // host may start the night once all cards are picked
    const v = lastView(a);
    expect(v.status).toBe('game');
    expect(v.game.night).toBe(true);
    // an alarm is armed for the first timed step
    expect(h.storage.alarm).toBeGreaterThan(T0);
  });

  it('routes the remaining game actions to the rules (rejected outside their phase)', async () => {
    const h = await lobby(2);
    const [a] = h.players;
    for (const t of ['select', 'vote', 'skipDiscussion', 'cueDone', 'rematch', 'lobby']) {
      await h.msg(a, { t, target: 'x', id: 1 });
    }
    // none of them apply in the lobby: room unchanged
    expect(lastView(a).status).toBe('lobby');
  });

  it('join message from a socket whose first join failed retries with the new name', async () => {
    const h = await lobby(1);
    const b = await h.connect(gid(2), { name: 'Arjun' });
    expect(lastView(b).joined).toBe(false);
    await h.msg(b, { t: 'join', name: 'Priya' });
    expect(lastView(b)).toMatchObject({ joined: true });
    expect(lastView(h.players[0]).members.map((m) => m.name)).toEqual(['Arjun', 'Priya']);
  });

  it('leave closes every socket of that seat with {t:left} / 4001 and drops the lobby seat', async () => {
    const h = await lobby(2);
    const [a, b] = h.players;
    const bTab2 = await h.connect(gid(2), { name: 'Priya' });
    await h.msg(b, { t: 'leave' });
    for (const s of [b, bTab2]) {
      expect(s.sent.at(-1)).toEqual({ t: 'left' });
      expect(s.closed.code).toBe(4001);
    }
    expect(lastView(a).members.map((m) => m.name)).toEqual(['Arjun']);
  });

  it('a leaving host hands the crown to the next connected member', async () => {
    const h = await lobby(2);
    const [a, b] = h.players;
    await h.msg(a, { t: 'leave' });
    expect(lastView(b)).toMatchObject({ isHost: true, hostSeat: b.state.seat });
  });
});

describe('Room: close, storage and alarms', () => {
  it('a seat goes offline only when its last socket closes', async () => {
    const h = await makeRoom();
    const a = await h.connect(gid(1), { name: 'Arjun', create: '1' });
    const b1 = await h.connect(gid(2), { name: 'Priya' });
    const b2 = await h.connect(gid(2), { name: 'Priya' });
    const puts = h.storage.writes.put;
    await h.disconnect(b1);
    expect(h.storage.writes.put).toBe(puts);
    expect(lastView(a).members[1].connected).toBe(true);
    await h.disconnect(b2);
    expect(lastView(a).members[1].connected).toBe(false);
    // offline lobby member: alarm armed for when the grace period ends
    expect(h.storage.alarm).toBe(T0 + LOBBY_GRACE_MS);
  });

  it('onClose without a room or seat does nothing', async () => {
    const h = await makeRoom();
    await h.room.onClose({ state: { seat: 'x' } });
    const a = await h.connect(gid(1), { name: 'Arjun', create: '1' });
    await h.room.onClose({ state: null });
    expect(lastView(a).members[0].connected).toBe(true);
  });

  it('onStart restores the room and the scheduled alarm without writing', async () => {
    const first = await makeRoom();
    const a = await first.connect(gid(1), { name: 'Arjun', create: '1' });
    await first.disconnect(a);
    const storage = first.storage;
    const writes = totalWrites(storage);
    const h = await makeRoom({ storage });
    expect(h.room.room.members[0].name).toBe('Arjun');
    expect(h.room.alarmAt).toBe(storage.alarm);
    await h.room.save(); // nothing changed since the last persist
    expect(totalWrites(storage)).toBe(writes);
  });

  it('setAlarm only when the alarm time changes; deleteAlarm when nothing is pending', async () => {
    const h = await makeRoom();
    const a = await h.connect(gid(1), { name: 'Arjun', create: '1' });
    const b = await h.connect(gid(2), { name: 'Priya' });
    expect(h.storage.writes.setAlarm).toBe(0); // everyone online, room fresh: nothing to wake for
    await h.disconnect(b);
    expect(h.storage.writes.setAlarm).toBe(1);
    await h.msg(a, { t: 'ready', ready: true }); // host toggling ready: no-op for the rules
    await h.msg(a, { t: 'settings', patch: { voteSec: 45 } }); // changes the room, same alarm time
    expect(h.storage.writes.setAlarm).toBe(1);
    await h.connect(gid(2), { name: 'Priya' }); // back online: nothing pending any more
    expect(h.storage.writes.deleteAlarm).toBe(1);
    expect(h.storage.alarm).toBeNull();
  });

  it('save() with no room is a no-op', async () => {
    const h = await makeRoom();
    await h.room.save();
    expect(totalWrites(h.storage)).toBe(0);
  });

  it('an alarm that is already due is pushed at least MIN_ALARM_DELAY_MS out', async () => {
    const h = await makeRoom();
    await h.connect(gid(1), { name: 'Arjun', create: '1' });
    // pretend the room went idle long ago while still being loaded (due right away)
    h.room.room = { ...h.room.room, members: h.room.room.members.map((m) => ({ ...m, connected: false })), lastActivity: T0 - IDLE_EXPIRE_MS };
    await h.room.schedule();
    expect(h.storage.alarm).toBe(T0 + MIN_ALARM_DELAY_MS);
  });

  it('onAlarm drops lobby members whose grace ran out and publishes the change', async () => {
    const h = await makeRoom();
    const a = await h.connect(gid(1), { name: 'Arjun', create: '1' });
    const b = await h.connect(gid(2), { name: 'Priya' });
    await h.disconnect(b);
    vi.setSystemTime(T0 + LOBBY_GRACE_MS);
    await h.fire();
    expect(lastView(a).members.map((m) => m.name)).toEqual(['Arjun']);
    expect(h.storage.data.get('room').members).toHaveLength(1);
    expect(h.storage.alarm).toBeNull(); // nothing pending: no new alarm written
    expect(h.storage.writes.deleteAlarm).toBe(0);
  });

  it('onAlarm with nothing due publishes nothing', async () => {
    const h = await makeRoom();
    const a = await h.connect(gid(1), { name: 'Arjun', create: '1' });
    const n = a.sent.length;
    await h.fire();
    expect(a.sent.length).toBe(n);
  });

  it('onAlarm after hibernation reloads the room from storage', async () => {
    const first = await makeRoom();
    const b0 = await first.connect(gid(1), { name: 'Arjun', create: '1' });
    await first.connect(gid(2), { name: 'Priya' });
    await first.disconnect(b0);
    const h = await makeRoom({ storage: first.storage });
    h.room.room = null; // evicted from memory
    vi.setSystemTime(T0 + LOBBY_GRACE_MS);
    await h.fire();
    expect(h.room.room.members.map((m) => m.name)).toEqual(['Priya']);
  });

  it('onAlarm with no stored room does nothing', async () => {
    const h = await makeRoom();
    await h.fire();
    expect(totalWrites(h.storage)).toBe(0);
    expect(h.room.room).toBeNull();
  });

  it('onAlarm on an expired room deletes all its storage', async () => {
    const h = await makeRoom();
    const a = await h.connect(gid(1), { name: 'Arjun', create: '1' });
    await h.disconnect(a);
    vi.setSystemTime(T0 + IDLE_EXPIRE_MS);
    await h.fire();
    expect(h.storage.writes.deleteAll).toBe(1);
    expect(h.storage.data.size).toBe(0);
    expect(h.room.room).toBeNull();
    expect(h.room.saved).toBeNull();
  });

  it('send() swallows errors from a socket that already closed', () => {
    const r = new Room({ storage: fakeStorage() }, {});
    expect(() => r.send({ send() { throw new Error('closed'); } }, { t: 'x' })).not.toThrow();
  });
});
