import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Character, ChatLog, MissionFind, Sticker } from '../types';

const DB_NAME = 'maeum-friend-db';
// 4: 자연물 보관함(stickers). 빠진 저장소는 버전을 올릴 때마다 다시 만든다
const DB_VERSION = 4;

interface MaeumFriendDB extends DBSchema {
  characters: {
    key: string;
    value: Character;
    indexes: { 'by-createdAt': number };
  };
  chatLogs: {
    key: string;
    value: ChatLog;
    indexes: { 'by-character': string; 'by-timestamp': number };
  };
  missionFinds: {
    key: string;
    value: MissionFind;
    indexes: { 'by-character': string };
  };
  stickers: {
    key: string;
    value: Sticker;
    indexes: { 'by-createdAt': number };
  };
}

let dbPromise: Promise<IDBPDatabase<MaeumFriendDB>> | null = null;

function getDB(): Promise<IDBPDatabase<MaeumFriendDB>> {
  if (!dbPromise) {
    dbPromise = openDB<MaeumFriendDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('characters')) {
          const characters = db.createObjectStore('characters', { keyPath: 'id' });
          characters.createIndex('by-createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains('chatLogs')) {
          const logs = db.createObjectStore('chatLogs', { keyPath: 'id' });
          logs.createIndex('by-character', 'characterId');
          logs.createIndex('by-timestamp', 'timestamp');
        }
        if (!db.objectStoreNames.contains('missionFinds')) {
          const finds = db.createObjectStore('missionFinds', { keyPath: 'id' });
          finds.createIndex('by-character', 'characterId');
        }
        if (!db.objectStoreNames.contains('stickers')) {
          const stickers = db.createObjectStore('stickers', { keyPath: 'id' });
          stickers.createIndex('by-createdAt', 'createdAt');
        }
      },
      blocked() {
        console.warn('[db] 다른 탭에서 이전 버전 DB를 사용 중이에요.');
      },
      blocking(_current, _blocked, event) {
        // 새 버전을 쓰는 탭이 열리면 이 연결을 닫아 업그레이드를 막지 않는다
        (event.target as IDBDatabase).close();
        dbPromise = null;
      },
      terminated() {
        dbPromise = null;
      },
    }).catch((err: unknown) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ---------------- Characters ---------------- */

export async function getAllCharacters(): Promise<Character[]> {
  const db = await getDB();
  const list = await db.getAllFromIndex('characters', 'by-createdAt');
  return list.reverse();
}

export async function getCharacter(id: string): Promise<Character | undefined> {
  const db = await getDB();
  return db.get('characters', id);
}

export async function saveCharacter(character: Character): Promise<void> {
  const db = await getDB();
  await db.put('characters', character);
}

/** 캐릭터와 그 친구의 대화 기록을 함께 삭제 */
export async function deleteCharacter(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['characters', 'chatLogs', 'missionFinds'], 'readwrite');
  await tx.objectStore('characters').delete(id);
  let findCursor = await tx.objectStore('missionFinds').index('by-character').openCursor(IDBKeyRange.only(id));
  while (findCursor) {
    await findCursor.delete();
    findCursor = await findCursor.continue();
  }
  const logIndex = tx.objectStore('chatLogs').index('by-character');
  let cursor = await logIndex.openCursor(IDBKeyRange.only(id));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

/* ---------------- Chat logs ---------------- */

export async function addChatLog(log: ChatLog): Promise<void> {
  const db = await getDB();
  await db.put('chatLogs', log);
}

export async function addChatLogs(logs: ChatLog[]): Promise<void> {
  if (logs.length === 0) return;
  const db = await getDB();
  const tx = db.transaction('chatLogs', 'readwrite');
  await Promise.all([...logs.map((log) => tx.store.put(log)), tx.done]);
}

export async function getChatLogs(characterId: string): Promise<ChatLog[]> {
  const db = await getDB();
  const logs = await db.getAllFromIndex('chatLogs', 'by-character', characterId);
  return logs.sort((a, b) => a.timestamp - b.timestamp);
}

export async function clearChatLogs(characterId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('chatLogs', 'readwrite');
  let cursor = await tx.store.index('by-character').openCursor(IDBKeyRange.only(characterId));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

/* ---------------- Mission finds ---------------- */

export async function addMissionFind(find: MissionFind): Promise<void> {
  const db = await getDB();
  await db.put('missionFinds', find);
}

export async function getMissionFinds(characterId: string): Promise<MissionFind[]> {
  const db = await getDB();
  const finds = await db.getAllFromIndex('missionFinds', 'by-character', characterId);
  return finds.sort((a, b) => a.timestamp - b.timestamp);
}

export async function deleteMissionFind(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('missionFinds', id);
}

export async function clearMissionFinds(characterId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('missionFinds', 'readwrite');
  let cursor = await tx.store.index('by-character').openCursor(IDBKeyRange.only(characterId));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

/* ---------------- Stickers (자연물 보관함) ---------------- */

/** 최근에 오린 것부터 */
export async function getStickers(): Promise<Sticker[]> {
  const db = await getDB();
  const list = await db.getAllFromIndex('stickers', 'by-createdAt');
  return list.reverse();
}

export async function saveSticker(sticker: Sticker): Promise<void> {
  const db = await getDB();
  await db.put('stickers', sticker);
}

export async function deleteSticker(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('stickers', id);
}
