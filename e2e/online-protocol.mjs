// Headless protocol smoke: 5 guest sockets against `vite` dev (Worker + Room DO), play to a win.
// Usage: node e2e/online-protocol.mjs [http://localhost:5180]
const BASE = (process.argv[2] || 'http://localhost:5180').replace(/^http/, 'ws');
const CODE = Array.from({ length: 4 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ'[Math.floor(Math.random() * 23)]).join('');
const gid = () => crypto.randomUUID().replace(/-/g, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(name, opts = {}) {
  const id = opts.gid || gid();
  const q = new URLSearchParams({ gid: id, name, ...(opts.create ? { create: '1', fast: '1' } : {}) });
  const ws = new WebSocket(`${BASE}/parties/room/${CODE}?${q}`);
  const c = { name, gid: id, ws, view: null, errors: [], closeCode: null, send: (m) => ws.send(JSON.stringify(m)) };
  ws.onclose = (e) => { c.closeCode = e.code; };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'view') c.view = m.view;
    if (m.t === 'error' || m.t === 'fatal') c.errors.push(m);
    if (m.t === 'cue' || (m.t === 'view' && m.view.flow?.cue && opts.host)) { /* host acks below */ }
  };
  c.open = new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  return c;
}
const until = async (pred, ms = 20000, what = 'condition') => {
  const t0 = Date.now();
  while (!pred()) { if (Date.now() - t0 > ms) throw new Error(`timeout: ${what}`); await sleep(50); }
};

const host = client('Arjun', { create: true });
await host.open;
await until(() => host.view, 5000, 'host view');
console.log('room', CODE, 'host seat', host.view.you);
const names = ['Priya', 'Karthik', 'மீனா', 'Ravi'];
const others = names.map((n) => client(n));
await Promise.all(others.map((c) => c.open));
await until(() => others.every((c) => c.view?.joined), 5000, 'joins');

// duplicate name (case + spaces) is refused with suggestions
const dup = client('  KARTHIK ');
await dup.open;
await until(() => dup.errors.length, 5000, 'dup error');
console.log('duplicate ->', dup.errors[0].code, dup.errors[0].suggestions);
if (dup.errors[0].code !== 'name_taken') throw new Error('expected name_taken');
dup.ws.close();

// reconnect with the same guest id keeps the seat
const seatBefore = others[0].view.you;
others[0].ws.close();
await sleep(300);
others[0] = client('Priya', { gid: others[0].gid });
await others[0].open;
await until(() => others[0].view?.joined, 5000, 'rejoin');
if (others[0].view.you !== seatBefore) throw new Error('seat changed on reconnect');
console.log('reconnect keeps seat ok; members', host.view.members.map((m) => m.name).join(', '));

// a guest joins, then leaves with the exit button: removed from the room, name free, socket closed (4001)
const leaver = client('Divya');
await leaver.open;
await until(() => host.view.members.some((m) => m.name === 'Divya'), 5000, 'leaver joined');
leaver.send({ t: 'leave' });
await until(() => leaver.closeCode === 4001, 5000, 'leave closes the socket with 4001');
await until(() => !host.view.members.some((m) => m.name === 'Divya'), 5000, 'leaver removed');
console.log('lobby leave ok: members', host.view.members.length);

let all = [host, ...others];
others.forEach((c) => c.send({ t: 'ready', ready: true }));
await until(() => host.view.canStart?.ok, 5000, 'canStart');
host.send({ t: 'start' });
await until(() => all.every((c) => c.view.status === 'deal'), 5000, 'deal');
for (const c of all) {
  const free = c.view.deal.cards.find((k) => !k.takenBy);
  c.send({ t: 'pick', index: free.index });
  await until(() => c.view.deal.myRole, 5000, 'pick');
}
console.log('roles', all.map((c) => `${c.name}=${c.view.deal.myRole}`).join(' '));
all.forEach((c) => c.send({ t: 'seen' }));
await until(() => all.every((c) => c.view.status === 'game'), 5000, 'game');

// a villager leaves mid-game: out of the game (dead, spectator, tile gone) and the game still ends
const quitter = others.find((c) => c.view.game.me.role === 'villager');
quitter.send({ t: 'leave' });
await until(() => quitter.closeCode === 4001, 5000, 'mid-game leave closes the socket');
await until(() => host.view.game.players.find((p) => p.seat === quitter.view.you)?.alive === false, 5000, 'quitter out');
const qm = host.view.members.find((m) => m.seat === quitter.view.you);
if (!qm.spectator || qm.connected) throw new Error('quitter should be an offline spectator');
all = all.filter((c) => c !== quitter);
console.log('mid-game leave ok:', quitter.name, 'is out');

// drive the game: host acks cues; Mafia kill a villager; everyone votes for a Mafia
let lastCue = null, rounds = 0;
const t0 = Date.now();
while (host.view.game?.phase !== 'END') {
  if (Date.now() - t0 > 120000) throw new Error('game too long');
  const f = host.view.flow;
  if (f?.cue && f.cue.id !== lastCue) { lastCue = f.cue.id; setTimeout(() => host.send({ t: 'cueDone', id: f.cue.id }), 150); }
  for (const c of all) {
    const g = c.view.game;
    if (!g?.me?.alive) continue;
    if (g.myTurn && !g.mySelection && g.targets.length) {
      const t = g.me.role === 'mafia' ? g.targets.find((p) => p.role !== 'mafia') : g.targets[0];
      if (t) c.send({ t: 'select', target: t.seat });
    }
    if (c.view.flow?.step === 'voting' && !g.votes?.[c.view.you]) {
      const alive = g.players.filter((p) => p.alive && p.seat !== c.view.you);
      const mafiaSeat = all.find((x) => x.view.game.me?.role === 'mafia' && x.view.game.me.alive)?.view.you;
      const target = alive.find((p) => p.seat === mafiaSeat) || alive[0];
      c.send({ t: 'vote', target: target.seat });
      if (c === host) rounds++;
    }
  }
  await sleep(100);
}
console.log('winner', host.view.game.winner, 'after', ((Date.now() - t0) / 1000).toFixed(1), 's');
const leaked = all.some((c) => c.view.game.players.some((p) => !p.role));
if (leaked) throw new Error('roles should be revealed at END');
all.forEach((c) => c.ws.close());
console.log('PROTOCOL OK');
process.exit(0);
