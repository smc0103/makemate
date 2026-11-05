import { useCallback, useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowUpToLine, Camera, FlipHorizontal2, ImagePlus, Medal, Minus, Plus, RotateCcw, RotateCw, Trash2, X } from 'lucide-react';
import type { Character, Decoration, MissionFind, Sticker } from '../types';
import { createId, deleteSticker, getMissionFinds, getStickers, saveCharacter, saveSticker } from '../lib/db';
import { blobUrl } from '../lib/decorate';
import { prepareMagicScissors } from '../lib/cutout';
import { useObjectUrl } from '../hooks/useObjectUrl';
import { playPop, unlockAudio } from '../lib/sound';
import CutoutStudio from './CutoutStudio';
import Modal from './Modal';
import { FindPhoto } from './MissionPanel';
import { useConfirm } from './ConfirmDialog';
import { LeafDoodle, StarDoodle } from './Doodles';

interface DecorateScreenProps {
  character: Character;
  /** 미션 보관함에서 바로 오리러 왔을 때의 사진 */
  initialPhoto?: Blob;
  onDone: (character: Character) => void;
}

type Gesture =
  | { kind: 'drag'; id: string; pointer: number; sx: number; sy: number; x0: number; y0: number }
  | { kind: 'pinch'; id: string; dist0: number; angle0: number; w0: number; rot0: number }
  | { kind: 'handle'; id: string; pointer: number; cx: number; cy: number; dist0: number; angle0: number; w0: number; rot0: number };

const MIN_W = 0.05;
const MAX_W = 1.2;

/** 자연물 스티커로 친구 꾸미기 */
export default function DecorateScreen({ character, initialPhoto, onDone }: DecorateScreenProps) {
  const posterUrl = useObjectUrl(character.posterImage);
  const { confirm, dialog } = useConfirm();
  const [decorations, setDecorations] = useState<Decoration[]>(character.decorations ?? []);
  const [selected, setSelected] = useState<string | null>(null);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [finds, setFinds] = useState<MissionFind[]>([]);
  const [cutting, setCutting] = useState<Blob | null>(initialPhoto ?? null);
  const [findsOpen, setFindsOpen] = useState(false);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const latest = useRef(decorations);
  latest.current = decorations;
  const dirty = useRef(false);

  useEffect(() => {
    getStickers().then(setStickers).catch((err: unknown) => console.error(err));
    getMissionFinds(character.id).then(setFinds).catch((err: unknown) => console.error(err));
    // 사진을 고르는 동안 마법 가위를 미리 내려받아 둔다
    prepareMagicScissors().catch(() => undefined);
  }, [character.id]);

  // 그림을 원래 비율 그대로 무대 안에 맞춘다
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !natural) return;
    const fit = () => {
      const rect = stage.getBoundingClientRect();
      const k = Math.min((rect.width - 16) / natural.w, (rect.height - 16) / natural.h);
      setBox({ w: Math.max(1, natural.w * k), h: Math.max(1, natural.h * k) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [natural]);

  // 바꿀 때마다 조금 뒤에 저장한다 (태블릿이 갑자기 꺼져도 남도록)
  const persist = useCallback(async () => {
    dirty.current = false;
    const updated: Character = { ...character, decorations: latest.current };
    await saveCharacter(updated);
    return updated;
  }, [character]);

  useEffect(() => {
    if (!dirty.current) return;
    const timer = window.setTimeout(() => void persist().catch((err: unknown) => console.error(err)), 600);
    return () => window.clearTimeout(timer);
  }, [decorations, persist]);

  const change = (next: Decoration[] | ((prev: Decoration[]) => Decoration[])) => {
    dirty.current = true;
    setDecorations(next);
  };

  const update = (id: string, patch: Partial<Decoration>) => change((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  const finish = async () => {
    playPop();
    try {
      onDone(await persist());
    } catch (err) {
      console.error(err);
      onDone({ ...character, decorations: latest.current });
    }
  };

  /** 보관함의 스티커를 친구 그림 위에 붙인다 */
  const place = (sticker: Pick<Sticker, 'image' | 'width' | 'height'>) => {
    unlockAudio();
    playPop();
    const aspect = sticker.height / sticker.width;
    const nw = natural?.w ?? 1;
    const nh = natural?.h ?? 1;
    // 긴 변이 그림 짧은 변의 3분의 1쯤 되게
    const long = Math.min(nw, nh) * 0.34;
    const wPx = aspect >= 1 ? long / aspect : long;
    const spot = freeSpot(character, latest.current, nw, nh);
    const d: Decoration = {
      id: createId(),
      image: sticker.image,
      aspect,
      x: spot.x,
      y: spot.y,
      w: Math.min(MAX_W, Math.max(MIN_W, wPx / nw)),
      rot: (Math.random() - 0.5) * 0.3,
    };
    change((prev) => [...prev, d]);
    setSelected(d.id);
  };

  const handleCut = async (made: { blob: Blob; width: number; height: number }) => {
    setCutting(null);
    const sticker: Sticker = { id: createId(), image: made.blob, width: made.width, height: made.height, createdAt: Date.now() };
    setStickers((prev) => [sticker, ...prev]);
    saveSticker(sticker).catch((err: unknown) => console.error(err));
    place(sticker);
  };

  const pickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) setCutting(file);
  };

  /* ---------------- 손가락으로 옮기기·키우기·돌리기 ---------------- */

  const paperRect = () => paperRef.current?.getBoundingClientRect() ?? null;

  const startPinchIfTwo = () => {
    const id = gesture.current?.id ?? selected;
    if (!id || pointers.current.size < 2) return;
    const d = latest.current.find((x) => x.id === id);
    if (!d) return;
    const [p, q] = [...pointers.current.values()];
    gesture.current = {
      kind: 'pinch',
      id,
      dist0: Math.max(1, Math.hypot(q.x - p.x, q.y - p.y)),
      angle0: Math.atan2(q.y - p.y, q.x - p.x),
      w0: d.w,
      rot0: d.rot,
    };
  };

  const onStickerDown = (e: ReactPointerEvent, d: Decoration) => {
    e.stopPropagation();
    stageRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setSelected(d.id);
    if (pointers.current.size >= 2) {
      startPinchIfTwo();
      return;
    }
    gesture.current = { kind: 'drag', id: d.id, pointer: e.pointerId, sx: e.clientX, sy: e.clientY, x0: d.x, y0: d.y };
  };

  const onHandleDown = (e: ReactPointerEvent, d: Decoration) => {
    e.stopPropagation();
    const rect = paperRect();
    if (!rect) return;
    stageRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const cx = rect.left + d.x * rect.width;
    const cy = rect.top + d.y * rect.height;
    gesture.current = {
      kind: 'handle',
      id: d.id,
      pointer: e.pointerId,
      cx,
      cy,
      dist0: Math.max(1, Math.hypot(e.clientX - cx, e.clientY - cy)),
      angle0: Math.atan2(e.clientY - cy, e.clientX - cx),
      w0: d.w,
      rot0: d.rot,
    };
  };

  const onStageDown = (e: ReactPointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointers.current.size >= 2) {
      startPinchIfTwo();
    } else {
      setSelected(null);
    }
  };

  const onStageMove = (e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const rect = paperRect();
    if (!g || !rect) return;
    if (g.kind === 'drag' && g.pointer === e.pointerId) {
      update(g.id, {
        x: Math.min(1.05, Math.max(-0.05, g.x0 + (e.clientX - g.sx) / rect.width)),
        y: Math.min(1.05, Math.max(-0.05, g.y0 + (e.clientY - g.sy) / rect.height)),
      });
    } else if (g.kind === 'handle' && g.pointer === e.pointerId) {
      const dist = Math.hypot(e.clientX - g.cx, e.clientY - g.cy);
      const angle = Math.atan2(e.clientY - g.cy, e.clientX - g.cx);
      update(g.id, { w: clampW((g.w0 * dist) / g.dist0), rot: g.rot0 + angle - g.angle0 });
    } else if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const [p, q] = [...pointers.current.values()];
      const dist = Math.hypot(q.x - p.x, q.y - p.y);
      const angle = Math.atan2(q.y - p.y, q.x - p.x);
      update(g.id, { w: clampW((g.w0 * dist) / g.dist0), rot: g.rot0 + angle - g.angle0 });
    }
  };

  const onStageUp = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
    else if (gesture.current?.kind === 'pinch') {
      // 손가락 하나가 남으면 그 손가락으로 계속 옮긴다
      const [id, p] = [...pointers.current.entries()][0];
      const d = latest.current.find((x) => x.id === gesture.current?.id);
      gesture.current = d ? { kind: 'drag', id: d.id, pointer: id, sx: p.x, sy: p.y, x0: d.x, y0: d.y } : null;
    }
  };

  const current = decorations.find((d) => d.id === selected) ?? null;

  const toolbar = current && (
    <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2" data-no-touch>
      <ToolButton label="크게" onClick={() => update(current.id, { w: clampW(current.w * 1.15) })}>
        <Plus className="h-5 w-5" />
      </ToolButton>
      <ToolButton label="작게" onClick={() => update(current.id, { w: clampW(current.w / 1.15) })}>
        <Minus className="h-5 w-5" />
      </ToolButton>
      <ToolButton label="왼쪽" onClick={() => update(current.id, { rot: current.rot - Math.PI / 12 })}>
        <RotateCcw className="h-5 w-5" />
      </ToolButton>
      <ToolButton label="오른쪽" onClick={() => update(current.id, { rot: current.rot + Math.PI / 12 })}>
        <RotateCw className="h-5 w-5" />
      </ToolButton>
      <ToolButton label="뒤집기" onClick={() => update(current.id, { flip: !current.flip })}>
        <FlipHorizontal2 className="h-5 w-5" />
      </ToolButton>
      <ToolButton
        label="맨 위로"
        onClick={() => change((prev) => [...prev.filter((d) => d.id !== current.id), current])}
      >
        <ArrowUpToLine className="h-5 w-5" />
      </ToolButton>
      <ToolButton
        label="떼기"
        danger
        onClick={() => {
          playPop();
          change((prev) => prev.filter((d) => d.id !== current.id));
          setSelected(null);
        }}
      >
        <Trash2 className="h-5 w-5" />
      </ToolButton>
    </div>
  );

  return (
    <main className="sketchbook-bg relative flex h-[100dvh] w-full flex-col overflow-hidden">
      {dialog}
      <LeafDoodle className="pointer-events-none absolute bottom-3 left-3 w-12 opacity-70" />
      <StarDoodle className="pointer-events-none absolute right-6 top-20 hidden w-10 opacity-70 sm:block" />

      <header className="relative z-10 flex items-center gap-3 px-4 pb-1 pt-4 sm:px-6">
        <button type="button" onClick={() => void finish()} className="btn-storybook bg-mint px-4 py-2 text-lg sm:text-xl">
          <ArrowLeft className="h-5 w-5" /> 다 꾸몄어요
        </button>
        <h1 className="min-w-0 flex-1 truncate text-center font-crayon text-3xl font-bold sm:text-4xl">
          ✨ {character.name} 꾸미기
        </h1>
        <button
          type="button"
          disabled={decorations.length === 0}
          onClick={() => {
            void confirm(`${character.name}에게 붙인 자연물을 모두 뗄까요? 보관함에는 그대로 남아요.`).then((ok) => {
              if (!ok) return;
              change([]);
              setSelected(null);
            });
          }}
          className="glass-btn !px-3 text-sm disabled:opacity-40"
        >
          <X className="h-4 w-4" /> 모두 떼기
        </button>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4 landscape:flex-row">
        {/* 무대: 친구 그림 + 붙인 자연물 */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          <div
            ref={stageRef}
            className="relative flex min-h-0 flex-1 touch-none items-center justify-center"
            onPointerDown={onStageDown}
            onPointerMove={onStageMove}
            onPointerUp={onStageUp}
            onPointerCancel={onStageUp}
          >
            {posterUrl && (
              <img
                src={posterUrl}
                alt=""
                className="hidden"
                onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              />
            )}
            {natural && posterUrl && (
              <div
                ref={paperRef}
                className="relative bg-white shadow-soft"
                style={{ width: box.w, height: box.h }}
              >
                <span className="absolute -top-3 left-1/2 z-10 h-6 w-24 -translate-x-1/2 rotate-2 bg-butter/80 shadow-sm" aria-hidden />
                <img src={posterUrl} alt={character.name} className="h-full w-full select-none object-contain" draggable={false} />
                {decorations.map((d) => (
                  <div
                    key={d.id}
                    className="absolute"
                    style={{
                      left: `${d.x * 100}%`,
                      top: `${d.y * 100}%`,
                      width: `${d.w * 100}%`,
                      transform: `translate(-50%, -50%) rotate(${d.rot}rad)`,
                      zIndex: d.id === selected ? 5 : 1,
                    }}
                  >
                    <img
                      src={blobUrl(d.image)}
                      alt="자연물 스티커"
                      draggable={false}
                      onPointerDown={(e) => onStickerDown(e, d)}
                      className={`block w-full animate-pop-in cursor-grab select-none ${d.id === selected ? 'outline-dashed outline-[3px] outline-offset-2 outline-blush' : ''}`}
                      style={{ transform: d.flip ? 'scaleX(-1)' : undefined }}
                    />
                    {d.id === selected && (
                      <button
                        type="button"
                        onPointerDown={(e) => onHandleDown(e, d)}
                        className="absolute -bottom-4 -right-4 flex h-9 w-9 touch-none items-center justify-center rounded-full border-2 border-white bg-blush text-white shadow-soft"
                        aria-label="돌리고 크기 바꾸기"
                      >
                        <RotateCw className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex min-h-[3.25rem] items-center justify-center">
            {toolbar ?? (
              <p className="rounded-full bg-white/80 px-4 py-2 text-center font-cute text-base text-cocoa/70 shadow-soft sm:text-lg">
                {decorations.length ? '붙인 자연물을 눌러서 옮기고, 두 손가락으로 키우고 돌려요' : '보관함의 자연물을 눌러 친구에게 붙여요'}
              </p>
            )}
          </div>
        </section>

        {/* 자연물 보관함 */}
        <aside className="card-storybook flex max-h-[38%] min-h-0 shrink-0 flex-col gap-3 bg-cream/95 p-3 landscape:max-h-none landscape:w-72 lg:landscape:w-80">
          <h2 className="flex items-center gap-2 font-cute text-xl">
            🧺 자연물 보관함 <span className="text-sm text-cocoa/50">{stickers.length}개</span>
          </h2>
          <div className="grid grid-cols-3 gap-2">
            <SourceButton color="bg-mint" label="찍기" onClick={() => cameraRef.current?.click()}>
              <Camera className="h-6 w-6" />
            </SourceButton>
            <SourceButton color="bg-sky" label="사진" onClick={() => uploadRef.current?.click()}>
              <ImagePlus className="h-6 w-6" />
            </SourceButton>
            <SourceButton color="bg-butter" label={`미션 ${finds.length}`} disabled={finds.length === 0} onClick={() => setFindsOpen(true)}>
              <Medal className="h-6 w-6" />
            </SourceButton>
          </div>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pickFile} />
          <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={pickFile} />

          <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl bg-white/60 p-2">
            {stickers.length === 0 ? (
              <p className="px-2 py-4 text-center text-sm leading-relaxed text-cocoa/60">
                아직 오려 둔 자연물이 없어요.
                <br />
                나뭇잎, 꽃, 돌멩이를 찍어 볼까요? 📷
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 portrait:grid-cols-5">
                {stickers.map((s) => (
                  <div key={s.id} className="relative">
                    <button
                      type="button"
                      onClick={() => place(s)}
                      className="flex aspect-square w-full items-center justify-center rounded-2xl bg-[radial-gradient(circle,#fff_0%,#FFF4E0_100%)] p-1.5 shadow-soft transition active:scale-90"
                      aria-label="친구에게 붙이기"
                    >
                      <img src={blobUrl(s.image)} alt="" className="max-h-full max-w-full object-contain" draggable={false} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void confirm('이 자연물을 보관함에서 지울까요? 친구에게 붙인 것은 그대로 남아요.').then((ok) => {
                          if (!ok) return;
                          setStickers((prev) => prev.filter((x) => x.id !== s.id));
                          deleteSticker(s.id).catch((err: unknown) => console.error(err));
                        });
                      }}
                      className="absolute -right-1 -top-1 rounded-full bg-white p-1 text-cocoa/50 shadow-soft"
                      aria-label="보관함에서 지우기"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      <Modal open={findsOpen} onClose={() => setFindsOpen(false)} wide title="미션에서 찾은 자연물" icon={<Medal className="h-6 w-6" />}>
        <p className="mb-3 text-cocoa/70">오리고 싶은 사진을 눌러요.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[...finds].reverse().map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setFindsOpen(false);
                setCutting(f.photo);
              }}
              className="overflow-hidden rounded-2xl bg-white text-left shadow-soft transition active:scale-95"
            >
              <FindPhoto photo={f.photo} alt={f.missionTitle} className="aspect-square w-full object-cover" />
              <span className="block truncate px-2 py-1.5 font-cute text-sm">
                {f.emoji} {f.missionTitle}
              </span>
            </button>
          ))}
        </div>
      </Modal>

      {cutting && (
        <CutoutStudio
          photo={cutting}
          onClose={() => setCutting(null)}
          onDone={(made) => void handleCut(made)}
        />
      )}
    </main>
  );
}

/** 눈·입과 이미 붙인 스티커에서 먼 자리를 고른다 (얼굴을 가리지 않게) */
function freeSpot(character: Character, placed: Decoration[], nw: number, nh: number) {
  const face = character.face;
  const avoid = [
    ...(face ? [face.leftEye, face.rightEye, face.mouth].filter((p): p is { x: number; y: number } => p !== null) : [{ x: 0.5, y: 0.5 }]),
    ...placed.map((d) => ({ x: d.x, y: d.y })),
  ];
  const unit = Math.min(nw, nh);
  const spots: Array<{ x: number; y: number; score: number }> = [];
  for (const x of [0.2, 0.35, 0.5, 0.65, 0.8]) {
    for (const y of [0.18, 0.34, 0.5, 0.66, 0.82]) {
      const score = Math.min(...avoid.map((p) => Math.hypot(((x - p.x) * nw) / unit, ((y - p.y) * nh) / unit)));
      spots.push({ x, y, score });
    }
  }
  spots.sort((a, b) => b.score - a.score);
  const pick = spots[Math.floor(Math.random() * Math.min(3, spots.length))];
  return { x: pick.x + (Math.random() - 0.5) * 0.04, y: pick.y + (Math.random() - 0.5) * 0.04 };
}

function clampW(w: number) {
  return Math.min(MAX_W, Math.max(MIN_W, w));
}

function ToolButton({ label, danger, onClick, children }: { label: string; danger?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => {
        playPop();
        onClick();
      }}
      className={`flex min-w-[3.25rem] flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 font-cute text-xs shadow-soft transition active:scale-90 sm:text-sm ${
        danger ? 'bg-blush/90 text-white' : 'bg-white/90 text-cocoa'
      }`}
    >
      {children}
      {label}
    </button>
  );
}

function SourceButton({
  color,
  label,
  disabled,
  onClick,
  children,
}: {
  color: string;
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        unlockAudio();
        playPop();
        onClick();
      }}
      className={`btn-storybook flex-col !gap-0.5 px-1 py-2 text-sm disabled:opacity-40 ${color}`}
    >
      {children}
      {label}
    </button>
  );
}
