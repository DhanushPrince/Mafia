import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Mesh, getLocalMedia } from './video.js';

// ---------------------------------------------------------------- WebRTC fakes (node has none)
const pcs = [];
class FakePC {
  constructor(cfg) {
    this.cfg = cfg;
    this.signalingState = 'stable';
    this.connectionState = 'new';
    this.tracks = [];
    this.transceivers = [];
    this.localDescription = null;
    this.remoteDescription = null;
    this.candidates = [];
    this.closed = false;
    this.restartIce = vi.fn();
    pcs.push(this);
  }
  addTrack(track, stream) { this.tracks.push({ track, stream }); }
  addTransceiver(kind, opts) { this.transceivers.push({ kind, ...opts }); }
  async setLocalDescription() {
    const type = this.signalingState === 'have-remote-offer' ? 'answer' : 'offer';
    this.localDescription = { type, sdp: `${type}-sdp` };
    this.signalingState = type === 'offer' ? 'have-local-offer' : 'stable';
  }
  async setRemoteDescription(d) {
    this.remoteDescription = d;
    this.signalingState = d.type === 'offer' ? 'have-remote-offer' : 'stable';
  }
  async addIceCandidate(c) {
    if (this.failIce) throw new Error('bad candidate');
    this.candidates.push(c);
  }
  close() { this.closed = true; }
}
class FakeStream {
  constructor(tracks = []) { this.tracks = tracks; }
  addTrack(t) { this.tracks.push(t); }
  getTracks() { return this.tracks; }
  getVideoTracks() { return this.tracks.filter((t) => t.kind === 'video'); }
  getAudioTracks() { return this.tracks.filter((t) => t.kind === 'audio'); }
}
const track = (kind) => ({ kind, enabled: true, stop: vi.fn() });
const camStream = () => new FakeStream([track('audio'), track('video')]);

beforeEach(() => {
  pcs.length = 0;
  vi.stubGlobal('RTCPeerConnection', FakePC);
  vi.stubGlobal('MediaStream', FakeStream);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const flush = () => new Promise((r) => setTimeout(r, 0));
function mesh(self, extra = {}) {
  const sent = [];
  const m = new Mesh({ self, send: (to, data) => sent.push({ to, data }), onChange: vi.fn(), ...extra });
  return { m, sent };
}

// ---------------------------------------------------------------- getLocalMedia
describe('getLocalMedia', () => {
  const withMedia = (getUserMedia) => vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

  it('reports unsupported when the browser has no getUserMedia', async () => {
    vi.stubGlobal('navigator', {});
    expect(await getLocalMedia()).toEqual({ stream: null, error: 'unsupported' });
  });

  it('asks for a small front camera + mic and returns the stream', async () => {
    const s = camStream();
    const gum = vi.fn(async () => s);
    withMedia(gum);
    expect(await getLocalMedia()).toEqual({ stream: s, error: null });
    expect(gum.mock.calls[0][0].video).toMatchObject({ width: 320, height: 240, facingMode: 'user' });
  });

  it('falls back to audio only when the camera is busy or missing', async () => {
    const audio = new FakeStream([track('audio')]);
    const gum = vi.fn().mockRejectedValueOnce(new Error('busy')).mockResolvedValueOnce(audio);
    withMedia(gum);
    expect(await getLocalMedia()).toEqual({ stream: audio, error: 'no_camera' });
    expect(gum.mock.calls[1][0]).toEqual({ audio: true });
  });

  it('reports denied when the user blocks permissions, unavailable otherwise', async () => {
    withMedia(vi.fn().mockRejectedValue(Object.assign(new Error('no'), { name: 'NotAllowedError' })));
    expect(await getLocalMedia()).toEqual({ stream: null, error: 'denied' });
    withMedia(vi.fn().mockRejectedValue(new Error('hw')));
    expect(await getLocalMedia()).toEqual({ stream: null, error: 'unavailable' });
  });
});

// ---------------------------------------------------------------- Mesh
describe('Mesh peers', () => {
  it('keeps exactly one connection per other connected seat', () => {
    const { m } = mesh('b');
    m.sync(['a', 'b', 'c']);
    expect([...m.peers.keys()].sort()).toEqual(['a', 'c']);
    expect(pcs[0].cfg.iceServers).toEqual([{ urls: 'stun:stun.l.google.com:19302' }]);
    const pcA = m.peers.get('a').pc;
    m.sync(['b', 'c']);
    expect(pcA.closed).toBe(true);
    expect([...m.peers.keys()]).toEqual(['c']);
    m.sync(['c', 'b']); // no churn for an unchanged set
    expect(pcs).toHaveLength(2);
  });

  it('receives only when there is no local camera, and sends local tracks when there is', () => {
    const { m } = mesh('a', { iceServers: [{ urls: 'turn:x' }] });
    m.sync(['b']);
    expect(pcs[0].transceivers.map((t) => `${t.kind}:${t.direction}`)).toEqual(['audio:recvonly', 'video:recvonly']);
    expect(pcs[0].cfg.iceServers).toEqual([{ urls: 'turn:x' }]);
    const s = camStream();
    m.setLocal(s); // re-offers with the new tracks
    expect(pcs[0].closed).toBe(true);
    expect(pcs[1].tracks.map((t) => t.track.kind)).toEqual(['audio', 'video']);
    expect(pcs[1].tracks[0].stream).toBe(s);
  });

  it('drop() of an unknown seat is harmless', () => {
    const { m } = mesh('a');
    expect(() => m.drop('zz')).not.toThrow();
  });

  it('notifies onChange as peers come and go', () => {
    const { m } = mesh('a');
    m.sync(['b']);
    m.sync([]);
    expect(m.onChange).toHaveBeenCalledTimes(2);
  });
});

describe('Mesh signaling', () => {
  it('negotiationneeded sends an offer with our session id and media state', async () => {
    const { m, sent } = mesh('a');
    m.sync(['b']);
    const peer = m.peers.get('b');
    const p = peer.pc.onnegotiationneeded();
    expect(peer.makingOffer).toBe(true);
    await p;
    expect(peer.makingOffer).toBe(false);
    expect(sent).toEqual([{ to: 'b', data: { sid: m.sid, description: { type: 'offer', sdp: 'offer-sdp' }, media: { cam: true, mic: true } } }]);
  });

  it('a failed offer is swallowed and clears makingOffer', async () => {
    const { m, sent } = mesh('a');
    m.sync(['b']);
    const peer = m.peers.get('b');
    peer.pc.setLocalDescription = async () => { throw new Error('superseded'); };
    await peer.pc.onnegotiationneeded();
    expect(peer.makingOffer).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it('runs offer → answer → ICE between two meshes', async () => {
    const a = mesh('a');
    const b = mesh('b');
    a.m.sync(['a', 'b']);
    await a.m.peers.get('b').pc.onnegotiationneeded();
    // deliver a's offer to b: b creates its peer for a and answers
    await b.m.onSignal('a', a.sent[0].data);
    const pcB = b.m.peers.get('a').pc;
    expect(pcB.remoteDescription.type).toBe('offer');
    expect(b.sent[0]).toEqual({ to: 'a', data: { sid: b.m.sid, description: { type: 'answer', sdp: 'answer-sdp' }, media: { cam: true, mic: true } } });
    expect(b.m.peers.get('a').sid).toBe(a.m.sid);
    // answer back to a
    await a.m.onSignal('b', b.sent[0].data);
    const pcA = a.m.peers.get('b').pc;
    expect(pcA.signalingState).toBe('stable');
    expect(pcA.remoteDescription.type).toBe('answer');
    // ICE candidates are relayed and applied
    pcA.onicecandidate({ candidate: { candidate: 'c1' } });
    pcA.onicecandidate({ candidate: null }); // end of candidates: nothing sent
    expect(a.sent.at(-1)).toEqual({ to: 'b', data: { sid: a.m.sid, candidate: { candidate: 'c1' } } });
    expect(a.sent).toHaveLength(2);
    await b.m.onSignal('a', a.sent.at(-1).data);
    expect(pcB.candidates).toEqual([{ candidate: 'c1' }]);
  });

  it('handles signals strictly in order (a candidate never overtakes its offer)', async () => {
    const b = mesh('b');
    const order = [];
    const orig = b.m.handleSignal.bind(b.m);
    b.m.handleSignal = async (from, data) => { await orig(from, data); order.push(data.description ? 'offer' : 'candidate'); };
    b.m.onSignal('a', { sid: 's1', description: { type: 'offer', sdp: 'o' } });
    await b.m.onSignal('a', { sid: 's1', candidate: { candidate: 'c' } });
    expect(order).toEqual(['offer', 'candidate']);
    expect(b.m.peers.get('a').pc.candidates).toHaveLength(1);
  });

  it('impolite side ignores a colliding offer; polite side accepts it', async () => {
    // 'b' > 'a': b is impolite towards a
    const imp = mesh('b');
    imp.m.sync(['a']);
    imp.m.peers.get('a').makingOffer = true;
    await imp.m.onSignal('a', { sid: 'sa', description: { type: 'offer', sdp: 'o' } });
    expect(imp.m.peers.get('a').ignoreOffer).toBe(true);
    expect(imp.m.peers.get('a').pc.remoteDescription).toBeNull();
    // a candidate for the ignored offer fails quietly
    imp.m.peers.get('a').pc.failIce = true;
    await expect(imp.m.onSignal('a', { sid: 'sa', candidate: { candidate: 'c' } })).resolves.toBeUndefined();

    const pol = mesh('a');
    pol.m.sync(['b']);
    pol.m.peers.get('b').makingOffer = true;
    await pol.m.onSignal('b', { sid: 'sb', description: { type: 'offer', sdp: 'o' } });
    expect(pol.m.peers.get('b').ignoreOffer).toBe(false);
    expect(pol.m.peers.get('b').pc.remoteDescription.type).toBe('offer');
    expect(pol.sent.at(-1).data.description.type).toBe('answer');
  });

  it('a bad candidate on a live negotiation is swallowed as a stale signal', async () => {
    const { m } = mesh('a');
    m.sync(['b']);
    m.peers.get('b').pc.failIce = true;
    await expect(m.onSignal('b', { candidate: { candidate: 'x' } })).resolves.toBeUndefined();
  });

  it('starts over when the other side reloads (new session id)', async () => {
    const { m } = mesh('a');
    await m.onSignal('b', { sid: 'old', media: { cam: true, mic: true } });
    const first = m.peers.get('b').pc;
    await m.onSignal('b', { sid: 'new', media: { cam: true, mic: true } });
    expect(first.closed).toBe(true);
    expect(m.peers.get('b').sid).toBe('new');
  });

  it('ignores empty signals and our own echoes', async () => {
    const { m } = mesh('a');
    await m.onSignal('b', null);
    await m.onSignal('a', { sid: 'x', media: {} });
    expect(m.peers.size).toBe(0);
  });

  it('restart: rebuilds a stale connection, keeps a fresh one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(10_000);
    const { m } = mesh('a');
    m.sync(['b']);
    const fresh = m.peers.get('b').pc;
    await m.onSignal('b', { sid: 's', restart: true });
    expect(fresh.closed).toBe(false);
    vi.setSystemTime(12_000);
    await m.onSignal('b', { sid: 's', restart: true });
    expect(fresh.closed).toBe(true);
    expect(m.peers.get('b').pc).not.toBe(fresh);
  });

  it('remote camera/mic state reaches streams() and onChange', async () => {
    const { m } = mesh('a');
    await m.onSignal('b', { sid: 's', media: { cam: false, mic: true } });
    expect(m.streams()).toEqual({ b: { stream: null, media: { cam: false, mic: true }, state: 'new' } });
    expect(m.onChange).toHaveBeenCalled();
  });
});

describe('Mesh media', () => {
  it('ontrack uses the remote stream, or builds one for a bare track', () => {
    const { m } = mesh('a');
    m.sync(['b', 'c']);
    const remote = new FakeStream();
    m.peers.get('b').pc.ontrack({ track: track('video'), streams: [remote] });
    expect(m.streams().b.stream).toBe(remote);
    const t = track('audio');
    m.peers.get('c').pc.ontrack({ track: t, streams: [] });
    expect(m.streams().c.stream.getTracks()).toEqual([t]);
  });

  it('night mute: setMedia disables local tracks and tells every peer', () => {
    const { m, sent } = mesh('a');
    const s = camStream();
    m.setLocal(s);
    m.sync(['b', 'c']);
    m.setMedia({ cam: false, mic: false });
    expect(s.getTracks().map((t) => t.enabled)).toEqual([false, false]);
    expect(sent.map((x) => x.to).sort()).toEqual(['b', 'c']);
    expect(sent.every((x) => x.data.media.cam === false && x.data.media.mic === false && x.data.sid === m.sid)).toBe(true);
    m.setMedia({ cam: true, mic: false }); // day, mic still muted by the user
    expect(s.getVideoTracks()[0].enabled).toBe(true);
    expect(s.getAudioTracks()[0].enabled).toBe(false);
  });

  it('setMedia without a local stream still informs peers', () => {
    const { m, sent } = mesh('a');
    m.sync(['b']);
    m.setMedia({ cam: false, mic: true });
    expect(sent).toEqual([{ to: 'b', data: { sid: m.sid, media: { cam: false, mic: true } } }]);
  });

  it('a failed connection restarts ICE and notifies', () => {
    const { m } = mesh('a');
    m.sync(['b']);
    const { pc } = m.peers.get('b');
    pc.connectionState = 'failed';
    pc.onconnectionstatechange();
    expect(pc.restartIce).toHaveBeenCalled();
    pc.connectionState = 'connected';
    pc.onconnectionstatechange();
    expect(pc.restartIce).toHaveBeenCalledTimes(1);
  });

  it('watchdog rebuilds failed or stuck connections on both ends', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(0);
    const { m, sent } = mesh('a');
    m.sync(['b', 'c', 'd']);
    const [b, c, d] = ['b', 'c', 'd'].map((s) => m.peers.get(s).pc);
    b.connectionState = 'failed';
    c.connectionState = 'connected';
    d.connectionState = 'new';
    m.check(8000);
    expect([b.closed, c.closed, d.closed]).toEqual([true, false, false]);
    expect(sent).toEqual([{ to: 'b', data: { sid: m.sid, restart: true } }]);
    vi.setSystemTime(9000);
    m.check(8000);
    expect(d.closed).toBe(true); // stuck in 'new' for too long
    expect(c.closed).toBe(false);
  });

  it('close() on leave hangs up every peer and stops the camera and mic', () => {
    const { m } = mesh('a');
    const s = camStream();
    m.setLocal(s);
    m.sync(['b', 'c']);
    m.close();
    expect(pcs.every((pc) => pc.closed)).toBe(true);
    expect(m.peers.size).toBe(0);
    expect(s.getTracks().every((t) => t.stop.mock.calls.length === 1)).toBe(true);
    expect(m.local).toBeNull();
  });

  it('close() survives a peer connection that throws on close', () => {
    const { m } = mesh('a');
    m.sync(['b']);
    m.peers.get('b').pc.close = () => { throw new Error('already closed'); };
    expect(() => m.close()).not.toThrow();
    expect(m.peers.size).toBe(0);
  });
});
