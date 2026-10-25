# Online rooms: progress log

Branch `online-rooms` (from `tamil-narrator`). Local commits only. No push, no deploy.

## Status (25 Oct 2026, IST)
- [x] Deps: partyserver 0.5.10, partysocket 1.3.0, better-auth 1.7.12 (Google stub), uqr (QR);
      dev: wrangler 4.152, @cloudflare/vite-plugin 1.65
- [x] `ROLES` visuals moved to `src/game/roleVisuals.js` (roles.js has no UI imports)
- [x] `src/online/names.js` + tests: guest name rules
- [x] `src/online/roomLogic.js` + tests: lobby, card pick, timeline, per-seat views, votes, rematch
- [x] Worker + Room Durable Object (`worker/`), `wrangler.jsonc`, cloudflare vite plugin
- [x] Client: `/online`, `/r/CODE`; name screen, home, lobby (QR, ready, settings, kick), card pick,
      hold-to-reveal, night actions, discussion, open voting, results, rematch
- [x] Video: WebRTC mesh, auto off at night, mic/camera toggles, works without camera permission
- [x] Host narration (cue -> `narrator.say` -> `cueDone`), captions for everyone else
- [x] e2e `e2e/online.e2e.mjs` (5 guests) green; headless protocol test `e2e/online-protocol.mjs` green
- [ ] Google sign-in: stub only (needs OAuth client + D1; steps below)

## Live (deployed 25 Oct 2026, 14:36 IST)
- Worker: https://mafia-dealer.dhanushprince.workers.dev (play: `/online`; health: `/api/health` or `/health`)
- workers.dev subdomain `dhanushprince` was registered for this account (it had none).
- Health JSON: `{ ok, version, commit, time, rooms: { ok, ms }, google, turn }`; `rooms` pings a Durable Object.
- Verified live: `node e2e/online-protocol.mjs https://mafia-dealer.dhanushprince.workers.dev` (3 runs OK) and
  `BASE_URL=https://mafia-dealer.dhanushprince.workers.dev TURN_URL=... node e2e/online.e2e.mjs` (E2E OK).
- Redeploy: `CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... npm run deploy` (or `npx wrangler login` first).

## Pages site -> Worker rooms
- The Pages build is static. Set `VITE_ROOMS_HOST=mafia-dealer.dhanushprince.workers.dev` in Cloudflare Pages ->
  mafia-dealer -> Settings -> Variables (Production and Preview) and redeploy; `/online` then talks to the Worker.
- The Worker accepts browser origins: itself, `https://mafia-dealer.pages.dev`, `https://<branch|hash>.mafia-dealer.pages.dev`,
  localhost, plus env `ALLOWED_ORIGINS` (comma separated). Other origins get 403 on `/parties/*`; CORS on `/api/config|health`.
- If the room server can't be reached in 8 s, `/online` shows "Can't reach the room server" with Try again.
- `?debug=1` exposes `window.__mafiaView` (the player's own view) for e2e on production builds.

## Design
- Worker (`worker/index.js`): `/api/config` (Google on/off + ICE servers), `/api/auth/*` (better-auth, only when
  configured), PartyServer rooms at `/parties/room/<CODE>`, static app through Workers assets.
- Room Durable Object (`worker/room.js`): I/O only (storage, sockets, alarms, WebRTC relay). Every rule is in
  `src/online/roomLogic.js`, which is pure and unit-tested. The engine (`src/game/engine.js`) is unchanged.
- Engine player `name` = seat id (collision-proof); display names live in the room's member list.
- Timeline: the server owns every step and deadline (`flow`), the DO alarm fires at `nextAlarm(room)`.
- Narration: each step may carry a `cue` (clip ids). The host phone plays it and sends `cueDone`; the server
  also has a deadline fallback (clips x 5 s + 2 s), so a silent / closed host never stalls the game.
- Card pick: deck stays on the server; clients only see which cards are taken and by whom, plus their own role.

## Guest identity and names
- Guest first. Device keeps `{ guestId, name }` in localStorage (`mafia.online.guest`). guestId is a random
  secret; the server derives the public seat id = SHA-256(guestId) prefix, so other players never learn it.
  Same guestId = same seat + name on reconnect / reload (not a duplicate).
- Name rules (`validateName`): NFC, trim, collapse spaces, strip zero-width spaces; 2-16 graphemes (Tamil
  letters with vowel signs count as one); letters, marks, digits, space . ' - ; at least one letter. No blank or
  emoji-only names. The dice button suggests fun names (English + Tamil).
- Unique per room: case-insensitive key of the normalized name, checked at join and on rename. Taken ->
  `name_taken` with 2-3 free suggestions ("Karthik K", "Karthik 2", a random fun name), tappable.
- Rename: lobby only. Players are identified by seat id everywhere, never by name.

## Defaults (easy to change)
- Guests can host (`src/online/roomLogic.js`: `join` makes the first member host).
- Narration audio plays on the host device only (`useNarration` in `OnlineApp.jsx`).
- Dead players see nothing extra (`viewFor`: roles hidden until END).
- Votes are open (`viewFor` sends `votes`; drop it to make them secret). Tie or no votes = nobody out.
  The vote closes early when every alive player has voted.
- Room settings: language (Tamil default / English), narrator voice (Rasa/Jaya or George/Heart),
  night turn, discussion, voting time.
- Host leaves for 30 s -> next connected player becomes host. Offline lobby members are dropped after 60 s.
  Rooms are wiped 2 h after the last activity. 4-15 players.

## Video
- WebRTC mesh (each phone connects to every other phone), DO relays offers / answers / ICE.
  Fine for ~6-8 players on phones; beyond that an SFU (Cloudflare Realtime) is the upgrade path.
- Cloudflare Realtime was not used: it needs a Cloudflare account + app token and does not run locally.
- ICE: public STUN only by default. Players behind strict / symmetric NATs (some mobile carriers, office
  Wi-Fi) need a TURN relay: set `TURN_URLS` (comma separated), `TURN_USERNAME`, `TURN_CREDENTIAL` as Worker
  vars/secrets (e.g. Cloudflare Realtime TURN, or coturn).
- Night: camera and mic tracks are disabled on every phone (tiles show a moon); restored at day.
- No camera / denied: the player joins with a name tile and still sees and hears everyone.

## Run locally
    npm install
    npm run dev            # vite + Worker + Room DO in workerd, http://localhost:5173
    npm test               # vitest (unit)
    node e2e/online-protocol.mjs http://localhost:5173       # headless 5-socket game
    BASE_URL=http://localhost:5173 node e2e/online.e2e.mjs   # 5 Chrome guests, screenshots -> /workspace/shots/online
  `?fast=1` on `/online` creates a room with short timers (tests). `NO_WORKER=1 npm run dev` = old static dev.
  The box's Chrome policy blocks direct UDP for WebRTC, so on the box the e2e ran with a local coturn over TCP:
    turnserver -n --listening-ip=127.0.0.1 --relay-ip=127.0.0.1 --no-tls --no-dtls --lt-cred-mech \
      --user=e2e:e2epass --realm=mafia.local --allow-loopback-peers --no-cli &
    TURN_URL='turn:127.0.0.1:3478?transport=tcp' BASE_URL=http://localhost:5180 node e2e/online.e2e.mjs
  A normal desktop Chrome does not need TURN_URL.

## Enable Google sign-in (later)
1. Google Cloud Console -> APIs & Services -> OAuth consent screen: External, app name, support email.
2. Credentials -> Create credentials -> OAuth client ID -> Web application.
   - Authorized JavaScript origins: `https://<your-worker-host>` and `http://localhost:5173`
   - Authorized redirect URIs: `https://<your-worker-host>/api/auth/callback/google` and
     `http://localhost:5173/api/auth/callback/google`
3. `npx wrangler d1 create mafia-auth` -> uncomment `d1_databases` in `wrangler.jsonc` with that `database_id`.
4. `npm run db:migrate` (remote) / `npm run db:migrate:local`.
5. Secrets: `npx wrangler secret put GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`
   (random 32+ chars); optional var `BETTER_AUTH_URL=https://<your-worker-host>`. Locally put them in `.dev.vars`.
6. `/api/config` then reports `google: true` and the name screen shows "Sign in with Google".
   Still to build: map the Google user to a seat (better-auth `anonymous` plugin links the guest).

## Deploy (needs your OK + your Cloudflare account)
1. `npx wrangler login`
2. (Google only) steps 3-5 above. Without Google nothing else is needed (the D1 block is commented out).
3. `npm run deploy` (= `vite build && wrangler deploy`) -> `https://mafia-dealer.<account>.workers.dev`.
4. Free plan: Durable Objects with SQLite storage are on the Workers Free plan.
- Cloudflare Pages (current site) keeps building `npm run build`, which stays a static build (`NO_WORKER=1`).
  Online mode needs the Worker deploy; on the Pages site `/online` cannot connect.

## Known issues / limits
- No TURN by default (see Video). Mesh video does not scale past ~8 players.
- Camera light stays on at night (tracks are disabled, not stopped) so turning back on is instant.
- partyserver is pre-1.0; pin versions.
- Mafia teammates see each other's night picks; last pick counts (engine behaviour).
- Spectators (joined after the start) watch the next game; they get no roles.
- `e2e/narrator.e2e.mjs` (old single-device e2e) already fails on `tamil-narrator` (expects English voice
  names); a Tamil-adjusted copy behaves identically on both branches.
