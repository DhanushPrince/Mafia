# 5. Server-authoritative hidden information

- Status: Accepted
- Date: 2026-10-25 (commit `502b7de`)

## Context

Mafia depends on secrets: roles, Mafia targets, the Detective's answer. Anything sent to a phone can be read
with developer tools, so hiding it only in the UI is not enough.

## Decision

- The server keeps the full room (`roomLogic.js`). Each socket gets its own view from
  `viewFor(room, seat)`:
  - your own role only; other roles are hidden until the game ends;
  - Mafia teammates and their picks only to alive Mafia during the Mafia turn;
  - the Detective's result only to the Detective;
  - dead players and spectators get the public view plus their own role.
- Card pick: the shuffled deck stays on the server. Clients see which cards are taken and by whom, never
  what is under them; the server checks that a card is free and assigns it.
- The server tallies votes, closes the vote early when every alive player has voted, and treats a tie or
  no votes as nobody out. Votes are open (everyone sees who voted for whom): a room default.
- Players are identified by seat id; the engine's player `name` is the seat id.

## Consequences

- Cheating by inspecting traffic shows only what that player may know. Unit tests check view privacy.
- All actions go through the server, so clients are thin and cannot disagree about state.
- Making votes secret is a one-line change (stop sending `votes` in `viewFor`).

## Alternatives considered

- Send the whole state and hide in the UI: simple but leaks roles.
- Client-side shuffle with commit-reveal: complex for no gain once a server exists.
