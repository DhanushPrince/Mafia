# Architecture Decision Records

Each record follows Michael Nygard's format: context, decision, consequences, alternatives.
Add a new file with the next number; to change a decision, add a new ADR that supersedes the old one.

| # | Decision | Status |
|---|----------|--------|
| [0001](0001-rule-based-game-engine.md) | Rule-based state machine for game logic | Accepted |
| [0002](0002-narrator-audio.md) | Pre-rendered narrator clips plus live name synthesis | Accepted |
| [0003](0003-configurable-timers.md) | Configurable narrator timers, fixed at game start | Accepted |
| [0004](0004-hosting-cloudflare.md) | Cloudflare Pages plus a Worker with one Durable Object per room | Accepted |
| [0005](0005-server-authoritative-hidden-info.md) | Server-authoritative hidden information | Accepted |
| [0006](0006-guest-identity-and-names.md) | Guest-first identity, unique per-room names; Google deferred | Accepted |
| [0007](0007-webrtc-mesh-video.md) | In-room video: WebRTC mesh with DO signalling | Accepted |
| [0008](0008-host-only-narration.md) | Narration on the host device only | Accepted |
| [0009](0009-pages-to-worker-origins-health.md) | Allowed origins, VITE_ROOMS_HOST, health endpoint | Accepted |
| [0010](0010-android-twa.md) | Android as a Trusted Web Activity | Proposed |
| [0011](0011-google-meet-addon.md) | Google Meet add-on as the shared screen | Proposed |

Architecture overview: [../ONLINE_ROOMS.md](../ONLINE_ROOMS.md).
