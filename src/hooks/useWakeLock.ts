import { useEffect } from 'react';

interface WakeLockSentinelLike {
  release: () => Promise<void>;
  addEventListener: (type: 'release', cb: () => void) => void;
}

interface WakeLockLike {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>;
}

/** 이 화면이 열려 있는 동안 태블릿 화면이 꺼지지 않게 한다 (지원 기기에서만) */
export function useWakeLock(): void {
  useEffect(() => {
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
    if (!wakeLock) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let disposed = false;

    const acquire = async () => {
      if (disposed || document.visibilityState !== 'visible' || sentinel) return;
      try {
        const s = await wakeLock.request('screen');
        if (disposed) {
          void s.release();
          return;
        }
        sentinel = s;
        s.addEventListener('release', () => {
          if (sentinel === s) sentinel = null;
        });
      } catch {
        /* 배터리 절약 모드 등으로 거절될 수 있음 */
      }
    };

    // 다른 앱에 갔다 오면 잠금이 풀리므로 다시 요청
    const onVisible = () => void acquire();
    document.addEventListener('visibilitychange', onVisible);
    void acquire();

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release();
      sentinel = null;
    };
  }, []);
}
