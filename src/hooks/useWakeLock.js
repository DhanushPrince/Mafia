import { useEffect } from 'react';

/** Keep the screen awake while `active` (Screen Wake Lock API); silently no-op where unsupported. */
export default function useWakeLock(active) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return undefined;
    let sentinel = null;
    let disposed = false;
    const acquire = async () => {
      if (disposed || document.visibilityState !== 'visible') return;
      try {
        sentinel = await navigator.wakeLock.request('screen');
        if (disposed) sentinel.release().catch(() => {});
      } catch {
        // not allowed (battery saver, no permission, iframe...) - ignore
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') acquire();
    };
    acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      sentinel?.release?.().catch(() => {});
    };
  }, [active]);
}
