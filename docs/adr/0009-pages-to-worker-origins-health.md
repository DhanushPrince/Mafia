# 9. Allowed origins and VITE_ROOMS_HOST connect the Pages site to the Worker; health endpoint

- Status: Accepted
- Date: 2026-10-25 (commits `3e87ae3`, `f9ad1b7`)

## Context

The Pages preview of `/online` hung on "Connecting..." because Pages has no room server. The Worker is
deployed separately on workers.dev. Browsers on the Pages domain must reach it, and other sites must not.

## Decision

- The client reads `VITE_ROOMS_HOST` at build time (`src/online/roomsHost.js`). Empty means same origin.
- The Worker allows browser origins (`worker/origins.js`): itself, `https://mafia-dealer.pages.dev`, one-level
  previews `https://<branch>.mafia-dealer.pages.dev`, localhost, plus `ALLOWED_ORIGINS`. Others get 403
  on `/parties/*`. `/api/config` and `/api/health` send CORS headers to allowed origins only. Requests with
  no Origin (tests, monitors) are allowed.
- If the first connection takes over 8 s, `/online` shows "Can't reach the room server" with Try again.
- `GET /api/health` (also `/health`) returns `{ ok, version, commit, time, rooms: { ok, ms }, google, turn }`;
  `rooms` pings a Durable Object.

## Consequences

- One Worker serves both its own site and the Pages site.
- The Pages project needs `VITE_ROOMS_HOST` set in its build settings and a rebuild.
- Origin checks stop other websites from opening rooms through users' browsers; they do not stop
  non-browser clients.

## Alternatives considered

- Move the whole site from Pages to the Worker: one deploy, but changes the public URL.
- Pages Functions as a proxy: Pages Functions cannot host the Durable Object class itself.
