# 6. Guest-first identity with unique per-room names; Google sign-in deferred

- Status: Accepted (Google sign-in: Proposed, stubbed)
- Date: 2026-10-25 (commits `502b7de`, `e1e3fdb`)

## Context

Friends join a room from a link in seconds; asking for an account first loses players. Names are said aloud
by the narrator and shown on video tiles, so two players with the same name would confuse everyone.
Players may type Tamil or English names, and mobile networks drop sockets often.

## Decision

- Guests only for now. The browser stores `{ guestId, name }` in localStorage (`mafia.online.guest`).
  The guest id is a random secret; the public seat id is a SHA-256 hash of it, so others never see it.
- Reconnecting with the same guest id returns to the same seat and name, also mid-game.
- Name rules (`src/online/names.js`): NFC normalised, trimmed, spaces collapsed, zero-width characters
  removed; 2 to 16 graphemes (a Tamil letter with its vowel sign counts as one); letters, marks, digits,
  space, `.`, `'`, `-`; at least one letter, so no blank or emoji-only names. A dice button suggests names.
- Names are unique per room, compared case-insensitively after normalising, at join and at rename. A taken
  name is refused with 2 to 3 suggestions. Rename is allowed in the lobby only.
- Google sign-in uses better-auth 1.7 with D1 (`worker/auth.js`, `migrations/0001_better_auth.sql`). It is
  only active when `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET` and the D1 binding are
  set; the binding is commented out in `wrangler.jsonc` (`8308c55`).

## Consequences

- Join by link takes one name field. Same name with different case or spacing ("Karthik", "  KARTHIK ")
  is refused; tests cover Tamil and case variants.
- A guest who clears browser storage gets a new seat.
- Linking a Google account to a guest seat is not built yet.

## Alternatives considered

- Google sign-in required: slows joining and blocks players without a Google account.
- Seats by name: breaks on duplicates and renames; ids are used everywhere instead.
