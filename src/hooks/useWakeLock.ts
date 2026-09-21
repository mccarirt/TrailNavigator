import { useEffect, useRef, useState } from 'react';

export function useWakeLock(isActive: boolean) {
  const [isLocked, setIsLocked] = useState(false);
  const wakeLockSentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    let released = false;

    async function requestLock() {
      if (
        typeof navigator !== 'undefined' &&
        'wakeLock' in navigator &&
        isActive &&
        !released
      ) {
        try {
          const sentinel = await navigator.wakeLock.request('screen');
          wakeLockSentinelRef.current = sentinel;
          setIsLocked(true);

          sentinel.addEventListener('release', () => {
            setIsLocked(false);
          });
        } catch (err) {
          console.warn('Wake Lock request error:', err);
          setIsLocked(false);
        }
      }
    }

    async function releaseLock() {
      if (wakeLockSentinelRef.current) {
        try {
          await wakeLockSentinelRef.current.release();
        } catch {}
        wakeLockSentinelRef.current = null;
      }
      setIsLocked(false);
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isActive) {
        requestLock();
      }
    };

    if (isActive) {
      requestLock();
      document.addEventListener('visibilitychange', handleVisibilityChange);
    } else {
      releaseLock();
    }

    return () => {
      released = true;
      releaseLock();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isActive]);

  return isLocked;
}
