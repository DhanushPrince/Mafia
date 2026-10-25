/**
 * Room Durable Object: one per room code (`/parties/room/<CODE>`), built on PartyServer.
 * All rules live in src/online/roomLogic.js (pure, unit-tested); this class only does I/O:
 * storage, sockets, alarms, and relaying WebRTC signaling between seats.
 *
 * Connect URL query: gid (guest secret), name, create=1 (create the room), fast=1 (e2e timers).
 * The seat id is derived from gid on the server, so a client cannot pick someone else's seat
 * without knowing their secret.
 */
import { Server } from 'partyserver';
import * as R from '../src/online/roomLogic.js';

const enc = new TextEncoder();
export async function seatFromGuestId(gid) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(`mafia-seat:${gid}`));
  return [...new Uint8Array(digest).slice(0, 9)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const validGid = (gid) => typeof gid === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(gid);


export class Room extends Server {
  static options = { hibernate: true };

  /** Health check RPC: proves Durable Objects answer. Touches no room state. */
  async ping() { return Date.now(); }

  async onStart() {
    this.room = (await this.ctx.storage.get('room')) || null;
    this.saved = this.room ? JSON.stringify(this.room) : null; // last persisted room, to skip no-op writes
    this.alarmAt = (await this.ctx.storage.getAlarm()) ?? null; // currently scheduled alarm (a read, not a write)
  }

  /**
   * Persist the room only if it changed, and (re)arm the alarm only if its time changed.
   * Storage puts and setAlarm/deleteAlarm each count against the Durable Object rows_written quota.
   */
  async save() {
    if (!this.room) return;
    const json = JSON.stringify(this.room);
    if (json !== this.saved) {
      await this.ctx.storage.put('room', this.room);
      this.saved = json;
    }
    await this.schedule();
  }

  async schedule() {
    const now = Date.now();
    const at = R.alarmTime(R.nextAlarm(this.room, now), now);
    if (at === this.alarmAt) return;
    if (at === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(at);
    this.alarmAt = at;
  }

  getConnectionTags(conn, ctx) {
    return [ctx.request.headers.get('x-seat') || 'none'];
  }

  send(conn, msg) {
    try { conn.send(JSON.stringify(msg)); } catch { /* closed */ }
  }

  /** Every socket gets its own filtered view. */
  publish() {
    const now = Date.now();
    for (const conn of this.getConnections()) {
      const seat = conn.state?.seat;
      if (seat) this.send(conn, { t: 'view', view: R.viewFor(this.room, seat, now) });
    }
  }

  async onConnect(conn, ctx) {
    const url = new URL(ctx.request.url);
    const gid = url.searchParams.get('gid');
    if (!validGid(gid)) {
      this.send(conn, { t: 'fatal', code: 'bad_guest' });
      conn.close(4000, 'bad guest id');
      return;
    }
    const seat = await seatFromGuestId(gid);
    conn.setState({ seat });
    const now = Date.now();
    if (!this.room) {
      if (url.searchParams.get('create') !== '1') {
        this.send(conn, { t: 'fatal', code: 'no_room' });
        conn.close(4004, 'no such room');
        return;
      }
      this.room = R.createRoom(this.name, now, { fast: url.searchParams.get('fast') === '1' });
    } else if (url.searchParams.get('create') === '1' && !this.room.members.some((m) => m.seat === seat)) {
      // random code collided with someone else's room: the client picks a new code
      this.send(conn, { t: 'error', action: 'join', code: 'room_exists' });
      conn.close(4009, 'room exists');
      return;
    }
    this.tryJoin(conn, seat, url.searchParams.get('name') || '', now);
    await this.save();
    this.publish();
  }

  tryJoin(conn, seat, name, now) {
    const res = R.join(this.room, seat, name, now);
    this.room = res.room;
    if (res.error) this.send(conn, { t: 'error', action: 'join', ...res.error });
    if (res.error?.code === 'kicked') conn.close(4003, 'kicked');
  }

  async onMessage(conn, raw) {
    if (!this.room) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const seat = conn.state?.seat;
    if (!seat || !msg || typeof msg.t !== 'string') return;
    const now = Date.now();
    const r = this.room;

    // WebRTC signaling: relay to the other seat's sockets, never stored
    if (msg.t === 'rtc') {
      if (typeof msg.to !== 'string' || !r.members.some((m) => m.seat === seat)) return;
      const out = JSON.stringify({ t: 'rtc', from: seat, data: msg.data });
      for (const c of this.getConnections(msg.to)) { try { c.send(out); } catch { /* closed */ } }
      return;
    }
    if (msg.t === 'ping') { this.send(conn, { t: 'pong', serverNow: now }); return; }

    let res = null; // { room, error? } or a room
    switch (msg.t) {
      case 'join': this.tryJoin(conn, seat, msg.name, now); break;
      case 'rename': res = R.rename(r, seat, msg.name, now); break;
      case 'ready': res = R.setReady(r, seat, msg.ready, now); break;
      case 'settings': res = R.updateSettings(r, seat, msg.patch || {}, now); break;
      case 'kick': {
        res = R.kick(r, seat, msg.seat, now);
        if (res !== r) for (const c of this.getConnections(msg.seat)) { this.send(c, { t: 'fatal', code: 'kicked' }); c.close(4003, 'kicked'); }
        break;
      }
      case 'start': res = R.start(r, seat, now); break;
      case 'pick': res = R.pickCard(r, seat, msg.index, now); break;
      case 'seen': res = R.markSeen(r, seat, now); break;
      case 'forceNight': res = R.forceNight(r, seat, now); break;
      case 'select': res = R.nightSelect(r, seat, msg.target, now); break;
      case 'vote': res = R.castVote(r, seat, msg.target, now); break;
      case 'skipDiscussion': res = R.skipDiscussion(r, seat, now); break;
      case 'cueDone': res = R.cueDone(r, seat, msg.id, now); break;
      case 'rematch': res = R.rematch(r, seat, now); break;
      case 'lobby': res = R.backToLobby(r, seat, now); break;
      default: return;
    }
    if (res) {
      if (res.error) this.send(conn, { t: 'error', action: msg.t, ...res.error });
      this.room = res.room || res;
    }
    if (this.room !== r || msg.t === 'join') {
      await this.save();
      this.publish();
    }
  }

  async onClose(conn) {
    const seat = conn.state?.seat;
    if (!this.room || !seat) return;
    // another tab / a reconnect of the same seat may still be open
    const still = [...this.getConnections(seat)].some((c) => c !== conn);
    if (still) return;
    this.room = R.disconnect(this.room, seat, Date.now());
    await this.save();
    this.publish();
  }

  async onAlarm() {
    this.alarmAt = null; // this alarm has fired; nothing is scheduled now
    if (!this.room) {
      this.room = (await this.ctx.storage.get('room')) || null;
      this.saved = this.room ? JSON.stringify(this.room) : null;
    }
    if (!this.room) return;
    const now = Date.now();
    if (R.isExpired(this.room, now)) {
      this.room = null;
      this.saved = null;
      await this.ctx.storage.deleteAll();
      return;
    }
    const before = this.room;
    this.room = R.tick(this.room, now);
    await this.save();
    if (this.room !== before) this.publish();
  }
}
