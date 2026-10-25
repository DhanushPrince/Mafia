// Guest identity kept on this device: a random secret id (never shown to others) + display name.
const KEY = 'mafia.online.guest';

const randomId = () => {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(36).padStart(2, '0')).join('').slice(0, 24);
};

export function loadIdentity() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && typeof v.gid === 'string' && v.gid.length >= 16) return { gid: v.gid, name: typeof v.name === 'string' ? v.name : '' };
  } catch { /* fall through */ }
  const fresh = { gid: randomId(), name: '' };
  saveIdentity(fresh);
  return fresh;
}

export function saveIdentity(id) {
  try { localStorage.setItem(KEY, JSON.stringify({ gid: id.gid, name: id.name })); } catch { /* private mode */ }
}
