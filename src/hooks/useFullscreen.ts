import { useCallback, useEffect, useState } from 'react';

/** 화면 전체 보기. 한 번 켜면 다른 화면으로 옮겨도 계속 유지된다. */
export function useFullscreen() {
  const supported = typeof document !== 'undefined' && Boolean(document.fullscreenEnabled);
  const [active, setActive] = useState(() => typeof document !== 'undefined' && Boolean(document.fullscreenElement));

  useEffect(() => {
    const onChange = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  /** 실패하면 false (이 기기에서 쓸 수 없을 때) */
  const toggle = useCallback(async (): Promise<boolean> => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      return true;
    } catch {
      return false;
    }
  }, []);

  return { supported, active, toggle };
}
