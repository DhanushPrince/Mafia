# 3. Configurable narrator timers, fixed at game start

- Status: Accepted
- Date: 2026-10-24 (commit `f9c6afd`)

## Context

Night turns were fixed at 15 s. Groups play at different speeds: new players need longer, experienced
groups want shorter discussions. Changing timers in the middle of a game would confuse everyone.

## Decision

- The setup screen (and the online room's host settings) offers:
  - night role turn: 10, 15, 20, 30, 45, 60 s (default 15 s);
  - day discussion: 1, 2, 3, 5, 10 min (default 3 min);
  - online only: voting 30, 45, 60, 90, 120 s (default 60 s).
- The Detective's result window follows the turn length (3 to 8 s; 4 s at 15 s).
- Timers are copied into the game state when the game starts, so a resumed or online game keeps them.
- `?fast=1` overrides all timers for tests.

## Consequences

- Host controls pacing without code changes; old saves resume with their stored timers.
- Online, the server owns the deadlines (Durable Object alarms), so every phone agrees on the clock.

## Alternatives considered

- Fixed timers: simplest, but did not fit different groups.
- Changing timers mid-game: more flexible, but deadlines already announced would shift under players.
