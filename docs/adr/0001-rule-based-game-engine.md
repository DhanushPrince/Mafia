# 1. Rule-based state machine for game logic

- Status: Accepted
- Date: 2026-10-23 (commit `3036e23`; reused by the server in `502b7de`, 2026-10-25)

## Context

Mafia is a fixed set of rules: night turns in a set order (Mafia, Doctor, Detective), a morning result, a
discussion, a vote and a win check. The app first ran a single-phone narrator mode, then needed an online
mode where a server runs the same game for every phone. Rules must behave the same in both places and be
testable without a browser.

## Decision

Game logic is a pure, deterministic state machine with no AI and no I/O:

- `src/game/engine.js`: phases (`PHASES`) and a reducer; night order is data-driven (`ROLE_DEFS`).
- `src/game/roles.js`: deck generation per player count. UI visuals (lucide icons, colours) moved to
  `src/game/roleVisuals.js` so the server can import the rules without React (`502b7de`).
- `src/game/timing.js`: turn, discussion and clip timings.

The online room (`src/online/roomLogic.js`) wraps the same engine and is also pure. The Durable Object
(`worker/room.js`) only does storage, sockets and alarms.

## Consequences

- One rule set for the single-device modes and online rooms; a bug fix lands in both.
- Fast unit tests: 173 Vitest tests at `f9ad1b7`, including a full online game to END driven only by alarms.
- Randomness (deck shuffle) is injectable, so tests are repeatable.
- New roles mean editing `ROLE_DEFS` and the deck table, not UI code.

## Alternatives considered

- boardgame.io or Colyseus rule schemas: good designs, but they need their own Node server (see ADR 4). We
  copied the idea of a per-player view (`playerView`) only.
- An LLM as game master: not needed for fixed rules, adds cost, latency and non-determinism.
