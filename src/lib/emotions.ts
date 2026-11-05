import type { EmotionCode, EmotionVideoSlot, VideoSlot } from '../types';

export const EMOTION_CODES: EmotionCode[] = ['happy', 'comfort', 'surprised', 'curious', 'proud', 'calm', 'shy', 'scared', 'love', 'idle'];

/** 한 번씩 보여 주는 감정 (영상 칸·그림 몸짓) */
export const EMOTION_SLOTS: EmotionVideoSlot[] = ['happy', 'comfort', 'surprised', 'curious', 'proud', 'calm', 'shy', 'scared', 'love'];

export function isEmotionSlot(e: EmotionCode): e is EmotionVideoSlot {
  return (EMOTION_SLOTS as string[]).includes(e);
}

export interface SlotMeta {
  slot: VideoSlot;
  emoji: string;
  title: string;
  description: string;
  required: boolean;
  /** Tailwind 배경 클래스 */
  tint: string;
}

export const VIDEO_SLOTS: SlotMeta[] = [
  { slot: 'idle', emoji: '😊', title: '기본 표정', description: '눈을 깜빡이며 기다리는 반복 영상', required: true, tint: 'bg-sky/60' },
  { slot: 'talking', emoji: '🗣️', title: '말하는 표정', description: '입을 벙긋거리는 반복 영상', required: true, tint: 'bg-peach/70' },
  { slot: 'happy', emoji: '😄', title: '신나요', description: '아이가 기쁠 때 함께 신나는 얼굴', required: false, tint: 'bg-butter/80' },
  { slot: 'comfort', emoji: '😢', title: '슬퍼요', description: '아이가 슬플 때 함께 공감하는 얼굴', required: false, tint: 'bg-sky/60' },
  { slot: 'surprised', emoji: '😲', title: '놀라요', description: '뜻밖의 이야기를 들었을 때의 얼굴', required: false, tint: 'bg-peach/60' },
  { slot: 'curious', emoji: '🤔', title: '궁금해요', description: '궁금해서 고개를 갸웃하는 얼굴', required: false, tint: 'bg-cream' },
  { slot: 'proud', emoji: '😎', title: '뿌듯해요', description: '아이가 해냈을 때 함께 뿌듯한 얼굴', required: false, tint: 'bg-lilac/60' },
  { slot: 'calm', emoji: '😌', title: '차분해요', description: '아이가 화났을 때 함께 숨 쉬는 얼굴', required: false, tint: 'bg-mint/70' },
  { slot: 'shy', emoji: '😳', title: '부끄러워요', description: '칭찬받고 쑥스러워하는 얼굴', required: false, tint: 'bg-blush/40' },
  { slot: 'scared', emoji: '😨', title: '무서워요', description: '아이가 무섭거나 걱정될 때 함께 걱정하는 얼굴', required: false, tint: 'bg-sky/40' },
  { slot: 'love', emoji: '🥰', title: '좋아해요', description: '좋아해, 고마워 말을 들었을 때의 얼굴', required: false, tint: 'bg-blush/60' },
];

export interface EmotionMeta {
  emoji: string;
  /** 친구가 보여주는 반응 */
  friendLabel: string;
  /** 리포트에서 아이의 마음으로 읽는 이름 */
  childFeeling: string;
  color: string;
  chip: string;
  /** 보호자를 위한 코칭 팁 */
  tip: string;
}

export const EMOTION_META: Record<EmotionCode, EmotionMeta> = {
  surprised: {
    emoji: '😲',
    friendLabel: '함께 놀라요',
    childFeeling: '놀람',
    color: '#F6A04D',
    chip: 'bg-peach text-cocoa',
    tip: '놀랐던 순간을 천천히 다시 이야기하게 해 주세요. 무서웠던 놀람이라면 먼저 괜찮다고 안심시켜 주세요.',
  },
  happy: {
    emoji: '😄',
    friendLabel: '함께 기뻐해요',
    childFeeling: '기쁨',
    color: '#FFD84D',
    chip: 'bg-butter text-cocoa',
    tip: '기쁜 순간을 구체적으로 다시 이야기하게 해 주세요. "어떤 부분이 제일 신났어?" 같은 질문이 좋아요.',
  },
  comfort: {
    emoji: '😢',
    friendLabel: '함께 슬퍼해요',
    childFeeling: '슬픔',
    color: '#FF8FAB',
    chip: 'bg-blush/70 text-cocoa',
    tip: '슬픔을 고치려 하기보다 "그랬구나, 많이 속상했겠다"처럼 먼저 온전히 받아주세요.',
  },
  calm: {
    emoji: '😌',
    friendLabel: '함께 숨 쉬어요',
    childFeeling: '화남',
    color: '#5CC9A7',
    chip: 'bg-mint text-cocoa',
    tip: '화난 감정 자체는 괜찮다고 알려주고, 풍선 불기처럼 천천히 숨 쉬는 놀이를 함께 해 보세요.',
  },
  proud: {
    emoji: '😎',
    friendLabel: '칭찬해줘요',
    childFeeling: '뿌듯함',
    color: '#A88BFA',
    chip: 'bg-lilac text-cocoa',
    tip: '결과보다 과정을 칭찬해 주세요. "끝까지 해낸 게 정말 멋지다!"처럼요.',
  },
  curious: {
    emoji: '🤔',
    friendLabel: '궁금해해요',
    childFeeling: '궁금함',
    color: '#5DB3F5',
    chip: 'bg-sky text-cocoa',
    tip: '정답을 바로 알려주기보다 "너는 어떻게 생각해?"로 아이의 상상을 넓혀 주세요.',
  },
  shy: {
    emoji: '😳',
    friendLabel: '쑥스러워해요',
    childFeeling: '쑥스러움',
    color: '#FFB3C7',
    chip: 'bg-blush/40 text-cocoa',
    tip: '쑥스러운 마음도 괜찮다고 알려 주세요. 칭찬은 짧고 구체적으로 해 주면 아이가 편하게 받아들여요.',
  },
  scared: {
    emoji: '😨',
    friendLabel: '함께 걱정해요',
    childFeeling: '무서움·걱정',
    color: '#8FA8D8',
    chip: 'bg-sky/50 text-cocoa',
    tip: '무서운 마음을 작게 여기지 말고 "무서웠구나, 내가 옆에 있을게"처럼 먼저 안심시켜 주세요.',
  },
  love: {
    emoji: '🥰',
    friendLabel: '좋아해요',
    childFeeling: '사랑·고마움',
    color: '#FF6F91',
    chip: 'bg-blush text-cocoa',
    tip: '좋아하는 마음과 고마운 마음을 말로 표현한 것을 칭찬해 주세요. 누구에게 전하고 싶은지 물어봐도 좋아요.',
  },
  idle: {
    emoji: '🙂',
    friendLabel: '편안하게 들어요',
    childFeeling: '평온',
    color: '#C8B6A6',
    chip: 'bg-white text-cocoa',
    tip: '편안한 대화 속에서 오늘 있었던 일을 하나씩 물어봐 주세요.',
  },
};

export function isEmotionCode(value: unknown): value is EmotionCode {
  return typeof value === 'string' && (EMOTION_CODES as string[]).includes(value);
}
