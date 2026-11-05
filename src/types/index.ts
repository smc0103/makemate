/** Gemini가 돌려주는 감정 코드 */
export type EmotionCode =
  | 'happy'
  | 'comfort'
  | 'surprised'
  | 'curious'
  | 'proud'
  | 'calm'
  | 'shy'
  | 'scared'
  | 'love'
  | 'idle';

/** 캐릭터가 가질 수 있는 비디오 슬롯 */
export type VideoSlot = 'idle' | 'talking' | Exclude<EmotionCode, 'idle'>;

/** 1회 재생되는 감정 비디오 슬롯 */
export type EmotionVideoSlot = Exclude<VideoSlot, 'idle' | 'talking'>;

export interface CharacterVideos {
  /** 기본 눈 깜빡임 루프 */
  idle: Blob | null;
  /** 말할 때 입 벙긋거림 루프 */
  talking: Blob | null;
  /** 신나요 */
  happy?: Blob | null;
  /** 슬퍼요 */
  comfort?: Blob | null;
  /** 놀라요 */
  surprised?: Blob | null;
  /** 궁금해요 */
  curious?: Blob | null;
  /** 뿌듯해요 */
  proud?: Blob | null;
  /** 차분해요 (아이가 화났을 때 함께 숨쉬기) */
  calm?: Blob | null;
  /** 부끄러워요 */
  shy?: Blob | null;
  /** 무서워요 */
  scared?: Blob | null;
  /** 좋아해요 */
  love?: Blob | null;
}

/** 그림을 직접 움직일 때 쓰는 눈과 입 위치. 위치는 그림 가로·세로 비율, 크기는 긴 변 비율 */
export interface FaceMap {
  leftEye: { x: number; y: number };
  /** 옆모습이라 눈이 하나면 null */
  rightEye: { x: number; y: number } | null;
  /** 입을 그리지 않았으면 null */
  mouth: { x: number; y: number } | null;
  eyeSize: number;
  mouthSize: number;
}

export interface Character {
  id: string;
  name: string;
  /** 대표 정지 사진 */
  posterImage: Blob | string;
  videos: CharacterVideos;
  /** 있으면 영상 없이 그림이 직접 움직인다 (영상이 있으면 영상이 우선) */
  face?: FaceMap;
  /** 자연물로 꾸민 스티커들 (붙인 순서대로 위에 그린다) */
  decorations?: Decoration[];
  /** 친구 목소리. 없으면 기본 목소리 */
  voice?: FriendVoice;
  createdAt: number;
}

/** 친구마다 다른 목소리 (기기에 있는 음성 + 높이·빠르기) */
export interface FriendVoice {
  /** 기기 음성 이름. 비우면 자동으로 고른다 (다른 기기로 옮기면 그 기기에 맞춰 자동) */
  voiceName?: string;
  /** 0 ~ 2 (브라우저가 허용하는 최대 폭) */
  pitch: number;
  /** 0.3 ~ 2 */
  rate: number;
  /** 고른 목소리 느낌 (화면 표시용) */
  preset?: string;
}

/** 자연물 보관함에 모아 둔, 배경을 오려 낸 자연물 스티커 */
export interface Sticker {
  id: string;
  /** 투명 배경 PNG (흰 테두리 포함) */
  image: Blob;
  width: number;
  height: number;
  createdAt: number;
}

/** 친구 그림 위에 붙인 스티커. 위치는 그림 가로·세로 비율, 너비는 그림 가로 비율 */
export interface Decoration {
  id: string;
  image: Blob;
  /** 스티커 세로 / 가로 */
  aspect: number;
  x: number;
  y: number;
  w: number;
  /** 라디안 */
  rot: number;
  flip?: boolean;
}

export type Speaker = 'child' | 'friend';

export interface ChatLog {
  id: string;
  characterId: string;
  /** 발화자 */
  speaker: Speaker;
  text: string;
  /** 발화 시점의 감정 (아이 발화는 친구가 읽어낸 감정) */
  emotion: EmotionCode;
  /** 놀이 중 질문·대답. 마음 날씨 통계에서는 뺀다. */
  game?: boolean;
  timestamp: number;
}

/** 미션 놀이에서 아이가 찾아온 자연물 */
export interface MissionFind {
  id: string;
  characterId: string;
  missionId: string;
  missionTitle: string;
  emoji: string;
  /** 기기 안에만 저장되는 축소 사진 */
  photo: Blob;
  /** AI가 사진에서 알아본 것 (어른이 확인했으면 빈 문자열) */
  what: string;
  confirmedBy: 'ai' | 'adult';
  timestamp: number;
}

export interface GeminiReply {
  emotion: EmotionCode;
  speech: string;
}

export type Route =
  | { name: 'home' }
  | { name: 'gallery' }
  | { name: 'create' }
  | { name: 'edit'; character: Character }
  | { name: 'play'; character: Character }
  | { name: 'decorate'; character: Character; back: 'play' | 'gallery'; photo?: Blob };
