import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Brush, Eraser, Loader2, Scissors, Sparkles, Undo2, WandSparkles, X } from 'lucide-react';
import { cleanMask, findObjectAt, getOutlinePref, loadWorkCanvas, makeSticker, paintMask, prepareMagicScissors, setOutlinePref } from '../lib/cutout';
import { playPop, playSoftChime, playSparkle } from '../lib/sound';

interface CutoutStudioProps {
  photo: Blob;
  onClose: () => void;
  onDone: (sticker: { blob: Blob; width: number; height: number }) => void;
}

type Step = 'loading' | 'pick' | 'working' | 'review' | 'saving';
type BrushMode = 'erase' | 'restore' | null;
type MagicState = 'loading' | 'ready' | 'failed';

/** 사진에서 자연물만 오려 스티커로 만드는 화면 */
export default function CutoutStudio({ photo, onClose, onDone }: CutoutStudioProps) {
  const viewRef = useRef<HTMLCanvasElement>(null);
  const workRef = useRef<HTMLCanvasElement | null>(null);
  const alphaRef = useRef<Float32Array | null>(null);
  const undoRef = useRef<Float32Array[]>([]);
  const strokeRef = useRef<{ id: number } | null>(null);
  const [step, setStep] = useState<Step>('loading');
  const [magic, setMagic] = useState<MagicState>('loading');
  const [method, setMethod] = useState<'magic' | 'simple' | null>(null);
  const [brush, setBrush] = useState<BrushMode>(null);
  const [tapAt, setTapAt] = useState<{ x: number; y: number } | null>(null);
  const [message, setMessage] = useState('');
  const [undoCount, setUndoCount] = useState(0);
  const [outline, setOutline] = useState(getOutlinePref);

  useEffect(() => {
    let alive = true;
    prepareMagicScissors().then(
      () => alive && setMagic('ready'),
      () => alive && setMagic('failed'),
    );
    return () => {
      alive = false;
    };
  }, []);

  /** 사진 위에 오린 모양을 보여 준다: 바깥은 어둡게, 경계는 하얗게 반짝 */
  const render = useCallback(() => {
    const view = viewRef.current;
    const work = workRef.current;
    if (!view || !work) return;
    const W = work.width;
    const H = work.height;
    if (view.width !== W || view.height !== H) {
      view.width = W;
      view.height = H;
    }
    const ctx = view.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(work, 0, 0);
    const alpha = alphaRef.current;
    if (!alpha) return;
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && alpha[y * W + x] >= 0.5;
    const ring = Math.max(1, Math.round(Math.max(W, H) / 300));
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = y * W + x;
        const a = alpha[i];
        const p = i * 4;
        if (a >= 0.5) {
          const edge = !inside(x - ring, y) || !inside(x + ring, y) || !inside(x, y - ring) || !inside(x, y + ring);
          if (edge) {
            d[p] = 255;
            d[p + 1] = 255;
            d[p + 2] = 255;
          }
        } else {
          // 바깥은 코코아색으로 덮어 오린 모양이 잘 보이게
          d[p] = d[p] * 0.3 + 70 * 0.7;
          d[p + 1] = d[p + 1] * 0.3 + 52 * 0.7;
          d[p + 2] = d[p + 2] * 0.3 + 44 * 0.7;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }, []);

  useEffect(() => {
    let alive = true;
    loadWorkCanvas(photo)
      .then((canvas) => {
        if (!alive) return;
        workRef.current = canvas;
        setStep('pick');
        requestAnimationFrame(render);
      })
      .catch(() => alive && setMessage('사진을 열지 못했어요. 다른 사진을 골라 주세요.'));
    return () => {
      alive = false;
    };
  }, [photo, render]);

  const toImagePoint = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  };

  const cutAt = async (x: number, y: number) => {
    const work = workRef.current;
    if (!work) return;
    playPop();
    setTapAt({ x, y });
    setStep('working');
    setMessage('');
    // 반짝이 표시가 먼저 그려지도록 한 박자 쉰다
    await new Promise((r) => window.setTimeout(r, 60));
    const mask = await findObjectAt(work, x, y);
    const alpha = cleanMask(mask, x, y);
    setMethod(mask.method);
    setTapAt(null);
    if (!alpha) {
      setStep(alphaRef.current ? 'review' : 'pick');
      setMessage('여기서는 자연물을 못 찾았어요. 자연물 한가운데를 다시 콕 눌러 볼까요?');
      return;
    }
    alphaRef.current = alpha;
    undoRef.current = [];
    setUndoCount(0);
    setBrush(null);
    setStep('review');
    playSoftChime();
    render();
  };

  const paintAt = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const work = workRef.current;
    const alpha = alphaRef.current;
    if (!work || !alpha || !brush) return;
    const p = toImagePoint(e);
    const radius = Math.max(6, Math.round(Math.max(work.width, work.height) * 0.035));
    paintMask(alpha, work.width, work.height, p.x * work.width, p.y * work.height, radius, brush === 'restore');
    render();
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (step !== 'pick' && step !== 'review') return;
    if (step === 'review' && brush && alphaRef.current) {
      undoRef.current = [...undoRef.current.slice(-9), alphaRef.current.slice()];
      setUndoCount(undoRef.current.length);
      strokeRef.current = { id: e.pointerId };
      e.currentTarget.setPointerCapture(e.pointerId);
      paintAt(e);
      return;
    }
    const p = toImagePoint(e);
    void cutAt(p.x, p.y);
  };

  const undo = () => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    alphaRef.current = prev;
    setUndoCount(undoRef.current.length);
    render();
  };

  const finish = async () => {
    const work = workRef.current;
    const alpha = alphaRef.current;
    if (!work || !alpha) return;
    setStep('saving');
    const sticker = await makeSticker(work, alpha, outline);
    if (!sticker) {
      setStep('review');
      setMessage('오린 부분이 너무 작아요. 다시 콕 눌러 주세요.');
      return;
    }
    playSparkle();
    onDone(sticker);
  };

  const busy = step === 'loading' || step === 'working' || step === 'saving';
  const guide =
    step === 'review'
      ? brush === 'erase'
        ? '🧽 지울 곳을 손가락으로 문질러요'
        : brush === 'restore'
          ? '🖌️ 다시 살릴 곳을 손가락으로 문질러요'
          : '하얀 선 안쪽이 스티커가 돼요!'
      : step === 'working'
        ? '싹둑싹둑 오리는 중이에요...'
        : step === 'saving'
          ? '스티커로 만드는 중이에요...'
          : '꾸미고 싶은 자연물을 손가락으로 콕! 눌러요';

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-cocoa/85 backdrop-blur-sm" data-no-touch>
      <header className="flex items-center gap-3 px-4 pb-2 pt-4 text-white sm:px-6">
        <Scissors className="h-6 w-6 text-butter" />
        <h2 className="flex-1 font-cute text-2xl">자연물 오리기</h2>
        <MagicPill magic={magic} method={method} />
        <button type="button" onClick={onClose} className="rounded-full bg-white/90 p-2 text-cocoa shadow-soft active:scale-90" aria-label="닫기">
          <X className="h-5 w-5" />
        </button>
      </header>

      <p className="mx-auto mt-1 animate-pop-in rounded-full bg-white px-5 py-2 text-center font-cute text-lg text-cocoa shadow-soft sm:text-xl" key={guide}>
        {guide}
      </p>

      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
        {step === 'loading' && <Loader2 className="h-10 w-10 animate-spin text-white" />}
        <div className={`relative max-h-full max-w-full ${step === 'loading' ? 'hidden' : ''}`}>
          <canvas
            ref={viewRef}
            onPointerDown={onPointerDown}
            onPointerMove={(e) => {
              if (strokeRef.current?.id === e.pointerId) paintAt(e);
            }}
            onPointerUp={() => {
              strokeRef.current = null;
            }}
            onPointerCancel={() => {
              strokeRef.current = null;
            }}
            className={`block max-h-[calc(100dvh-15rem)] max-w-full touch-none rounded-3xl border-4 border-white object-contain shadow-soft ${
              busy ? 'cursor-wait' : brush ? 'cursor-crosshair' : 'cursor-pointer'
            }`}
          />
          {tapAt && (
            <span
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${tapAt.x * 100}%`, top: `${tapAt.y * 100}%` }}
              aria-hidden
            >
              <span className="absolute -inset-6 animate-ping rounded-full bg-butter/60" />
              <Sparkles className="relative h-10 w-10 animate-spin text-butter drop-shadow" />
            </span>
          )}
        </div>
      </div>

      {message && <p className="mx-auto mb-2 rounded-2xl bg-peach px-4 py-2 text-center text-cocoa shadow-soft">{message}</p>}

      <footer className="flex flex-wrap items-center justify-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:gap-3">
        {step === 'review' && (
          <>
            <button
              type="button"
              onClick={() => setBrush((b) => (b === 'erase' ? null : 'erase'))}
              className={`btn-storybook px-4 py-2 text-base ${brush === 'erase' ? 'bg-sky' : 'bg-white'}`}
            >
              <Eraser className="h-5 w-5" /> 지우기
            </button>
            <button
              type="button"
              onClick={() => setBrush((b) => (b === 'restore' ? null : 'restore'))}
              className={`btn-storybook px-4 py-2 text-base ${brush === 'restore' ? 'bg-sky' : 'bg-white'}`}
            >
              <Brush className="h-5 w-5" /> 살리기
            </button>
            {undoCount > 0 && (
              <button type="button" onClick={undo} className="btn-storybook bg-white px-4 py-2 text-base">
                <Undo2 className="h-5 w-5" /> 되돌리기
              </button>
            )}
            {brush && (
              <button type="button" onClick={() => setBrush(null)} className="btn-storybook bg-white px-4 py-2 text-base">
                <WandSparkles className="h-5 w-5" /> 다시 콕 누르기
              </button>
            )}
            <button
              type="button"
              role="switch"
              aria-checked={outline}
              onClick={() => {
                playPop();
                setOutline((v) => {
                  setOutlinePref(!v);
                  return !v;
                });
              }}
              className="btn-storybook bg-white px-4 py-2 text-base"
            >
              <span
                className={`relative inline-block h-6 w-11 rounded-full transition ${outline ? 'bg-mint' : 'bg-cocoa/20'}`}
                aria-hidden
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${outline ? 'left-[1.375rem]' : 'left-0.5'}`} />
              </span>
              흰 테두리 {outline ? '있음' : '없음'}
            </button>
            <button type="button" onClick={() => void finish()} className="btn-storybook bg-mint px-6 py-3 text-xl sm:text-2xl">
              <Sparkles className="h-6 w-6" /> 스티커 만들기
            </button>
          </>
        )}
        {busy && step !== 'loading' && (
          <p className="flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 font-cute text-lg text-cocoa">
            <Loader2 className="h-5 w-5 animate-spin" /> 잠깐만요
          </p>
        )}
      </footer>
    </div>
  );
}

function MagicPill({ magic, method }: { magic: MagicState; method: 'magic' | 'simple' | null }) {
  const simple = method === 'simple' || (method === null && magic === 'failed');
  if (simple) {
    return (
      <span className="hidden rounded-full bg-white/20 px-3 py-1 text-xs sm:inline" title="인터넷이 없거나 기기가 마법 가위를 못 써서 색으로 오려요">
        ✂️ 간단 가위 (단색 바닥에서 잘 돼요)
      </span>
    );
  }
  if (magic === 'loading') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> 마법 가위 준비 중 (처음 한 번만)
      </span>
    );
  }
  return <span className="hidden rounded-full bg-white/20 px-3 py-1 text-xs sm:inline">✨ 마법 가위</span>;
}
