/**
 * 자연물 찾기 미션
 * 기본 미션은 서대문자연사박물관 누리집과 관람도우미(학습지)에 나오는 전시를
 * 야외에서 실제로 찾을 수 있는 자연물과 이어 만들었다.
 * 보호자·선생님이 그날 장소에 맞는 미션을 직접 추가할 수 있다.
 */

export interface Mission {
  id: string;
  emoji: string;
  /** "○○ 찾기"처럼 조사 없이 이어지는 이름 */
  title: string;
  /** 친구가 소리 내어 말하는 미션 설명 */
  intro: string;
  /** 화면에 보여주는 힌트 */
  hint: string;
  /** 사진 확인 AI에게 알려주는 인정 기준 */
  check: string;
  /** 살아 있는 것 등 꺾거나 잡지 않고 사진만 찍는 미션 */
  photoOnly: boolean;
  /** 이어지는 박물관 전시 */
  exhibit?: string;
  /** 성공했을 때 보여주는 박물관 이야기 */
  fact?: string;
  custom?: boolean;
}

const DEFAULT_MISSIONS: Mission[] = [
  {
    id: 'dino-bone',
    emoji: '🦴',
    title: '공룡 뼈처럼 길쭉한 나뭇가지',
    exhibit: '1층 중앙홀 · 아크로칸토사우루스',
    intro: '박물관에서 커다란 공룡 뼈 봤지요? 공룡 뼈처럼 길쭉한 나뭇가지를 찾아 줄래요? 땅에 떨어진 걸로요!',
    hint: '땅에 떨어진 길쭉한 가지',
    check: '땅에 떨어진 나뭇가지. 뼈처럼 길쭉하면 더 좋지만 나뭇가지면 인정.',
    fact: '중앙홀 공룡은 버스보다 더 길어요!',
    photoOnly: false,
  },
  {
    id: 'dino-foot',
    emoji: '🍁',
    title: '공룡 발처럼 갈라진 나뭇잎',
    exhibit: '1층 중앙홀 · 아크로칸토사우루스',
    intro: '공룡 발에는 뾰족한 발가락이 있어요. 공룡 발처럼 여러 갈래로 갈라진 나뭇잎을 찾아 볼까요?',
    hint: '손가락처럼 갈라진 낙엽',
    check: '갈래가 있거나 뾰족한 모양의 나뭇잎. 정확히 세 갈래가 아니어도 인정.',
    fact: '중앙홀 공룡 앞발에는 뾰족한 발톱이 세 개 있어요.',
    photoOnly: false,
  },
  {
    id: 'stego-spikes',
    emoji: '🌲',
    title: '뾰족뾰족한 잎 네 개',
    exhibit: '2층 생명진화관 · 스테고사우루스',
    intro: '등에 뾰족뾰족 판이 있는 공룡 봤지요? 그 공룡처럼 뾰족한 잎을 찾아요. 하나, 둘, 셋, 넷! 네 개 모아 볼까요?',
    hint: '솔잎처럼 뾰족한 잎 네 개',
    check: '솔잎처럼 뾰족하거나 길쭉한 잎. 개수가 달라도 뾰족한 잎이 보이면 인정.',
    fact: '스테고사우루스 꼬리에는 뾰족한 뼈가 네 개 있어요.',
    photoOnly: false,
  },
  {
    id: 'ammonite-swirl',
    emoji: '🐚',
    title: '돌돌 말린 것',
    exhibit: '야외공원 · 화석찾기 놀이원',
    intro: '달팽이처럼 돌돌 말린 화석 봤지요? 돌돌 말린 걸 찾아 볼까요? 말린 나뭇잎도 좋아요!',
    hint: '말린 낙엽, 덩굴, 빈 달팽이 껍데기',
    check: '돌돌 말리거나 둥글게 감긴 자연물. 말린 낙엽, 덩굴손, 빈 달팽이 껍데기 등.',
    fact: '화석찾기 놀이원 모래 속에 돌돌 말린 화석이 숨어 있어요.',
    photoOnly: false,
  },
  {
    id: 'rock',
    emoji: '🪨',
    title: '울퉁불퉁한 돌멩이',
    exhibit: '3층 지구환경관 · 암석',
    intro: '손에 쏙 들어오는 돌멩이를 찾아 줄래요? 만지면 울퉁불퉁할까요, 매끈매끈할까요?',
    hint: '손바닥보다 작은 돌멩이',
    check: '돌멩이. 표면이 거칠거나 울퉁불퉁하면 더 좋지만 돌이면 인정.',
    fact: '박물관 3층에는 반짝반짝 예쁜 돌이 아주 많아요.',
    photoOnly: false,
  },
  {
    id: 'fossil-stone',
    emoji: '🪨',
    title: '줄무늬가 있는 돌',
    exhibit: '3층 지구환경관 · 지질현상',
    intro: '돌에도 무늬가 있대요! 줄무늬나 점무늬가 있는 돌을 찾아 볼까요?',
    hint: '줄이나 점이 보이는 돌',
    check: '무늬, 줄, 층, 점, 얼룩이 보이는 돌. 실제 지층이나 화석이 아니어도 인정.',
    fact: '땅은 케이크처럼 여러 겹으로 쌓여 있어요.',
    photoOnly: false,
  },
  {
    id: 'seed',
    emoji: '🌰',
    title: '도토리나 솔방울',
    exhibit: '1층 인간과 자연관 · 생산자',
    intro: '도토리나 솔방울 속에는 작은 씨앗이 숨어 있어요. 하나 찾아 줄래요? 입에는 넣지 않아요!',
    hint: '도토리, 솔방울, 떨어진 열매 (먹지 않기)',
    check: '도토리, 솔방울, 씨앗, 나무 열매. 먹지 않고 보기만 하는 미션.',
    fact: '작은 씨앗이 자라서 커다란 나무가 돼요.',
    photoOnly: false,
  },
  {
    id: 'colorful-leaf',
    emoji: '🍂',
    title: '바스락 낙엽',
    exhibit: '1층 인간과 자연관 · 분해자',
    intro: '밟으면 바스락바스락 소리 나는 낙엽을 찾아 볼까요? 무슨 색깔일지 궁금해요!',
    hint: '바닥에 떨어진 마른 잎',
    check: '떨어진 나뭇잎이면 인정. 구멍이 나거나 마른 잎이면 더 좋음.',
    fact: '떨어진 낙엽은 작은 벌레들이 먹고 다시 흙이 돼요.',
    photoOnly: false,
  },
  {
    id: 'bark',
    emoji: '🌳',
    title: '거칠거칠한 나무껍질',
    exhibit: '2층 생명진화관 · 공룡의 세계',
    intro: '공룡 피부는 어떤 느낌이었을까요? 나무를 살살 만져 보고, 거칠거칠한 나무껍질을 사진으로 찍어요!',
    hint: '뜯지 말고 나무에 붙은 채로 찍기',
    check: '나무 기둥이나 나무껍질이 보이는 사진이면 인정.',
    fact: '공룡 피부도 거칠거칠했을 거래요.',
    photoOnly: true,
  },
  {
    id: 'insect',
    emoji: '🐜',
    title: '꼬물꼬물 작은 벌레',
    exhibit: '1층 인간과 자연관 · 살아있는 동물 코너',
    intro: '꼬물꼬물 개미나 벌레를 찾아 볼까요? 잡지 말고 멀리서 사진만 찍어요. 벌이 보이면 어른에게 말해요!',
    hint: '잡지 않고 사진만! 벌은 어른에게 알리기',
    check: '곤충, 거미, 개미, 또는 벌레가 살 만한 풀숲, 낙엽 더미, 나무 구멍.',
    fact: '박물관 1층에는 진짜 장수풍뎅이랑 청개구리가 살아요.',
    photoOnly: true,
  },
  {
    id: 'moss-flower',
    emoji: '🌱',
    title: '초록초록 작은 풀',
    exhibit: '1층 인간과 자연관 · 멸종 위기종',
    intro: '초록초록 작은 풀이나 폭신한 이끼를 찾아 볼까요? 아프지 않게 뽑지 말고 사진만 찍어요!',
    hint: '뽑지 않고 사진만 찍기',
    check: '풀, 이끼, 작은 식물, 풀꽃이 보이는 사진.',
    fact: '작은 풀도 우리가 지켜 줘야 하는 소중한 친구예요.',
    photoOnly: true,
  },
  {
    id: 'earth-helper',
    emoji: '🌏',
    title: '버려진 쓰레기',
    exhibit: '1층 인간과 자연관 · 기후변화',
    intro: '숲에 쓰레기가 있으면 동물들이 아파요. 버려진 쓰레기를 찾으면 손대지 말고 사진을 찍고 어른에게 알려요!',
    hint: '손대지 않고 사진만! 어른에게 꼭 알리기',
    check: '길이나 풀밭에 버려진 쓰레기, 플라스틱, 캔처럼 사람이 버린 물건.',
    fact: '쓰레기를 줍는 건 지구를 지키는 멋진 일이에요.',
    photoOnly: true,
  },
];

const CUSTOM_KEY = 'maeum-friend:custom-missions';
const AI_CHECK_KEY = 'maeum-friend:mission-ai-check';

function loadCustom(): Mission[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? '[]') as Mission[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCustom(list: Mission[]) {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
  } catch {
    /* noop */
  }
}

export function getMissions(): Mission[] {
  return [...DEFAULT_MISSIONS, ...loadCustom()];
}

export function addCustomMission(title: string, hint: string, id: string): Mission[] {
  const name = title.trim();
  const mission: Mission = {
    id,
    emoji: '🌟',
    title: name,
    intro: `이번 미션은 ${name} 찾기예요! 찾으면 사진을 찍어서 보여 줄래요?`,
    hint: hint.trim() || '찾으면 사진을 찍어 보여 주세요',
    check: `${name}${hint.trim() ? ` (${hint.trim()})` : ''}. 비슷하면 인정.`,
    photoOnly: false,
    custom: true,
  };
  saveCustom([...loadCustom(), mission]);
  return getMissions();
}

export function removeCustomMission(id: string): Mission[] {
  saveCustom(loadCustom().filter((m) => m.id !== id));
  return getMissions();
}

/** 아직 찾지 않은 미션 중 하나를 고른다. 다 찾았으면 전체에서 고른다. */
export function pickMission(missions: Mission[], doneIds: Set<string>, exceptId?: string): Mission {
  const others = missions.filter((m) => m.id !== exceptId);
  const pool = others.filter((m) => !doneIds.has(m.id));
  const list = pool.length ? pool : others.length ? others : missions;
  return list[Math.floor(Math.random() * list.length)];
}

export function missionContext(mission: Mission, state: 'searching' | 'found'): string {
  if (state === 'found') {
    return `아이가 방금 "${mission.title}" 찾기 미션을 해냈어. 어떻게 찾았는지 구체적으로 칭찬하고, 만져 보니 어땠는지나 어디서 찾았는지 물어봐. 그다음 놀이는 아이가 고르게 해. 찾은 자연물로 친구를 꾸며 보기, 비슷한 것을 더 찾아보기, 옆 친구에게 보여 주기 중에서 골라 보자고 해.`;
  }
  return `아이가 지금 야외에서 "${mission.title}" 찾기 미션을 하는 중이야. 정답을 바로 알려 주지 말고 기다려 주고, 막히면 작은 힌트 하나만 줘. "어디에 있을 것 같아요?", "친구랑 같이 찾아볼까요?"처럼 아이가 스스로 방법을 정하게 해. 식물을 꺾거나 곤충을 잡지 말고, 어른 눈에 보이는 곳에 있으라고 필요할 때 부드럽게 알려 줘.`;
}

/** 사진을 AI에게 보내 확인할지 (끄면 어른이 직접 확인) */
export function getAiCheckEnabled(): boolean {
  try {
    return localStorage.getItem(AI_CHECK_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setAiCheckEnabled(on: boolean): void {
  try {
    localStorage.setItem(AI_CHECK_KEY, on ? 'on' : 'off');
  } catch {
    /* noop */
  }
}
