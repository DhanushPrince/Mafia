# 10. Android packaging as a Trusted Web Activity

- Status: Proposed
- Date: 2026-10-25

## Context

A Play Store app is planned. A plain WebView app (Capacitor) is the usual shortcut, but Google blocks its
OAuth pages in embedded WebViews (error `disallowed_useragent`), which would break Google sign-in.

## Decision

Package the web app as a Trusted Web Activity built with Bubblewrap CLI. It runs in Chrome, so Google sign-in,
One Tap, redirects and first-party cookies work. Needs a PWA manifest and `assetlinks.json` on the domain.

## Consequences

- One codebase; store updates are mostly web deploys.
- Requires Chrome (or a TWA-capable browser) on the device.
- espeak-ng GPL-3.0 licence question (ADR 2) must be settled before release.

## Alternatives considered

- Capacitor WebView: needs a native sign-in plugin (Credential Manager) to get around the WebView block.
