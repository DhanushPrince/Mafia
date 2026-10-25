# 8. Narration plays on the host device only, with a server fallback

- Status: Accepted
- Date: 2026-10-25 (commit `80476b8`)

## Context

In an online room every phone could play the narrator. Players on a shared video call would then hear the
same line several times, out of sync, and their mics would pick it up as echo.

## Decision

- The server attaches a narration cue (clip ids) to each game step. Only the host's phone plays it, then
  sends `cueDone`; other phones show the same line as a caption.
- The server also sets a deadline from the clip count (normal mode: 5 s per clip plus 2 s), so a muted,
  slow or disconnected host never stalls the game. A late `cueDone` for an old cue is ignored.
- If the host is offline for 30 s, the next connected player becomes host.

## Consequences

- One voice for the room, heard by everyone through the host's call audio.
- Players in separate locations with no call audio only get captions.

## Alternatives considered

- Narration on every phone: echo and overlap on calls.
- Server-side audio stream: needs a media server; not worth it for short clips.
