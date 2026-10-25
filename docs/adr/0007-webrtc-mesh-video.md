# 7. In-room video: WebRTC mesh with Durable Object signalling

- Status: Accepted
- Date: 2026-10-25 (commit `80476b8`)

## Context

Online Mafia is a talking game; players want to see each other. Video must cost nothing at small scale,
respect the night (nobody should see or hear during night turns), and work when a player refuses camera
access.

## Decision

- Each phone connects directly to every other phone (WebRTC mesh, `src/online/video.js`). The room's
  Durable Object relays offers, answers and ICE candidates between seats; it never stores them.
- Perfect negotiation, ordered signal handling, buffering of early signals and a 3 s watchdog that restarts
  a peer stuck for 8 s.
- ICE: public STUN by default. TURN is optional through Worker vars `TURN_URLS`, `TURN_USERNAME`,
  `TURN_CREDENTIAL`.
- At night every camera and mic track is disabled (tiles show a moon) and restored by day. Players can
  toggle camera and mic. Denied or missing devices fall back to audio only or receive-only.

## Consequences

- No media server cost; video quality depends on each phone's upload, so the mesh is practical for about
  6 to 8 players.
- Without TURN, players behind strict NATs or firewalls get no video. The e2e on the box uses a local
  coturn because the box's Chrome policy blocks direct WebRTC connections.
- The camera light stays on at night (tracks are disabled, not stopped) so day video resumes instantly.

## Alternatives considered

- Cloudflare Realtime (SFU): scales past the mesh limit; needs an account app token and does not run
  locally. Future option if rooms get larger.
- No video (voice call outside the app): simpler, but players asked for video in the room.
