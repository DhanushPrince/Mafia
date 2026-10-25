# 11. Google Meet add-on as the shared screen

- Status: Proposed
- Date: 2026-10-25

## Context

Many groups already play over Google Meet. A Meet add-on could show the game inside the call instead of a
separate video mesh.

## Decision

Build a Meet add-on with a side panel (start an activity) and a main stage page (opens for everyone),
reusing the same rooms. Sign-in in the add-on iframe uses One Tap (better-auth `oneTap`, ID token verified
without redirect) with a dialog-window fallback, because FedCM is not available there.

## Consequences

- Video and audio come from Meet; the app's mesh is not needed in that mode.
- Meet add-ons run on desktop and Android Meet, not mobile web.
- Needs Google Workspace Marketplace review. The Meet add-ons SDK npm package was last released Dec 2024;
  check it against current Meet docs before starting.

## Alternatives considered

- Share a browser tab in Meet: works today with no code, but only the sharer can interact.
