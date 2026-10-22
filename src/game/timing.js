// Narrator timings. `?fast=1` shrinks everything for e2e tests.
const fast = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('fast') === '1';

export const TIMING = fast
  ? { fast, turnMs: 3000, resultMs: 1200, discussMs: 4000, gapMs: 150, rate: 3 }
  : { fast, turnMs: 15000, resultMs: 4000, discussMs: 180000, gapMs: 1200, rate: 1 };
