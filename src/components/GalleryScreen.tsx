import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, FolderInput, Leaf, Loader2, Pencil, Plus, Share2, Trash2 } from 'lucide-react';
import { useDecoratedPoster } from '../lib/decorate';
import type { Character } from '../types';
import { deleteCharacter, getAllCharacters } from '../lib/db';
import { playPop, playSparkle, unlockAudio } from '../lib/sound';
import { VIDEO_SLOTS } from '../lib/emotions';
import {
  FILE_EXTENSION,
  TransferError,
  exportCharacter,
  formatBytes,
  importCharacter,
  readImportFile,
  saveOrShareFile,
  type ImportPreview,
} from '../lib/transfer';
import Modal from './Modal';
import { useConfirm } from './ConfirmDialog';

interface GalleryScreenProps {
  onBack: () => void;
  onCreate: () => void;
  onPlay: (character: Character) => void;
  onEdit: (character: Character) => void;
  onDecorate: (character: Character) => void;
}

// 스케치북에 테이프로 붙인 그림처럼 조금씩 기울인다
const CARD_TILTS = ['-rotate-1', 'rotate-1', 'rotate-[-0.5deg]', 'rotate-[1.5deg]'];
const TAPE_COLORS = ['bg-butter/80', 'bg-blush/70', 'bg-sky/80', 'bg-mint/80'];

export default function GalleryScreen({ onBack, onCreate, onPlay, onEdit, onDecorate }: GalleryScreenProps) {
  const { confirm, dialog } = useConfirm();
  const [characters, setCharacters] = useState<Character[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<ImportPreview | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setCharacters(await getAllCharacters());
    } catch (err) {
      console.error(err);
      setError('친구들을 불러오지 못했어요. 브라우저 저장소 설정을 확인해 주세요.');
      setCharacters([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(''), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const handleDelete = async (character: Character) => {
    playPop();
    if (!(await confirm(`"${character.name}" 친구와 대화 기록을 모두 지울까요? 지우면 되돌릴 수 없어요.`))) return;
    playPop();
    await deleteCharacter(character.id);
    await load();
  };

  const handleExport = async (character: Character) => {
    playPop();
    setBusy(`${character.name} 내보내는 중...`);
    setError('');
    try {
      const file = await exportCharacter(character);
      const how = await saveOrShareFile(file);
      setNotice(
        how === 'downloaded'
          ? `📦 "${file.name}" (${formatBytes(file.size)}) 저장 완료! 이 파일을 태블릿으로 옮겨 "가져오기"를 눌러요.`
          : '📦 친구 파일을 보냈어요!',
      );
    } catch (err) {
      console.error(err);
      setError('내보내지 못했어요. 다시 시도해 주세요.');
    } finally {
      setBusy(null);
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setBusy('파일을 확인하는 중...');
    try {
      const preview = await readImportFile(file);
      setBusy(null);
      if (preview.exists) {
        setPendingImport(preview); // 덮어쓸지 새로 추가할지 묻기
      } else {
        await runImport(preview, 'overwrite');
      }
    } catch (err) {
      setBusy(null);
      setError(err instanceof TransferError ? err.message : '파일을 열지 못했어요.');
    }
  };

  const runImport = async (preview: ImportPreview, mode: 'overwrite' | 'copy') => {
    setPendingImport(null);
    setBusy(`${preview.header.character.name} 데려오는 중...`);
    try {
      const character = await importCharacter(preview, mode);
      playSparkle();
      setNotice(`🎉 "${character.name}" 친구가 놀러 왔어요!`);
      await load();
    } catch (err) {
      console.error(err);
      const quota = err instanceof DOMException && err.name === 'QuotaExceededError';
      setError(quota ? '저장 공간이 부족해요. 기기 저장 공간을 확인해 주세요.' : '친구를 데려오지 못했어요.');
    } finally {
      setBusy(null);
    }
  };

  const openImport = () => {
    unlockAudio();
    playPop();
    fileInput.current?.click();
  };

  const click = (fn: () => void) => () => {
    unlockAudio();
    playPop();
    fn();
  };

  return (
    <main className="sketchbook-bg min-h-[100dvh] w-full px-4 pb-16 pt-11 sm:px-8">
      {/* 안드로이드 파일 선택기에서 확장자가 회색으로 막히지 않도록 accept는 넓게 둔다 */}
      <input
        ref={fileInput}
        type="file"
        className="hidden"
        accept={`${FILE_EXTENSION},application/octet-stream,*/*`}
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <button type="button" onClick={click(onBack)} className="glass-btn">
          <ArrowLeft className="h-5 w-5" /> 처음으로
        </button>
        <h1 className="font-crayon text-4xl font-bold sm:text-5xl">내가 그린 친구들</h1>
        <div className="flex gap-2">
          <button type="button" onClick={openImport} className="glass-btn" aria-label="친구 가져오기">
            <FolderInput className="h-5 w-5" /> <span className="hidden sm:inline">가져오기</span>
          </button>
          {characters && characters.length > 0 && (
            <button type="button" onClick={click(onCreate)} className="btn-storybook bg-blush px-4 py-2 text-lg">
              <Plus className="h-5 w-5" /> <span className="hidden sm:inline">새 친구</span>
            </button>
          )}
        </div>
      </header>

      {error && <p className="mx-auto mt-6 max-w-xl rounded-2xl bg-rose-100 px-4 py-3 text-center text-rose-600">{error}</p>}
      {notice && (
        <p className="mx-auto mt-6 max-w-xl animate-pop-in rounded-2xl bg-white/90 px-4 py-3 text-center font-cute text-lg shadow-soft">
          {notice}
        </p>
      )}
      {busy && (
        <p className="mx-auto mt-6 flex max-w-xl items-center justify-center gap-2 rounded-2xl bg-white/90 px-4 py-3 font-cute text-lg shadow-soft">
          <Loader2 className="h-5 w-5 animate-spin" /> {busy}
        </p>
      )}

      {characters === null ? (
        <div className="flex h-[60dvh] items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-blush" />
        </div>
      ) : characters.length === 0 ? (
        <section className="mx-auto mt-16 flex max-w-lg flex-col items-center text-center">
          <div className="relative mb-6">
            <span className="block animate-float text-8xl" aria-hidden>
              🏡
            </span>
            <span className="absolute -right-6 -top-2 animate-wiggle text-4xl" aria-hidden>
              ✨
            </span>
          </div>
          <div className="card-storybook px-8 py-8">
            <p className="font-cute text-2xl leading-relaxed sm:text-3xl">
              아직 놀러 온 친구가 없어요!
              <br />
              첫 번째 그림 친구를 만들어볼까? 🎨
            </p>
            <button
              type="button"
              onClick={click(onCreate)}
              className="btn-storybook mt-8 w-full bg-blush px-10 py-6 text-3xl"
            >
              <Plus className="h-8 w-8" /> 친구 만들기
            </button>
            <button type="button" onClick={openImport} className="btn-storybook mt-4 w-full bg-white px-6 py-3 text-xl">
              <FolderInput className="h-6 w-6" /> 다른 기기에서 만든 친구 가져오기
            </button>
          </div>
        </section>
      ) : (
        <section className="mx-auto mt-10 grid max-w-6xl grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {characters.map((c, i) => (
            <CharacterCard
              key={c.id}
              character={c}
              tilt={CARD_TILTS[i % CARD_TILTS.length]}
              tape={TAPE_COLORS[i % TAPE_COLORS.length]}
              disabled={busy !== null}
              onPlay={click(() => onPlay(c))}
              onEdit={click(() => onEdit(c))}
              onDecorate={click(() => onDecorate(c))}
              onExport={() => void handleExport(c)}
              onDelete={() => void handleDelete(c)}
            />
          ))}
        </section>
      )}

      {dialog}

      <Modal
        open={pendingImport !== null}
        onClose={() => setPendingImport(null)}
        title="이미 있는 친구예요"
        icon={<FolderInput className="h-6 w-6" />}
      >
        {pendingImport && (
          <div className="space-y-4">
            <p className="leading-relaxed">
              <b>"{pendingImport.header.character.name}"</b> 친구가 이미 이 기기에 있어요. 어떻게 할까요?
            </p>
            <button
              type="button"
              onClick={() => void runImport(pendingImport, 'overwrite')}
              className="btn-storybook w-full bg-mint px-4 py-3 text-lg"
            >
              새 파일로 바꾸기 (덮어쓰기)
            </button>
            <button
              type="button"
              onClick={() => void runImport(pendingImport, 'copy')}
              className="btn-storybook w-full bg-white px-4 py-3 text-lg"
            >
              따로 하나 더 추가하기
            </button>
          </div>
        )}
      </Modal>
    </main>
  );
}

interface CharacterCardProps {
  character: Character;
  tilt: string;
  tape: string;
  disabled: boolean;
  onPlay: () => void;
  onEdit: () => void;
  onDecorate: () => void;
  onExport: () => void;
  onDelete: () => void;
}

function CharacterCard({ character, tilt, tape, disabled, onPlay, onEdit, onDecorate, onExport, onDelete }: CharacterCardProps) {
  const posterUrl = useDecoratedPoster(character);
  const emotionCount = VIDEO_SLOTS.filter((s) => !s.required && character.videos[s.slot]).length;
  const created = new Date(character.createdAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
  // 마우스가 있는 기기에서만 올렸을 때 보이고, 태블릿(터치)에서는 항상 보인다
  const toolClass =
    'rounded-full bg-white/90 p-2.5 text-cocoa/60 shadow-soft transition disabled:opacity-40 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100';

  return (
    <article className={`group relative ${tilt}`}>
      <span className={`absolute -top-3 left-1/2 z-10 h-6 w-20 -translate-x-1/2 -rotate-2 shadow-sm ${tape}`} aria-hidden />
      <button
        type="button"
        onClick={onPlay}
        className="block w-full bg-white p-2.5 pb-1 text-left shadow-soft transition duration-200 hover:-translate-y-1 active:scale-95"
      >
        <div className="aspect-square w-full overflow-hidden bg-cream">
          {posterUrl ? (
            <img src={posterUrl} alt={character.name} className="h-full w-full object-cover transition group-hover:scale-105" />
          ) : (
            <div className="flex h-full items-center justify-center text-6xl">🎨</div>
          )}
        </div>
        <div className="px-1 py-2">
          <p className="truncate font-crayon text-3xl font-bold leading-tight">{character.name}</p>
          <p className="text-sm text-cocoa/60">
            {created} · {character.videos.idle ? `감정 ${emotionCount}개` : '그림이 직접 움직여요'}
          </p>
        </div>
      </button>
      <div className="absolute right-2 top-2 flex gap-1.5">
        <button
          type="button"
          onClick={onEdit}
          disabled={disabled}
          className={`${toolClass} hover:text-emerald-600`}
          aria-label={`${character.name} 고치기`}
          title="눈·입 위치, 표정 영상 고치기"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onDecorate}
          disabled={disabled}
          className={`${toolClass} hover:text-lime-600`}
          aria-label={`${character.name} 자연물로 꾸미기`}
          title="자연물로 꾸미기"
        >
          <Leaf className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onExport}
          disabled={disabled}
          className={`${toolClass} hover:text-sky-600`}
          aria-label={`${character.name} 내보내기`}
          title="다른 기기로 보내기"
        >
          <Share2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          className={`${toolClass} hover:text-rose-500`}
          aria-label={`${character.name} 삭제`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}
