import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import type { EmotionVideoSlot, VideoSlot } from '../types';

export type BaseMode = 'idle' | 'talking';

const READY_EVENTS = ['loadeddata', 'canplay', 'seeked'] as const;
/** 준비 신호가 끝내 오지 않아도 이 시간이 지나면 그냥 전환한다 */
const READY_FALLBACK_MS = 1500;

/** 영상의 현재 프레임을 그릴 수 있게 되면 cb를 한 번 호출한다 */
function whenFrameReady(el: HTMLVideoElement, cb: () => void) {
  let done = false;
  const fire = () => {
    if (done) return;
    done = true;
    READY_EVENTS.forEach((ev) => el.removeEventListener(ev, fire));
    window.clearTimeout(timer);
    cb();
  };
  const timer = window.setTimeout(fire, READY_FALLBACK_MS);
  if (el.readyState >= 2 && !el.seeking) {
    fire();
    return;
  }
  READY_EVENTS.forEach((ev) => el.addEventListener(ev, fire));
}

export interface DualVideoHandle {
  /** 감정 영상을 1회 재생한 뒤 현재 기본 모드로 복귀. 영상이 없으면 false */
  playEmotion: (slot: EmotionVideoSlot) => boolean;
}

interface DualVideoPlayerProps {
  urls: Partial<Record<VideoSlot, string>>;
  mode: BaseMode;
  posterUrl: string | null;
  fadeMs?: number;
}

/**
 * Seamless Video Engine
 * - <video> 두 개를 겹쳐두고, 다음 영상은 뒤쪽(보이지 않는) 플레이어에 미리 로드한다.
 * - 첫 프레임이 준비되면 앞으로 올리면서 opacity 0→1로 페이드인한다.
 * - 이전 영상은 페이드가 끝날 때까지 불투명 상태로 아래에 남아 있어 검은 화면이 절대 보이지 않는다.
 */
const DualVideoPlayer = forwardRef<DualVideoHandle, DualVideoPlayerProps>(function DualVideoPlayer(
  { urls, mode, posterUrl, fadeMs = 420 },
  ref,
) {
  const videoA = useRef<HTMLVideoElement>(null);
  const videoB = useRef<HTMLVideoElement>(null);
  const activeIdx = useRef<0 | 1 | null>(null);
  const current = useRef<{ slot: VideoSlot; loop: boolean } | null>(null);
  /** 마지막으로 요청한 영상 (아직 로딩 중일 수 있음) */
  const target = useRef<{ slot: VideoSlot; loop: boolean } | null>(null);
  const token = useRef(0);
  const oneShot = useRef(false);
  /** 감정 영상이 끝나지 않는 경우(코덱 오류·ended 누락)를 위한 감시 타이머 */
  const oneShotTimer = useRef<number | null>(null);
  /** 로딩 중인(아직 보이지 않는) 플레이어 */
  const pendingIdx = useRef<0 | 1 | null>(null);
  const modeRef = useRef<BaseMode>(mode);
  const urlsRef = useRef(urls);

  const getEl = (idx: 0 | 1) => (idx === 0 ? videoA.current : videoB.current);

  const transitionTo = useCallback(
    (slot: VideoSlot, loop: boolean): boolean => {
      const url = urlsRef.current[slot];
      if (!url) return false;

      // 이미 화면에 나오는 영상이 아니라 "마지막으로 요청한 영상"과 비교한다.
      // (말하기 영상이 로딩되는 사이 말이 끝나 기본 영상을 요청하면,
      //  화면엔 아직 기본 영상이 나온다는 이유로 요청이 무시되어 말하기 영상에 갇히던 버그 방지)
      const tgt = target.current;
      if (loop && tgt && tgt.slot === slot && tgt.loop) return true;
      target.current = { slot, loop };

      const myToken = ++token.current;
      const nextIdx: 0 | 1 = activeIdx.current === 0 ? 1 : 0;
      pendingIdx.current = nextIdx;
      const next = getEl(nextIdx);
      const prev = activeIdx.current === null ? null : getEl(activeIdx.current);
      if (!next) return false;

      // 다음 플레이어를 앞에 두되 투명하게 → 이전 영상이 계속 보인다
      next.style.transition = 'none';
      next.style.opacity = '0';
      next.style.zIndex = '2';
      if (prev) prev.style.zIndex = '1';
      next.loop = loop;
      next.muted = true;

      const reveal = () => {
        if (myToken !== token.current) return;
        const commit = () => {
          if (myToken !== token.current) return;
          // 강제 리플로우 후 페이드인
          void next.offsetWidth;
          next.style.transition = `opacity ${fadeMs}ms ease-in-out`;
          next.style.opacity = '1';
          activeIdx.current = nextIdx;
          pendingIdx.current = null;
          current.current = { slot, loop };
          if (!loop) {
            // 감정 영상: ended가 오지 않아도 영상 길이가 지나면 반드시 기본 영상으로 복귀
            const lengthMs = Number.isFinite(next.duration) && next.duration > 0 ? next.duration * 1000 : 10000;
            armOneShotTimer(lengthMs + 1500);
          }
          window.setTimeout(() => {
            if (myToken !== token.current || !prev) return;
            prev.pause();
            prev.style.transition = 'none';
            prev.style.opacity = '0';
          }, fadeMs + 60);
        };
        next.play().then(commit, commit);
      };

      if (next.src !== url) {
        next.src = url;
        next.load();
      } else {
        // 같은 영상을 처음부터 다시 재생. 되감기 중에는 readyState가 내려가는데,
        // loadeddata는 처음 로드할 때 한 번만 오므로 반드시 seeked/canplay도 함께 기다려야 한다.
        // (이걸 loadeddata만 기다리면 두 번째 복귀부터 영원히 대기 → 말하는 영상에 갇히는 버그)
        try {
          next.currentTime = 0;
        } catch {
          /* noop */
        }
      }
      whenFrameReady(next, reveal);
      return true;
    },
    [fadeMs],
  );

  const backToBase = useCallback(() => {
    if (!transitionTo(modeRef.current, true)) transitionTo('idle', true);
  }, [transitionTo]);

  function clearOneShotTimer() {
    if (oneShotTimer.current !== null) window.clearTimeout(oneShotTimer.current);
    oneShotTimer.current = null;
  }

  /** 감정 영상을 끝내고 현재 모드(기본/말하기)로 돌아간다 */
  const endOneShot = useCallback(() => {
    clearOneShotTimer();
    if (!oneShot.current) return;
    oneShot.current = false;
    backToBase();
  }, [backToBase]);

  function armOneShotTimer(ms: number) {
    clearOneShotTimer();
    oneShotTimer.current = window.setTimeout(endOneShot, ms);
  }

  const handleEnded = (idx: 0 | 1) => () => {
    if (idx !== activeIdx.current) return;
    endOneShot();
  };

  const handleError = (idx: 0 | 1) => () => {
    // 감정 영상이 깨졌거나(로딩 중 포함) 재생할 수 없는 형식이면 기본 루프로 복귀
    if (idx === activeIdx.current || idx === pendingIdx.current) endOneShot();
  };

  useImperativeHandle(
    ref,
    () => ({
      playEmotion: (slot) => {
        if (!urlsRef.current[slot]) return false;
        oneShot.current = true;
        // 4초 안에 감정 영상이 화면에 나오지 못하면 포기하고 복귀
        armOneShotTimer(4000);
        return transitionTo(slot, false);
      },
    }),
    [transitionTo, endOneShot],
  );

  useEffect(() => {
    urlsRef.current = urls;
    current.current = null;
    target.current = null;
    oneShot.current = false;
    clearOneShotTimer();
    backToBase();
  }, [urls, backToBase]);

  useEffect(() => () => clearOneShotTimer(), []);

  useEffect(() => {
    modeRef.current = mode;
    if (oneShot.current) return; // 감정 영상이 끝나면 자연스럽게 새 모드로 복귀
    backToBase();
  }, [mode, backToBase]);

  // 탭 복귀 시 멈춘 영상 재개
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || activeIdx.current === null) return;
      void getEl(activeIdx.current)?.play().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const videoClass = 'pointer-events-none absolute inset-0 h-full w-full object-cover';

  return (
    <div className="absolute inset-0 overflow-hidden bg-cream">
      {posterUrl && <img src={posterUrl} alt="" className={videoClass} draggable={false} />}
      <video
        ref={videoA}
        className={videoClass}
        style={{ opacity: 0 }}
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        onEnded={handleEnded(0)}
        onError={handleError(0)}
      />
      <video
        ref={videoB}
        className={videoClass}
        style={{ opacity: 0 }}
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        onEnded={handleEnded(1)}
        onError={handleError(1)}
      />
    </div>
  );
});

export default DualVideoPlayer;
