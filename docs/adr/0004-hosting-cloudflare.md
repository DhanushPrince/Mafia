# 4. Hosting: Cloudflare Pages plus a Worker with one Durable Object per room

- Status: Accepted
- Date: 2026-10-25 (Pages since 2026-09-03, commit `be2d593`; Worker in `e1e3fdb`)

## Context

The single-device game is a static site. Online rooms need a small stateful server: one place per room
that holds hidden roles, runs timers and pushes updates over WebSockets. Budget is the free tier.

## Decision

- The static app stays on Cloudflare Pages (`npm run build`, auto-deployed from GitHub).
- Online rooms run on a Cloudflare Worker (`worker/index.js`) with one Durable Object per room code
  (`worker/room.js`), using `partyserver` 0.5.10 on the server and `partysocket` 1.3.0 in the browser.
  The Worker also serves the app from Workers static assets, so it is a complete deploy on its own.
- Room state is one JSON value in Durable Object storage; DO alarms drive game timers; WebSocket
  hibernation means idle rooms use no compute time.
- Built with `@cloudflare/vite-plugin`, so `npm run dev` runs the app, Worker and DO locally in workerd.

## Consequences

- Measured at deploy (`f9ad1b7`): Worker upload 1580.93 KiB, 312.74 KiB gzipped; startup 7 ms; health
  check DO ping 9 to 123 ms from the box.
- Free tier limit (from the plan): 100,000 Durable Object requests a day; past it, requests fail until
  00:00 UTC (05:30 IST).
- `partyserver` is pre-1.0; versions are pinned.
- Two deploy targets: Pages (static) and the Worker (rooms). ADR 9 connects them.

## Alternatives considered

- boardgame.io (MIT): best `playerView` design, but needs an always-on Node server; last npm release 2022.
- Colyseus (MIT): good reconnection, but needs an always-on Node host (cost).
- Rune: games live inside the Rune app.
- Playroom Kit: SDK not open source; small, non-commercial free tier.
- Liveblocks: hosted shared documents with monthly caps; no server authority for hidden roles.
- Y-Sweet: CRDT documents; hosted service shut down 4 Mar 2026.
- Hand-written Durable Object WebSocket code: possible, but partyserver already gives rooms, tags,
  hibernation and reconnecting clients.
