/**
 * Press-and-hold timing for HoldButton.
 * Completion is driven by a real timer (setTimeout), so it fires after `holdMs` even when the
 * browser throttles or pauses animation frames (a busy or backgrounded WebKit page, low-power mode).
 * requestAnimationFrame only drives the progress bar.
 */
export function createHoldTimer({
  holdMs,
  onProgress,
  onComplete,
  now = () => performance.now(),
  raf = (f) => requestAnimationFrame(f),
  caf = (id) => cancelAnimationFrame(id),
  setT = (f, ms) => setTimeout(f, ms),
  clearT = (id) => clearTimeout(id),
}) {
  let startedAt = null;
  let frame = null;
  let timer = null;
  let done = false;

  const clear = () => {
    if (frame !== null) caf(frame);
    if (timer !== null) clearT(timer);
    frame = null;
    timer = null;
  };

  const finish = () => {
    if (done || startedAt === null) return;
    done = true;
    clear();
    startedAt = null;
    onProgress(1);
    onComplete?.();
  };

  const tick = () => {
    frame = null;
    if (startedAt === null || done) return;
    const p = Math.min(1, (now() - startedAt) / holdMs);
    onProgress(p);
    if (p >= 1) finish();
    else frame = raf(tick);
  };

  return {
    start() {
      if (startedAt !== null) return; // already holding
      done = false;
      startedAt = now();
      onProgress(0);
      timer = setT(finish, holdMs);
      frame = raf(tick);
    },
    /** Release / cancel: resets progress unless the hold already completed. */
    stop() {
      const wasHolding = startedAt !== null;
      clear();
      startedAt = null;
      if (wasHolding && !done) onProgress(0);
    },
    get holding() { return startedAt !== null; },
    get done() { return done; },
  };
}
