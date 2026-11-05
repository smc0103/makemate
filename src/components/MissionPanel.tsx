import { useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, Dices, Images, Plus, Scissors, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import Modal from './Modal';
import type { MissionFind } from '../types';
import type { Mission } from '../lib/missions';
import { useObjectUrl } from '../hooks/useObjectUrl';
import { useConfirm } from './ConfirmDialog';

/** 찾은 자연물 사진 */
export function FindPhoto({ photo, alt, className }: { photo: Blob; alt: string; className?: string }) {
  const url = useObjectUrl(photo);
  return url ? <img src={url} alt={alt} className={className} /> : null;
}

interface MissionPanelProps {
  open: boolean;
  onClose: () => void;
  missions: Mission[];
  finds: MissionFind[];
  aiCheck: boolean;
  onToggleAiCheck: (on: boolean) => void;
  /** null이면 친구가 골라 준다 */
  onStart: (mission: Mission | null) => void;
  onAddCustom: (title: string, hint: string) => void;
  onRemoveCustom: (id: string) => void;
  onReset: () => void;
  onDeleteFind: (id: string) => void;
  /** 찾은 사진으로 자연물 스티커를 오리러 간다 */
  onDecorateWith: (photo: Blob) => void;
}

export default function MissionPanel({
  open,
  onClose,
  missions,
  finds,
  aiCheck,
  onToggleAiCheck,
  onStart,
  onAddCustom,
  onRemoveCustom,
  onReset,
  onDeleteFind,
  onDecorateWith,
}: MissionPanelProps) {
  const { confirm, dialog } = useConfirm();
  const [title, setTitle] = useState('');
  const [hint, setHint] = useState('');
  /** 사진첩으로 보고 있는 미션 ('all'이면 모두) */
  const [album, setAlbum] = useState<string | null>(null);
  const [zoom, setZoom] = useState<MissionFind | null>(null);

  // 미션마다 찾은 사진들 (최근 것이 앞)
  const findsByMission = useMemo(() => {
    const map = new Map<string, MissionFind[]>();
    finds.forEach((f) => map.set(f.missionId, [f, ...(map.get(f.missionId) ?? [])]));
    return map;
  }, [finds]);

  const doneCount = missions.filter((m) => findsByMission.has(m.id)).length;

  const close = () => {
    setAlbum(null);
    setZoom(null);
    onClose();
  };

  if (album) {
    const mission = missions.find((m) => m.id === album);
    const photos = album === 'all' ? [...finds].reverse() : findsByMission.get(album) ?? [];
    return (
      <Modal open={open} onClose={close} wide title={mission ? `${mission.emoji} ${mission.title}` : '내가 찾은 자연물 모두 보기'} icon={<Images className="h-6 w-6" />}>
        {dialog}
        <div className="space-y-4">
          <button type="button" onClick={() => setAlbum(null)} className="btn-storybook bg-white px-4 py-1.5 text-base">
            <ArrowLeft className="h-4 w-4" /> 미션 목록
          </button>
          {photos.length === 0 ? (
            <p className="py-8 text-center text-cocoa/60">아직 찍은 사진이 없어요.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photos.map((f) => (
                <figure key={f.id} className="overflow-hidden rounded-3xl bg-white shadow-soft">
                  <button type="button" onClick={() => setZoom(f)} className="block w-full" aria-label="크게 보기">
                    <FindPhoto photo={f.photo} alt={f.missionTitle} className="aspect-square w-full object-cover" />
                  </button>
                  <figcaption className="space-y-1.5 px-2.5 py-2">
                    <p className="truncate font-cute text-sm">
                      {album === 'all' && `${f.emoji} `}
                      {f.what || f.missionTitle}
                    </p>
                    <p className="text-[11px] text-cocoa/50">
                      {new Date(f.timestamp).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      {f.confirmedBy === 'adult' ? ' · 어른 확인' : ''}
                    </p>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => onDecorateWith(f.photo)}
                        className="flex flex-1 items-center justify-center gap-1 rounded-full bg-mint px-2 py-1 font-cute text-xs active:scale-95"
                      >
                        <Scissors className="h-3.5 w-3.5" /> 오려서 꾸미기
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void confirm('이 사진을 지울까요?').then((ok) => {
                            if (ok) onDeleteFind(f.id);
                          });
                        }}
                        className="rounded-full bg-cream p-1.5 text-cocoa/50 active:scale-95"
                        aria-label="사진 지우기"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>
        {zoom && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-cocoa/80 p-4"
            onPointerDown={(e) => {
              e.stopPropagation();
              setZoom(null);
            }}
          >
            <FindPhoto photo={zoom.photo} alt={zoom.missionTitle} className="max-h-full max-w-full rounded-3xl border-4 border-white shadow-soft" />
          </div>
        )}
      </Modal>
    );
  }

  const submitCustom = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAddCustom(title, hint);
    setTitle('');
    setHint('');
  };

  return (
    <Modal open={open} onClose={close} wide title="자연물 찾기 미션" icon={<Search className="h-6 w-6" />}>
      {dialog}
      <div className="space-y-6">
        <section className="flex flex-col items-center gap-3 text-center">
          <p className="font-cute text-xl">
            찾은 자연물 <b className="text-2xl text-blush">{doneCount}</b> / {missions.length}
          </p>
          <button type="button" onClick={() => onStart(null)} className="btn-storybook w-full max-w-md bg-butter px-6 py-4 text-2xl">
            <Dices className="h-7 w-7" /> 친구에게 미션 받기
          </button>
          <p className="text-sm text-cocoa/60">아래에서 하고 싶은 미션을 직접 눌러도 돼요.</p>
          {finds.length > 0 && (
            <button type="button" onClick={() => setAlbum('all')} className="btn-storybook bg-white px-4 py-2 text-base">
              <Images className="h-5 w-5" /> 내가 찾은 자연물 사진 {finds.length}장 보기
            </button>
          )}
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          {missions.map((m) => {
            const list = findsByMission.get(m.id);
            const find = list?.[0];
            return (
              <div key={m.id} className="relative">
                <button
                  type="button"
                  onClick={() => onStart(m)}
                  className={`flex min-h-[5.5rem] w-full items-center gap-3 rounded-3xl border-4 p-3 text-left transition active:scale-95 ${
                    find ? 'border-mint bg-mint/30' : 'border-white bg-white/70 hover:bg-white'
                  }`}
                >
                  {find ? (
                    <FindPhoto photo={find.photo} alt={m.title} className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
                  ) : (
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-cream text-4xl" aria-hidden>
                      {m.emoji}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 pr-5">
                    <span className="block font-cute text-lg leading-snug">
                      {find && '🏅 '}
                      {m.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-cocoa/60">{m.hint}</span>
                    {m.exhibit && <span className="block text-[11px] text-cocoa/50">🏛️ {m.exhibit}</span>}
                  </span>
                </button>
                {list && (
                  <button
                    type="button"
                    onClick={() => setAlbum(m.id)}
                    className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-white px-2.5 py-1 font-cute text-xs shadow-soft active:scale-95"
                    aria-label={`${m.title} 사진 ${list.length}장 보기`}
                  >
                    <Images className="h-3.5 w-3.5" /> {list.length}장
                  </button>
                )}
                {m.custom && (
                  <button
                    type="button"
                    onClick={() => onRemoveCustom(m.id)}
                    className="absolute right-2 top-2 rounded-full bg-white p-1.5 text-cocoa/50 shadow-soft"
                    aria-label={`${m.title} 미션 지우기`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
        </section>

        <details className="rounded-3xl bg-white/70 p-4">
          <summary className="cursor-pointer font-cute text-lg">🧑‍🏫 보호자·선생님 설정</summary>
          <div className="mt-4 space-y-5">
            <form onSubmit={submitCustom} className="space-y-2">
              <p className="font-semibold">그날 장소에 맞는 미션 추가</p>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={30}
                placeholder="찾을 것 예) 동그란 자갈"
                className="input-storybook py-2 text-base"
                aria-label="찾을 것"
              />
              <input
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                maxLength={40}
                placeholder="힌트(선택) 예) 물가 근처 말고 산책길에서"
                className="input-storybook py-2 text-base"
                aria-label="힌트"
              />
              <button type="submit" disabled={!title.trim()} className="btn-storybook bg-mint px-4 py-1.5 text-base">
                <Plus className="h-4 w-4" /> 미션 추가
              </button>
            </form>

            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={aiCheck}
                onChange={(e) => onToggleAiCheck(e.target.checked)}
                className="mt-1 h-5 w-5 accent-blush"
              />
              <span className="text-sm leading-relaxed">
                <span className="flex items-center gap-1 font-semibold">
                  <ShieldCheck className="h-4 w-4" /> 사진을 AI로 확인하기
                </span>
                켜면 찍은 사진이 축소되어 Groq 또는 Google로 전송돼요. 아이 얼굴이나 이름표가 나오지 않게 찍어 주세요. 끄면 사진을
                보내지 않고 어른이 직접 확인해요.
              </span>
            </label>

            <button
              type="button"
              disabled={finds.length === 0}
              onClick={() => {
                void confirm('찾은 자연물 사진과 도장을 모두 지울까요? 다음 아이가 처음부터 시작할 때 사용해요.').then((ok) => {
                  if (ok) onReset();
                });
              }}
              className="btn-storybook bg-white px-4 py-1.5 text-base"
            >
              <Trash2 className="h-4 w-4" /> 도장 모두 지우기
            </button>
          </div>
        </details>
      </div>
    </Modal>
  );
}
