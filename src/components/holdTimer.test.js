import { describe, it, expect, vi } from 'vitest';
import { createHoldTimer } from './holdTimer';

function setup({ framesRun = true } = {}) {
  let t = 0;
  const timers = [];
  const frames = new Map();
  let fid = 0;
  const progress = [];
  const onComplete = vi.fn();
  const h = createHoldTimer({
    holdMs: 1500,
    onProgress: (p) => progress.push(p),
    onComplete,
    now: () => t,
    raf: (f) => { fid++; frames.set(fid, f); return fid; },
    caf: (id) => frames.delete(id),
    setT: (f, ms) => { const o = { f, at: t + ms, live: true }; timers.push(o); return o; },
    clearT: (o) => { o.live = false; },
  });
  const advance = (ms, step = 16) => {
    for (let end = t + ms; t < end;) {
      t = Math.min(end, t + step);
      for (const o of timers) if (o.live && o.at <= t) { o.live = false; o.f(); }
      if (framesRun) { const fs = [...frames.entries()]; frames.clear(); fs.forEach(([, f]) => f()); }
    }
  };
  return { h, advance, progress, onComplete };
}

describe('createHoldTimer', () => {
  it('completes after holdMs with animation frames running', () => {
    const { h, advance, progress, onComplete } = setup();
    h.start();
    advance(1400);
    expect(onComplete).not.toHaveBeenCalled();
    expect(progress.at(-1)).toBeGreaterThan(0.9);
    advance(200);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(progress.at(-1)).toBe(1);
  });

  it('still completes when animation frames are paused (throttled page)', () => {
    const { h, advance, onComplete } = setup({ framesRun: false });
    h.start();
    advance(1499);
    expect(onComplete).not.toHaveBeenCalled();
    advance(2);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('releasing early cancels and resets progress', () => {
    const { h, advance, progress, onComplete } = setup();
    h.start();
    advance(800);
    h.stop();
    expect(progress.at(-1)).toBe(0);
    advance(2000);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('fires once; a second start while holding is ignored', () => {
    const { h, advance, onComplete } = setup();
    h.start();
    advance(500);
    h.start();
    advance(1100);
    expect(onComplete).toHaveBeenCalledTimes(1);
    advance(3000);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('stop after completion keeps the full progress', () => {
    const { h, advance, progress } = setup();
    h.start();
    advance(1600);
    h.stop();
    expect(progress.at(-1)).toBe(1);
  });

  it('can be held again after a release', () => {
    const { h, advance, onComplete } = setup();
    h.start(); advance(300); h.stop();
    h.start(); advance(1600);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
