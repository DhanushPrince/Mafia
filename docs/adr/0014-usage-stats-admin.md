# 14. Anonymous usage stats in Analytics Engine, admin-only page

- Status: Accepted
- Date: 2026-10-28

## Context

We want to know how much the online rooms are used: guests per day, rooms created, games started and
finished, players per game. Only the owner should see it. Constraints: the free Workers plan; the Durable
Object free quota already ran out once (2026-10-25, `rows_written`), so stats must not add DO storage writes;
no personal data (display names, guest secrets) may be stored.

## Options

1. **Workers Analytics Engine** (chosen). `writeDataPoint` is fire-and-forget, does not touch DO storage,
   and the free plan includes 100,000 data points written and 10,000 read queries per day. Data is kept
   3 months. Reading needs the SQL API with an API token that has *Account Analytics: Read*. The existing
   deploy token (`CLOUDFLARE_API_TOKEN`) was checked on 2026-10-28 and gets "Authorization error" from the
   SQL API, so a separate read-only token is stored as a Worker secret.
2. **Stats Durable Object** with daily counters and a per-day set of hashed guests. No extra token, but every
   event costs a DO request plus storage writes, which is exactly the quota that ran out. Rejected.
3. Third-party analytics. Sends data off Cloudflare and needs client code. Rejected.

## Decision

- The Room (`worker/room.js`) diffs the room before and after each `save()` (`worker/usage.js`,
  `usageEvents`) and writes one data point per event to binding `USAGE` (dataset `mafia_usage`):
  - `room_create`: a room comes into being; `join`: a seat new to the room (reconnects are not counted);
    `game_start`: status moves into `game`; `game_end`: the game reaches END (once).
  - Layout: `index1` = room code, `blob1` = event, `blob2` = room code, `blob3` = guest hash (joins only),
    `blob4` = day in Asia/Kolkata (`YYYY-MM-DD`), `double1` = player count (members for joins, game players
    for start/end).
  - The guest hash is `SHA-256("mafia-usage:" + seat)`, first 8 bytes. Seat ids are already a hash of the guest
    secret, but they are visible to everyone in the room, so the stats use a further hash that cannot be
    matched to a seat seen in a room view. No names, guest secrets or seat ids are written.
  - e2e rooms (`fast=1`) are not counted. Writes never throw into the room (best-effort).
- `GET /api/admin/stats` (`worker/admin.js`) requires `Authorization: Bearer <ADMIN_TOKEN>`. The key is compared
  in constant time (SHA-256 of both, then `timingSafeEqual` or an XOR loop). No secret configured, a secret
  shorter than 16 characters, a missing or wrong key: 401 with no data. The right key but no read token: 503.
  It runs three SQL queries (counts per day and event, distinct guests per day, distinct guests overall) for
  the last 30 days, weighting counts by `_sample_interval`.
- `/admin` is a small self-contained page served by the Worker (dark styling like the app, no build step).
  It asks for the key, keeps it in `sessionStorage` only, and shows totals plus a per-day table. Page and API
  send `x-robots-tag: noindex, nofollow` and `cache-control: no-store`; the page has a strict CSP
  (`script-src 'self'`, `frame-ancestors 'none'`) and a robots meta tag. `/admin` and `/admin/*` are added to
  `run_worker_first` so the SPA fallback never answers them.

## Consequences

- Going live needs three Worker secrets: `ADMIN_TOKEN`, `CF_ACCOUNT_ID`, `CF_ANALYTICS_TOKEN` (permission
  Account > Account Analytics > Read, nothing else). Until set, rooms still write events and the admin API
  stays closed.
- Days are Asia/Kolkata days, fixed at write time. "Unique guests" means distinct guest secrets (a browser),
  so one person on two devices counts twice and clearing site data makes a new guest.
- Stats cover the online rooms only (narrator mode is offline and sends nothing). Retention is 3 months;
  the page shows 30 days.
- The SQL query text has not been run against live data yet (no dataset before the first deploy); the first
  page load after go-live is the check.
