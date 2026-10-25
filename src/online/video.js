/**
 * WebRTC mesh for the room's video tiles. Signaling goes through the Room DO (`{t:'rtc', to, data}`),
 * media flows peer to peer. Public STUN only: players behind strict / symmetric NATs need a TURN
 * server (see ONLINE_PROGRESS.md). Uses the "perfect negotiation" pattern.
 *
 * Camera/mic on/off is `track.enabled` (no renegotiation); the state is sent to peers so their tile
 * can show "camera off". If the user denies permissions we still receive everyone else.
 */
export async function getLocalMedia() {
  if (!navigator.mediaDevices?.getUserMedia) return { stream: null, error: 'unsupported' };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: { width: 320, height: 240, frameRate: 15, facingMode: 'user' } });
    return { stream, error: null };
  } catch (e) {
    // camera busy / missing: try audio only, then nothing
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return { stream, error: 'no_camera' };
    } catch {
      return { stream: null, error: e?.name === 'NotAllowedError' ? 'denied' : 'unavailable' };
    }
  }
}

const sid = () => Math.random().toString(36).slice(2, 10);

export class Mesh {
  constructor({ self, send, iceServers, onChange }) {
    this.self = self;
    this.sendSignal = send; // (toSeat, data)
    this.iceServers = iceServers || [{ urls: 'stun:stun.l.google.com:19302' }];
    this.onChange = onChange; // () => void, when remote streams / states change
    this.sid = sid();
    this.local = null;
    this.peers = new Map(); // seat -> { pc, sid, makingOffer, ignoreOffer, stream, media }
    this.media = { cam: true, mic: true };
  }

  setLocal(stream) {
    this.local = stream;
    // snapshot the seats: reset() re-inserts into the Map, which a live iteration would visit again forever
    for (const seat of [...this.peers.keys()]) this.reset(seat); // re-offer with the new tracks
  }

  /** Apply camera / mic switches (user toggles + night auto-off) and tell peers. */
  setMedia({ cam, mic }) {
    this.media = { cam, mic };
    this.local?.getVideoTracks().forEach((t) => { t.enabled = cam; });
    this.local?.getAudioTracks().forEach((t) => { t.enabled = mic; });
    for (const seat of this.peers.keys()) this.sendSignal(seat, { sid: this.sid, media: this.media });
  }

  /** Keep one connection per other connected seat. */
  sync(seats) {
    const want = new Set(seats.filter((s) => s !== this.self));
    for (const seat of [...this.peers.keys()]) if (!want.has(seat)) this.drop(seat);
    for (const seat of want) if (!this.peers.has(seat)) this.create(seat, null);
  }

  polite(seat) { return this.self < seat; }

  create(seat, remoteSid) {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const peer = { pc, born: Date.now(), sid: remoteSid, makingOffer: false, ignoreOffer: false, stream: null, media: { cam: true, mic: true } };
    this.peers.set(seat, peer);
    if (this.local) this.local.getTracks().forEach((t) => pc.addTrack(t, this.local));
    else {
      pc.addTransceiver('audio', { direction: 'recvonly' });
      pc.addTransceiver('video', { direction: 'recvonly' });
    }
    pc.ontrack = ({ track, streams }) => {
      peer.stream = streams[0] || peer.stream || new MediaStream();
      if (!streams[0]) peer.stream.addTrack(track);
      this.onChange?.();
    };
    pc.onicecandidate = ({ candidate }) => candidate && this.sendSignal(seat, { sid: this.sid, candidate });
    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        this.sendSignal(seat, { sid: this.sid, description: pc.localDescription, media: this.media });
      } catch { /* superseded */ } finally { peer.makingOffer = false; }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') pc.restartIce?.();
      this.onChange?.();
    };
    this.onChange?.();
    return peer;
  }

  /** Watchdog: a connection that never came up (lost offer, failed ICE) is rebuilt on both ends. */
  check(stuckMs = 8000) {
    for (const [seat, p] of [...this.peers]) { // snapshot: reset() re-inserts the seat
      const st = p.pc.connectionState;
      if (st === 'failed' || (st !== 'connected' && st !== 'connecting' && Date.now() - p.born > stuckMs)) {
        this.reset(seat);
        this.sendSignal(seat, { sid: this.sid, restart: true });
      }
    }
  }

  reset(seat) {
    const old = this.peers.get(seat);
    this.drop(seat);
    return this.create(seat, old?.sid ?? null);
  }

  drop(seat) {
    const p = this.peers.get(seat);
    if (!p) return;
    try { p.pc.close(); } catch { /* closed */ }
    this.peers.delete(seat);
    this.onChange?.();
  }

  /** Signals are handled strictly in order (a candidate must not overtake its offer). */
  onSignal(from, data) {
    this.inbox = (this.inbox || Promise.resolve()).then(() => this.handleSignal(from, data)).catch(() => {});
    return this.inbox;
  }

  async handleSignal(from, data) {
    if (!data || from === this.self) return;
    let peer = this.peers.get(from);
    // the other side reloaded (new session id): start over with it
    if (peer && data.sid && peer.sid && peer.sid !== data.sid) peer = this.reset(from);
    if (!peer) peer = this.create(from, data.sid);
    if (data.sid) peer.sid = data.sid;
    if (data.restart) {
      if (Date.now() - peer.born > 1000) this.reset(from); // our end is stale too
      return;
    }
    if (data.media) { peer.media = data.media; this.onChange?.(); }
    const { pc } = peer;
    try {
      if (data.description) {
        const collision = data.description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
        peer.ignoreOffer = !this.polite(from) && collision;
        if (peer.ignoreOffer) return;
        await pc.setRemoteDescription(data.description);
        if (data.description.type === 'offer') {
          await pc.setLocalDescription();
          this.sendSignal(from, { sid: this.sid, description: pc.localDescription, media: this.media });
        }
      } else if (data.candidate) {
        try { await pc.addIceCandidate(data.candidate); } catch (e) { if (!peer.ignoreOffer) throw e; }
      }
    } catch { /* a stale signal; the next negotiation fixes it */ }
  }

  streams() {
    const out = {};
    for (const [seat, p] of this.peers) out[seat] = { stream: p.stream, media: p.media, state: p.pc.connectionState };
    return out;
  }

  close() {
    for (const seat of [...this.peers.keys()]) this.drop(seat);
    this.local?.getTracks().forEach((t) => t.stop());
    this.local = null;
  }
}
