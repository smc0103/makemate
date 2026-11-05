import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { RefreshCw } from 'lucide-react';
import type { EmotionVideoSlot, FaceMap } from '../types';
import type { BaseMode, DualVideoHandle } from './DualVideoPlayer';
import { VIDEO_SLOTS } from '../lib/emotions';
import PuppetFace from './PuppetFace';

interface FaceMarkerProps {
  imageUrl: string;
  value: FaceMap | null;
  onChange: (face: FaceMap | null) => void;
  /** 넣어 둔 감정 영상이 있으면 미리보기에서 영상으로 보여준다 */
  emotionVideos?: Partial<Record<EmotionVideoSlot, string>>;
}

const EMOTION_BUTTONS = VIDEO_SLOTS.filter((s) => !s.required) as Array<(typeof VIDEO_SLOTS)[number] & { slot: EmotionVideoSlot }>;

type Point = { x: number; y: number };
type Stage = 'eye1' | 'eye2' | 'mouth' | 'done';

const PROMPT: Record<Stage, string> = {
  eye1: '👁️ 첫 번째 눈의 가운데를 눌러 주세요',
  eye2: '👁️ 두 번째 눈을 눌러 주세요',
  mouth: '👄 입의 가운데를 눌러 주세요. 입이 없으면 아래 버튼을 눌러요',
  done: '잘못 찍은 곳이 있으면 근처를 눌러서 옮겨요',
};

function defaultSizes(a: Point, b: Point | null, mouth: Point | null, aspect: number) {
  // 위치는 그림 가로·세로 비율이고, 크기는 긴 변 기준이다
  const toSide = (p: Point) => (aspect >= 1 ? { x: p.x, y: p.y / aspect } : { x: p.x * aspect, y: p.y });
  const dist = (p: Point, q: Point) => Math.hypot(toSide(p).x - toSide(q).x, toSide(p).y - toSide(q).y);
  const span = b ? dist(a, b) : mouth ? dist(a, mouth) * 0.9 : 0.3;
  return { eyeSize: Math.max(0.02, span * 0.22), mouthSize: Math.max(0.03, span * 0.42) };
}

/** 그림에서 눈과 입 위치를 눌러 알려 주는 화면 */
export default function FaceMarker({ imageUrl, value, onChange, emotionVideos }: FaceMarkerProps) {
  const previewRef = useRef<DualVideoHandle>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(1);
  const [eye1, setEye1] = useState<Point | null>(value?.leftEye ?? null);
  const [eye2, setEye2] = useState<Point | null>(value?.rightEye ?? null);
  const [oneEye, setOneEye] = useState(Boolean(value && !value.rightEye));
  const [mouth, setMouth] = useState<Point | null>(value?.mouth ?? null);
  const [noMouth, setNoMouth] = useState(Boolean(value && !value.mouth));
  const [eyeSize, setEyeSize] = useState(value?.eyeSize ?? 0);
  const [mouthSize, setMouthSize] = useState(value?.mouthSize ?? 0);
  const [talking, setTalking] = useState<BaseMode>('idle');

  useEffect(() => {
    const img = new Image();
    img.onload = () => setAspect(img.naturalWidth / img.naturalHeight);
    img.src = imageUrl;
  }, [imageUrl]);

  const stage: Stage = !eye1 ? 'eye1' : !eye2 && !oneEye ? 'eye2' : !mouth && !noMouth ? 'mouth' : 'done';
  const face: FaceMap | null =
    eye1 && (mouth || noMouth) && eyeSize > 0
      ? { leftEye: eye1, rightEye: oneEye ? null : eye2, mouth: noMouth ? null : mouth, eyeSize, mouthSize }
      : null;

  // 부모에게 현재 값을 알린다
  const faceKey = JSON.stringify(face);
  useEffect(() => {
    onChange(face);
    // 내용이 바뀔 때만 알린다 (face 객체는 렌더마다 새로 만들어진다)
  }, [faceKey]);

  const applyDefaults = (a: Point, b: Point | null, m: Point | null) => {
    const sizes = defaultSizes(a, b, m, aspect);
    setEyeSize(sizes.eyeSize);
    setMouthSize(sizes.mouthSize);
  };

  const handleTap = (e: PointerEvent<HTMLDivElement>) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    const p = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
    if (stage === 'eye1') {
      setEye1(p);
    } else if (stage === 'eye2') {
      setEye2(p);
    } else if (stage === 'mouth') {
      setMouth(p);
      if (eye1) applyDefaults(eye1, oneEye ? null : eye2, p);
    } else {
      // 가장 가까운 표시를 옮긴다
      const options: Array<{ point: Point | null; set: (v: Point) => void }> = [
        { point: eye1, set: setEye1 },
        { point: oneEye ? null : eye2, set: setEye2 },
        { point: noMouth ? null : mouth, set: setMouth },
      ];
      let best = options[0];
      let bestDist = Infinity;
      for (const o of options) {
        if (!o.point) continue;
        const d = Math.hypot(o.point.x - p.x, (o.point.y - p.y) / aspect);
        if (d < bestDist) {
          bestDist = d;
          best = o;
        }
      }
      best.set(p);
    }
  };

  const reset = () => {
    setEye1(null);
    setEye2(null);
    setOneEye(false);
    setMouth(null);
    setNoMouth(false);
    setEyeSize(0);
    setMouthSize(0);
    setTalking('idle');
  };

  // 표시 원의 크기는 긴 변 기준 비율을 화면 비율로 바꿔 그린다
  const widthPct = (size: number) => (aspect >= 1 ? size * 100 : (size * 100) / aspect);
  const marker = (p: Point, size: number, label: string, color: string) => (
    <span
      key={label}
      aria-hidden
      className="pointer-events-none absolute flex items-center justify-center rounded-full border-[3px]"
      style={{
        left: `${p.x * 100}%`,
        top: `${p.y * 100}%`,
        width: `${Math.max(widthPct(size) * 2, 5)}%`,
        aspectRatio: '1',
        transform: 'translate(-50%, -50%)',
        borderColor: color,
        background: `${color}22`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
    </span>
  );

  return (
    <div className="mt-6 grid items-start gap-6 md:grid-cols-[1fr_1fr]">
      <div>
        <p className="mb-2 rounded-2xl bg-butter/70 px-4 py-2 text-center font-cute text-lg">{PROMPT[stage]}</p>
        <div
          ref={boxRef}
          onPointerDown={handleTap}
          className="relative mx-auto w-full cursor-crosshair touch-none select-none overflow-hidden bg-white shadow-soft"
          style={{ aspectRatio: String(aspect), maxHeight: '60dvh' }}
          role="application"
          aria-label="그림에서 눈과 입 위치 누르기"
        >
          <img src={imageUrl} alt="친구 그림" className="h-full w-full" draggable={false} />
          {eye1 && marker(eye1, eyeSize, 'eye1', '#2E86C1')}
          {eye2 && !oneEye && marker(eye2, eyeSize, 'eye2', '#2E86C1')}
          {mouth && !noMouth && marker(mouth, mouthSize, 'mouth', '#E0568A')}
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {stage === 'eye2' && (
            <button type="button" onClick={() => setOneEye(true)} className="btn-storybook bg-white px-4 py-1.5 text-base">
              옆모습이라 눈이 하나예요
            </button>
          )}
          {stage === 'mouth' && (
            <button
              type="button"
              onClick={() => {
                setNoMouth(true);
                if (eye1) applyDefaults(eye1, oneEye ? null : eye2, null);
              }}
              className="btn-storybook bg-white px-4 py-1.5 text-base"
            >
              입이 없어요
            </button>
          )}
          {eye1 && (
            <button type="button" onClick={reset} className="btn-storybook bg-white px-4 py-1.5 text-base">
              <RefreshCw className="h-4 w-4" /> 처음부터 다시
            </button>
          )}
        </div>
      </div>

      <div className="card-storybook space-y-3 p-4">
        <p className="text-center font-cute text-xl">움직임 미리보기</p>
        <div className="relative mx-auto aspect-video w-full overflow-hidden rounded-2xl bg-cream">
          {face ? (
            <PuppetFace ref={previewRef} posterUrl={imageUrl} face={face} mode={talking} videos={emotionVideos} insets={{ top: 8, bottom: 8 }} />
          ) : (
            <p className="flex h-full items-center justify-center px-4 text-center text-sm text-cocoa/60">눈과 입을 누르면 친구가 움직여요</p>
          )}
        </div>
        {face && (
          <>
            <button
              type="button"
              onClick={() => setTalking((v) => (v === 'idle' ? 'talking' : 'idle'))}
              className={`btn-storybook w-full px-4 py-2 text-lg ${talking === 'talking' ? 'bg-blush' : 'bg-sky'}`}
            >
              {talking === 'talking' ? '말하기 멈추기' : '말하는 모습 보기'}
            </button>
            <div>
              <p className="mb-1 text-center text-sm font-semibold">표정 눌러 보기</p>
              <div className="grid grid-cols-3 gap-1.5">
                {EMOTION_BUTTONS.map((b) => (
                  <button
                    key={b.slot}
                    type="button"
                    onClick={() => previewRef.current?.playEmotion(b.slot)}
                    className={`flex flex-col items-center rounded-2xl border-[3px] border-cocoa/30 px-1 py-1.5 font-cute text-sm transition active:scale-95 ${b.tint}`}
                    title={emotionVideos?.[b.slot] ? '넣어 둔 영상으로 보여줘요' : '그림 움직임으로 보여줘요'}
                  >
                    <span className="text-xl" aria-hidden>
                      {b.emoji}
                    </span>
                    {b.title}
                  </button>
                ))}
              </div>
            </div>
            <label className="block text-sm font-semibold">
              눈 크기
              <input
                type="range"
                min={0.015}
                max={0.2}
                step={0.002}
                value={eyeSize}
                onChange={(e) => setEyeSize(Number(e.target.value))}
                className="mt-1 w-full accent-blush"
              />
            </label>
            {!noMouth && <label className="block text-sm font-semibold">
              입 크기
              <input
                type="range"
                min={0.02}
                max={0.3}
                step={0.002}
                value={mouthSize}
                onChange={(e) => setMouthSize(Number(e.target.value))}
                className="mt-1 w-full accent-blush"
              />
            </label>}
          </>
        )}
      </div>
    </div>
  );
}
