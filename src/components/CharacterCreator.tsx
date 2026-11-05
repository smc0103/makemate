import { useEffect, useRef, useState, type DragEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, Film, ImagePlus, Loader2, RefreshCw, Save, Sparkles, Upload, X } from 'lucide-react';
import type { Character, CharacterVideos, EmotionVideoSlot, FaceMap, FriendVoice, VideoSlot } from '../types';
import FaceMarker from './FaceMarker';
import VoicePicker from './VoicePicker';
import { EMOTION_SLOTS, VIDEO_SLOTS, type SlotMeta } from '../lib/emotions';
import { createId, saveCharacter } from '../lib/db';
import { useObjectUrl } from '../hooks/useObjectUrl';
import { playPop, playSparkle, unlockAudio } from '../lib/sound';

interface CharacterCreatorProps {
  /** 있으면 새로 만들지 않고 이 친구를 고친다 */
  editing?: Character;
  onCancel: () => void;
  onCreated: (character: Character) => void;
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const VIDEO_TYPES = ['video/mp4', 'video/webm'];
const VIDEO_EXT = /\.(mp4|webm)$/i;
const MAX_NAME = 12;

type VideoState = Record<VideoSlot, Blob | null>;

const SLOT_NAMES: VideoSlot[] = ['idle', 'talking', ...EMOTION_SLOTS];

function initialVideos(editing?: Character): VideoState {
  return Object.fromEntries(SLOT_NAMES.map((slot) => [slot, editing?.videos[slot] ?? null])) as VideoState;
}

/** 미리보기에 쓸 감정 영상 주소 */
function useEmotionUrls(videos: VideoState) {
  const [urls, setUrls] = useState<Partial<Record<EmotionVideoSlot, string>>>({});
  useEffect(() => {
    const created: Partial<Record<EmotionVideoSlot, string>> = {};
    for (const slot of EMOTION_SLOTS) {
      const blob = videos[slot];
      if (blob) created[slot] = URL.createObjectURL(blob);
    }
    setUrls(created);
    return () => {
      Object.values(created).forEach((u) => u && URL.revokeObjectURL(u));
    };
  }, [videos]);
  return urls;
}

type Step = 1 | 2 | 3 | 4;

const EDIT_TABS: Array<{ step: Step; label: string }> = [
  { step: 1, label: '그림·이름' },
  { step: 2, label: '눈·입 위치' },
  { step: 4, label: '목소리' },
  { step: 3, label: '표정 영상' },
];

export default function CharacterCreator({ editing, onCancel, onCreated }: CharacterCreatorProps) {
  const isEdit = Boolean(editing);
  const [step, setStep] = useState<Step>(1);
  const [voice, setVoice] = useState<FriendVoice | undefined>(editing?.voice);
  const [face, setFace] = useState<FaceMap | null>(editing?.face ?? null);
  const [poster, setPoster] = useState<Blob | string | null>(editing?.posterImage ?? null);
  const posterUrl = useObjectUrl(poster);
  const [name, setName] = useState(editing?.name ?? '');
  const [videos, setVideos] = useState<VideoState>(() => initialVideos(editing));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const emotionUrls = useEmotionUrls(videos);

  const step1Ready = Boolean(poster) && name.trim().length > 0;
  const hasBaseVideos = Boolean(videos.idle) && Boolean(videos.talking);
  // 기본·말하기 영상은 둘 다 있거나 둘 다 없어야 한다
  const baseMismatch = Boolean(videos.idle) !== Boolean(videos.talking);
  const canSave = step1Ready && !baseMismatch && (hasBaseVideos || Boolean(face));

  const handlePoster = (file: File | undefined) => {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      setError('PNG, JPG, WEBP, GIF 그림만 올릴 수 있어요.');
      return;
    }
    setError('');
    playPop();
    setPoster(file);
    // 그림이 바뀌면 눈과 입 위치를 다시 찍어야 한다
    setFace(null);
  };

  const handleVideo = (slot: VideoSlot, file: File | undefined) => {
    if (!file) return;
    if (!VIDEO_TYPES.includes(file.type) && !VIDEO_EXT.test(file.name)) {
      setError('MP4 또는 WebM 영상만 올릴 수 있어요.');
      return;
    }
    setError('');
    playPop();
    setVideos((prev) => ({ ...prev, [slot]: file }));
  };

  const removeVideo = (slot: VideoSlot) => {
    playPop();
    setVideos((prev) => ({ ...prev, [slot]: null }));
  };

  const goStep2 = () => {
    unlockAudio();
    if (!step1Ready) {
      setError(!poster ? '동물이나 공룡 얼굴 그림을 먼저 올려 주세요.' : '친구 이름을 지어 주세요.');
      return;
    }
    setError('');
    playPop();
    setStep(2);
  };

  const handleSubmit = async () => {
    unlockAudio();
    if (!poster || !name.trim()) {
      setError(!poster ? '그림을 올려 주세요.' : '친구 이름을 지어 주세요.');
      setStep(1);
      return;
    }
    if (baseMismatch) {
      setError('기본 표정과 말하는 표정 영상은 둘 다 넣거나 둘 다 빼 주세요.');
      setStep(3);
      return;
    }
    if (!hasBaseVideos && !face) {
      setError('눈과 입 위치를 눌러 주거나, 기본·말하기 영상을 넣어 주세요.');
      setStep(2);
      return;
    }
    setSaving(true);
    setError('');
    const characterVideos: CharacterVideos = Object.fromEntries(SLOT_NAMES.map((slot) => [slot, videos[slot]])) as unknown as CharacterVideos;
    const character: Character = {
      id: editing?.id ?? createId(),
      name: name.trim(),
      posterImage: poster,
      videos: characterVideos,
      ...(face ? { face } : {}),
      ...(editing?.decorations ? { decorations: editing.decorations } : {}),
      ...(voice ? { voice } : {}),
      createdAt: editing?.createdAt ?? Date.now(),
    };
    try {
      await saveCharacter(character);
      playSparkle();
      onCreated(character);
    } catch (err) {
      console.error(err);
      const quota = err instanceof DOMException && err.name === 'QuotaExceededError';
      setError(quota ? '저장 공간이 부족해요. 영상 크기를 줄여 주세요.' : '저장하지 못했어요. 다시 시도해 주세요.');
      setSaving(false);
    }
  };

  const heading = isEdit
    ? `✏️ ${editing?.name} 고치기`
    : step === 1
      ? '🦕 동물·공룡 친구의 얼굴과 이름'
      : step === 2
        ? `✨ ${name.trim()} 움직이게 하기`
        : step === 4
          ? `🎤 ${name.trim()}의 목소리`
          : `🎬 ${name.trim()}의 표정 영상`;

  const guide =
    step === 1
      ? isEdit
        ? '그림을 바꾸면 눈과 입 위치를 다시 눌러야 해요.'
        : '박물관에서 본 동물이나 공룡, 내가 상상한 동물이나 공룡의 얼굴을 그려서 올리고 멋진 이름을 지어 주세요.'
      : step === 2
        ? '그림에서 눈과 입을 콕콕 누르면 내 그림이 눈을 깜빡이고 말을 해요.'
        : step === 4
          ? '친구마다 다른 목소리를 골라 주세요. 누르면 바로 들려줘요.'
          : face
          ? '영상은 모두 선택이에요. 넣은 감정은 영상으로, 안 넣은 감정은 그림 움직임으로 보여줘요. 기본·말하기 영상을 둘 다 넣으면 그림 대신 영상으로 움직여요.'
          : '기본·말하기 영상은 꼭 필요하고, 감정 영상은 있으면 더 생생해져요.';

  const saveButton = (
    <button type="button" onClick={() => void handleSubmit()} disabled={!canSave || saving} className="btn-storybook bg-blush px-10 py-5 text-2xl sm:text-3xl">
      {saving ? <Loader2 className="h-7 w-7 animate-spin" /> : isEdit ? <Save className="h-7 w-7" /> : <Sparkles className="h-7 w-7" />}
      {saving ? '저장하는 중...' : isEdit ? '저장하기' : `${name.trim()} 만나러 가기`}
    </button>
  );

  return (
    <main className="sketchbook-bg min-h-[100dvh] w-full px-4 pb-16 pt-11 sm:px-8">
      <header className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            playPop();
            setError('');
            if (isEdit) onCancel();
            else if (step === 3) setStep(2);
            else if (step === 2) setStep(1);
            else onCancel();
          }}
          className="glass-btn"
          disabled={saving}
        >
          <ArrowLeft className="h-5 w-5" /> {isEdit ? '친구들로 돌아가기' : step > 1 ? '이전' : '처음으로'}
        </button>
        {isEdit ? (
          <div className="flex gap-1 rounded-full bg-white/80 p-1 shadow-soft" role="tablist" aria-label="고칠 내용">
            {EDIT_TABS.map((tab) => (
              <button
                key={tab.step}
                type="button"
                role="tab"
                aria-selected={step === tab.step}
                onClick={() => {
                  playPop();
                  setError('');
                  setStep(tab.step);
                }}
                className={`rounded-full px-3 py-1.5 font-cute text-sm transition sm:px-4 sm:text-base ${step === tab.step ? 'bg-blush text-cocoa' : 'text-cocoa/60'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : (
          <StepIndicator step={step === 4 ? 2 : step} />
        )}
      </header>

      <section className="mx-auto mt-8 max-w-4xl">
        <h1 className="text-center font-cute text-3xl sm:text-4xl">{heading}</h1>
        <p className="mt-2 text-center text-cocoa/70">{guide}</p>

        {error && (
          <p className="mx-auto mt-5 max-w-md animate-pop-in rounded-2xl bg-rose-100 px-4 py-3 text-center font-semibold text-rose-600">
            {error}
          </p>
        )}

        {step === 1 && (
          <div className="mt-8 grid items-start gap-6 md:grid-cols-[1fr_1fr]">
            <PosterDrop poster={poster} onFile={handlePoster} />
            <div className="card-storybook space-y-4 p-6">
              <label htmlFor="char-name" className="block font-cute text-2xl">
                친구 이름
              </label>
              <input
                id="char-name"
                value={name}
                maxLength={MAX_NAME}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isEdit) goStep2();
                }}
                placeholder="예) 크르릉이, 몽실이"
                className="input-storybook text-2xl"
              />
              <p className="text-right text-sm text-cocoa/50">
                {name.length}/{MAX_NAME}
              </p>
              {!isEdit && (
                <button type="button" onClick={goStep2} disabled={!step1Ready} className="btn-storybook w-full bg-mint px-6 py-4 text-2xl">
                  다음 단계 <ArrowRight className="h-6 w-6" />
                </button>
              )}
            </div>
          </div>
        )}

        {step === 2 && posterUrl && <FaceMarker imageUrl={posterUrl} value={face} onChange={setFace} emotionVideos={emotionUrls} />}

        {/* 새로 만들 때는 눈·입 아래에서 바로 목소리도 고른다 */}
        {(step === 4 || (!isEdit && step === 2)) && (
          <section className={`card-storybook mx-auto max-w-3xl bg-cream/90 p-5 sm:p-6 ${step === 2 ? 'mt-8' : 'mt-6'}`}>
            {step === 2 && <h2 className="mb-3 font-cute text-2xl">🎤 {name.trim()}의 목소리</h2>}
            <VoicePicker value={voice} onChange={setVoice} friendName={name} />
          </section>
        )}

        {step === 3 && (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {VIDEO_SLOTS.map((meta) => (
              <VideoSlotCard
                key={meta.slot}
                meta={meta}
                required={meta.required && !face}
                file={videos[meta.slot]}
                onFile={(f) => handleVideo(meta.slot, f)}
                onRemove={() => removeVideo(meta.slot)}
              />
            ))}
          </div>
        )}

        {(isEdit || step > 1) && (
          <div className="mt-8 flex flex-col items-center gap-3">
            {saveButton}
            {!isEdit && step === 2 && (
              <button
                type="button"
                onClick={() => {
                  playPop();
                  setError('');
                  setStep(3);
                }}
                className="inline-flex items-center gap-1 text-sm text-cocoa/70 underline underline-offset-2"
              >
                <Film className="h-4 w-4" /> 직접 만든 표정 영상도 넣고 싶어요
              </button>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 font-cute shadow-soft">
      {[1, 2].map((n) => (
        <span
          key={n}
          className={`flex h-8 w-8 items-center justify-center rounded-full text-lg transition ${
            step >= n ? 'bg-blush text-white' : 'bg-cream text-cocoa/40'
          }`}
        >
          {step > n ? <Check className="h-4 w-4" /> : n}
        </span>
      ))}
    </div>
  );
}

function useDropZone(onFile: (file: File | undefined) => void) {
  const [dragging, setDragging] = useState(false);
  return {
    dragging,
    bind: {
      onDragOver: (e: DragEvent) => {
        e.preventDefault();
        setDragging(true);
      },
      onDragLeave: () => setDragging(false),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        setDragging(false);
        onFile(e.dataTransfer.files?.[0]);
      },
    },
  };
}

function PosterDrop({ poster, onFile }: { poster: Blob | string | null; onFile: (file: File | undefined) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const url = useObjectUrl(poster);
  const { dragging, bind } = useDropZone(onFile);

  return (
    <div
      {...bind}
      className={`card-storybook relative aspect-square cursor-pointer overflow-hidden transition ${
        dragging ? 'scale-[1.02] ring-8 ring-blush/50' : ''
      }`}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
      }}
      aria-label="동물이나 공룡 얼굴 그림 올리기"
    >
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_TYPES.join(',')}
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {url ? (
        <>
          <img src={url} alt="친구 얼굴 미리보기" className="h-full w-full object-cover" />
          <span className="glass-btn absolute bottom-4 right-4 text-sm">
            <RefreshCw className="h-4 w-4" /> 바꾸기
          </span>
        </>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-4 border-4 border-dashed border-peach bg-white/60 p-6 text-center">
          <ImagePlus className="h-16 w-16 text-blush" />
          <p className="font-cute text-2xl">동물·공룡 얼굴 그림 올리기</p>
          <p className="text-sm text-cocoa/60">눌러서 고르거나 여기로 끌어다 놓아요</p>
        </div>
      )}
    </div>
  );
}

interface VideoSlotCardProps {
  meta: SlotMeta;
  /** 그림이 직접 움직이는 친구는 모든 영상이 선택이다 */
  required: boolean;
  file: Blob | null;
  onFile: (file: File | undefined) => void;
  onRemove: () => void;
}

function VideoSlotCard({ meta, required, file, onFile, onRemove }: VideoSlotCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const url = useObjectUrl(file);
  const { dragging, bind } = useDropZone(onFile);

  return (
    <div
      {...bind}
      className={`card-storybook relative flex flex-col overflow-hidden transition ${meta.tint} ${
        dragging ? 'scale-[1.02] ring-8 ring-blush/50' : ''
      }`}
    >
      <div className="flex items-center gap-2 px-4 pt-3">
        <span className="text-2xl" aria-hidden>
          {meta.emoji}
        </span>
        <span className="flex-1 font-cute text-xl">{meta.title}</span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
            required ? 'bg-rose-400 text-white' : 'bg-white/80 text-cocoa/60'
          }`}
        >
          {required ? '필수' : '선택'}
        </span>
      </div>
      <p className="px-4 pb-2 text-sm text-cocoa/70">{meta.description}</p>

      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/webm,.mp4,.webm"
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      <div className="relative mx-3 mb-3 aspect-video overflow-hidden rounded-2xl bg-white/70">
        {url ? (
          <>
            <video src={url} className="h-full w-full object-cover" autoPlay muted loop playsInline />
            <div className="absolute inset-x-2 bottom-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="rounded-full bg-white/90 p-2 shadow-soft hover:bg-white"
                aria-label={`${meta.title} 영상 바꾸기`}
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              {!required && (
                <button
                  type="button"
                  onClick={onRemove}
                  className="rounded-full bg-white/90 p-2 shadow-soft hover:text-rose-500"
                  aria-label={`${meta.title} 영상 빼기`}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-bold text-white">
              <Check className="h-3 w-3" /> 준비 완료
            </span>
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={`flex h-full w-full flex-col items-center justify-center gap-1 border-4 border-dashed text-cocoa/60 transition hover:bg-white ${
              required ? 'border-rose-300' : 'border-white'
            }`}
          >
            <Upload className="h-7 w-7" />
            <span className="font-cute text-base">MP4 / WebM 올리기</span>
          </button>
        )}
      </div>
    </div>
  );
}
