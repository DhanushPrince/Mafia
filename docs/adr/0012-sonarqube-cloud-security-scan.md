# 12. SonarQube Cloud and npm audit in CI for security scanning

- Status: Accepted
- Date: 2026-10-25

## Context

The repo had no automated security or quality checks. The Worker handles guest identity, auth (better-auth) and
WebRTC signalling, so injection, secrets in code, and vulnerable dependencies matter. The repo is public, and
the project runs on free tiers.

## Decision

Add a GitHub Actions workflow (`security-scan.yml`) with two jobs:

- **SonarQube Cloud** via the official `SonarSource/sonarqube-scan-action` (pinned by SHA, v8.3.0), on pushes to
  `main`/`online-rooms` and on pull requests, with full git history (`fetch-depth: 0`) and Vitest lcov coverage.
  Configuration lives in `sonar-project.properties` (`sources=src,worker`). CI-based analysis is used instead of
  SonarQube Cloud's Automatic Analysis so coverage is included and the analysis runs with the same Node/npm setup
  as the tests; Automatic Analysis must be turned off.
- **npm audit** (`--audit-level=high`) for known-vulnerable dependencies, runtime deps first, then everything.
  It started **non-blocking** (`continue-on-error`) because the lockfile had high advisories (vite, rollup,
  postcss, nanoid, sharp, source-map-js). Those are now fixed (`npm audit fix`, plus `overrides` in package.json
  forcing patched `sharp` ^0.35.5 under kokoro-js -> @huggingface/transformers, and `undici` ^7.30.1 under
  miniflare), so the job is **blocking**: any new high advisory fails it.

## Consequences

- Needs a SonarQube Cloud organization/project and a `SONAR_TOKEN` repo secret (docs/SECURITY_SCAN.md).
- `projectKey`/`organization` in `sonar-project.properties` must match the SonarQube Cloud project.
- Adds `@vitest/coverage-v8` as a dev dependency and an `npm run test:coverage` script.
- Fork PRs skip the Sonar job (no secrets).

## Alternatives considered

- GitHub CodeQL: free for public repos and good for JS, but the request was SonarQube; CodeQL can be added later.
- SonarQube Cloud Automatic Analysis only: zero CI config, but no coverage and no control over the run.
- Self-hosted SonarQube Server: needs a server to run and maintain.
