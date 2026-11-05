import type { Character, CharacterVideos, ChatLog, Decoration, FaceMap, FriendVoice, VideoSlot } from '../types';
import { EMOTION_SLOTS } from './emotions';
import { addChatLogs, clearChatLogs, createId, getCharacter, getChatLogs, saveCharacter } from './db';

/**
 * 친구 내보내기/가져오기 (.maeumfriend)
 * 다른 기기(예: 노트북 → 갤럭시탭)로 그림·영상·대화 기록을 파일 하나로 옮긴다.
 *
 * 파일 구조: [MAGIC 8바이트][헤더 길이 uint32 LE][헤더 JSON][데이터 조각들...]
 * 영상은 base64로 바꾸지 않고 그대로 이어 붙여 용량이 늘지 않고, 가져올 때도 메모리에 다 올리지 않는다.
 */

const MAGIC = 'MAEUMF1\n';
export const FILE_EXTENSION = '.maeumfriend';
const VIDEO_SLOTS: VideoSlot[] = ['idle', 'talking', ...EMOTION_SLOTS];

interface PartRef {
  part: number;
  type: string;
}

interface Header {
  format: 'maeum-friend';
  version: 1;
  exportedAt: number;
  character: {
    id: string;
    name: string;
    createdAt: number;
    poster: PartRef | { url: string };
    videos: Partial<Record<VideoSlot, PartRef | null>>;
    face?: FaceMap;
    decorations?: Array<Omit<Decoration, 'image'> & { image: PartRef }>;
    voice?: FriendVoice;
  };
  logs: ChatLog[];
  parts: Array<{ size: number }>;
}

export class TransferError extends Error {}

/** 파일 이름에 쓸 수 없는 글자 제거 */
function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '').trim() || '친구';
}

export async function exportCharacter(character: Character): Promise<File> {
  const blobs: Blob[] = [];
  const addPart = (blob: Blob): PartRef => {
    blobs.push(blob);
    return { part: blobs.length - 1, type: blob.type };
  };

  const poster = typeof character.posterImage === 'string' ? { url: character.posterImage } : addPart(character.posterImage);
  const videos: Partial<Record<VideoSlot, PartRef | null>> = {};
  for (const slot of VIDEO_SLOTS) {
    const blob = character.videos[slot];
    videos[slot] = blob ? addPart(blob) : null;
  }

  const decorations = character.decorations?.map((d) => ({ ...d, image: addPart(d.image) }));

  const header: Header = {
    format: 'maeum-friend',
    version: 1,
    exportedAt: Date.now(),
    character: { id: character.id, name: character.name, createdAt: character.createdAt, poster, videos, face: character.face, decorations, voice: character.voice },
    logs: await getChatLogs(character.id),
    parts: blobs.map((b) => ({ size: b.size })),
  };

  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const lengthBytes = new Uint8Array(4);
  new DataView(lengthBytes.buffer).setUint32(0, headerBytes.length, true);

  return new File([MAGIC, lengthBytes, headerBytes, ...blobs], `${safeFileName(character.name)}${FILE_EXTENSION}`, {
    type: 'application/octet-stream',
  });
}

/** 내보낸 파일을 기기에 저장하거나(PC) 공유 창으로 보낸다(태블릿) */
export async function saveOrShareFile(file: File): Promise<'shared' | 'downloaded'> {
  const touch = window.matchMedia?.('(pointer: coarse)').matches;
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  if (touch && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'shared'; // 사용자가 공유 창을 닫음
      /* 공유 실패 시 다운로드로 */
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}

export interface ImportPreview {
  header: Header;
  file: Blob;
  dataStart: number;
  /** 같은 친구가 이미 이 기기에 있는지 */
  exists: boolean;
}

export async function readImportFile(file: Blob): Promise<ImportPreview> {
  const head = new Uint8Array(await file.slice(0, MAGIC.length + 4).arrayBuffer());
  if (new TextDecoder().decode(head.slice(0, MAGIC.length)) !== MAGIC) {
    throw new TransferError('내가 그린 친구에서 내보낸 파일(.maeumfriend)이 아니에요.');
  }
  const headerLength = new DataView(head.buffer).getUint32(MAGIC.length, true);
  const headerStart = MAGIC.length + 4;
  let header: Header;
  try {
    header = JSON.parse(
      new TextDecoder().decode(await file.slice(headerStart, headerStart + headerLength).arrayBuffer()),
    ) as Header;
  } catch {
    throw new TransferError('파일이 손상되었어요.');
  }
  if (header.format !== 'maeum-friend' || header.version !== 1) {
    throw new TransferError('이 앱 버전에서 열 수 없는 파일이에요.');
  }
  const dataStart = headerStart + headerLength;
  const expected = dataStart + header.parts.reduce((sum, p) => sum + p.size, 0);
  if (file.size < expected) throw new TransferError('파일이 끝까지 전송되지 않았어요. 다시 옮겨 주세요.');

  return { header, file, dataStart, exists: Boolean(await getCharacter(header.character.id)) };
}

/**
 * @param mode overwrite: 같은 친구를 덮어씀 / copy: 새 친구로 추가
 */
export async function importCharacter(preview: ImportPreview, mode: 'overwrite' | 'copy'): Promise<Character> {
  const { header, file, dataStart } = preview;
  const offsets: number[] = [];
  let cursor = dataStart;
  for (const p of header.parts) {
    offsets.push(cursor);
    cursor += p.size;
  }
  const partBlob = (ref: PartRef) => file.slice(offsets[ref.part], offsets[ref.part] + header.parts[ref.part].size, ref.type);

  const id = mode === 'overwrite' ? header.character.id : createId();
  const videos: CharacterVideos = { idle: null, talking: null };
  for (const slot of VIDEO_SLOTS) {
    const ref = header.character.videos[slot];
    videos[slot] = ref ? partBlob(ref) : null;
  }
  // slice는 원본 파일을 가리키므로 실제 데이터로 복사해 둔다 (원본 파일이 사라져도 안전)
  const materialize = async (blob: Blob | null | undefined) =>
    blob ? new Blob([await blob.arrayBuffer()], { type: blob.type }) : null;
  for (const slot of VIDEO_SLOTS) videos[slot] = await materialize(videos[slot]);

  const posterRef = header.character.poster;
  const posterImage = 'url' in posterRef ? posterRef.url : ((await materialize(partBlob(posterRef))) as Blob);

  const decorations: Decoration[] = [];
  for (const d of header.character.decorations ?? []) {
    decorations.push({ ...d, image: (await materialize(partBlob(d.image))) as Blob });
  }

  const character: Character = {
    id,
    name: mode === 'copy' && preview.exists ? `${header.character.name} (복사)` : header.character.name,
    posterImage,
    videos,
    ...(header.character.face ? { face: header.character.face } : {}),
    ...(decorations.length ? { decorations } : {}),
    ...(header.character.voice ? { voice: header.character.voice } : {}),
    createdAt: mode === 'overwrite' ? header.character.createdAt : Date.now(),
  };

  await saveCharacter(character);
  if (mode === 'overwrite') await clearChatLogs(id);
  await addChatLogs(header.logs.map((log) => ({ ...log, id: mode === 'overwrite' ? log.id : createId(), characterId: id })));
  return character;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}
