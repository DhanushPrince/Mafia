# Online rooms: progress log

Branch `online-rooms` (from `tamil-narrator`). Local commits only. No push, no deploy.

## Design
- Worker (`worker/index.js`): better-auth at `/api/auth/*` (D1 binding `DB`), `/api/config`, PartyServer rooms at `/parties/room/<CODE>`.
- Room Durable Object (`worker/room.js`, partyserver `Server`): lobby, card pick, engine (`src/game/engine.js` unchanged), alarms timeline, per-seat views, WebRTC signaling relay.
- Engine player `name` = seatId (collision-proof); display names live in the room's member list.
- Video: WebRTC mesh, DO relays offers/answers/ICE, public STUN. No TURN.
- Narration: server sends `cue` to host; host acks `cueDone`; server alarm fallback.

## Status
- [ ] deps installed
- [x] deps installed: partyserver 0.5.10, partysocket 1.3.0, better-auth 1.7.12 (Google stub only), uqr (QR), dev: wrangler 4.152, @cloudflare/vite-plugin 1.65
- [x] `ROLES` visuals moved to `src/game/roleVisuals.js` (roles.js has no UI imports)
- [x] `src/online/names.js` + tests: guest name rules (see below)
- [x] `src/online/roomLogic.js` + tests: lobby, card pick, timeline, per-seat views, votes

## Guest identity and names (parent steer 13:40 IST)
- Guest first. Google sign-in is a stub (`worker/auth.js`), enabled only when GOOGLE_CLIENT_ID/SECRET are set.
- Device keeps `{ guestId, name }` in localStorage. guestId is a random secret; the server derives the public
  seat id = SHA-256(guestId) prefix, so other players never learn it. Same guestId = same seat on reconnect.
- Name rules (`validateName`): NFC, trim, collapse spaces; 2-16 graphemes; letters/marks/digits/space . ' -;
  at least one letter. Dice button suggests fun names (English + Tamil).
- Unique per room: case-insensitive key of the normalized name, checked at join and on rename. Taken ->
  `name_taken` with 2-3 free suggestions ("Karthik K", "Karthik 2", random fun name). Rename: lobby only.
- Players are identified by seat id everywhere; engine player `name` = seat id.

## Defaults (easy to change in roomLogic.js / OnlineGame)
- Guests can host. Narration audio on the host device only. Dead players see nothing extra.
- Votes are open (everyone sees who voted whom). Tie or no votes = nobody out. Vote closes early when all alive voted.
