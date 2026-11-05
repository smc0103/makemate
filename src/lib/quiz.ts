import { josa } from './offline';

/**
 * 박물관 열고개: 친구가 떠올린 전시물을 아이가 질문해서 맞히는 놀이.
 * - 전시물 정보는 서대문자연사박물관 누리집과 관람도우미(학습지)를 바탕으로 정리했다.
 * - 대부분의 질문은 카드 정보로 바로 답한다. 인터넷·API 사용량이 필요 없고 사실을 지어내지 않는다.
 */

/** 한 문제에 쓸 수 있는 질문 수 */
export const QUIZ_QUESTION_LIMIT = 10;

export type QuizGroup = 'near' | 'ancient' | 'water' | 'land';

export const QUIZ_GROUPS: Array<{ id: QuizGroup; emoji: string; label: string }> = [
  { id: 'near', emoji: '🐶', label: '우리 곁 동물' },
  { id: 'ancient', emoji: '🦖', label: '공룡과 옛날 생물' },
  { id: 'water', emoji: '🐋', label: '물에 사는 친구' },
  { id: 'land', emoji: '🐘', label: '땅에 사는 친구' },
];

export type TraitKey =
  | 'dinosaur'
  | 'pterosaur'
  | 'insect'
  | 'fish'
  | 'bird'
  | 'mammal'
  | 'wings'
  | 'fly'
  | 'water'
  | 'land'
  | 'meat'
  | 'plants'
  | 'extinct'
  | 'fur'
  | 'horn'
  | 'tail'
  | 'big'
  | 'teeth'
  | 'longNose'
  | 'longNeck'
  | 'shell';

export interface QuizCard {
  id: string;
  name: string;
  emoji: string;
  group: QuizGroup;
  /** 말로 맞힐 때 인정하는 이름 (음성 인식 오차 포함) */
  aliases: string[];
  /** 알 수 없는 것은 넣지 않는다 → "잘 모르겠어요"로 답한다 */
  traits: Partial<Record<TraitKey, boolean>>;
  /** 특정 예/아니요 답을 더 정확한 문장으로 바꾼다 */
  notes?: Partial<Record<TraitKey, string>>;
  home: string;
  food?: string;
  size?: string;
  legs?: string;
  looks: string;
  /** 박물관에서 만나는 곳 */
  place: string;
  /** 순서대로 쉬워지는 힌트. 이름을 말하지 않는다. */
  hints: string[];
  /** 정답을 맞힌 뒤 들려주는 박물관 이야기 */
  fact: string;
}

const WALK_TWO = '뒷다리 두 개로 걸었어요';

export const QUIZ_CARDS: QuizCard[] = [
  {
    id: 'acrocanthosaurus',
    name: '아크로칸토사우루스',
    emoji: '🦖',
    group: 'ancient',
    aliases: ['아크로칸토', '아크로', '칸토사우루스', '아크로칸'],
    traits: { dinosaur: true, meat: true, plants: false, extinct: true, land: true, big: true, tail: true, teeth: true, fly: false, wings: false, water: false, fur: false, horn: false },
    home: '아주 옛날 땅 위에 살았어요',
    food: '고기를 먹었어요. 다른 공룡을 사냥하기도 했어요',
    size: '버스만큼 긴 아주 큰 몸이에요',
    legs: '뒷다리 두 개로 걷고, 앞발은 짧아요',
    looks: `목부터 꼬리까지 등에 길쭉한 뼈가 줄지어 있고, ${WALK_TWO}`,
    place: '박물관 1층 중앙홀 한가운데',
    hints: ['박물관에 들어가면 가장 먼저 보이는 커다란 친구예요.', '목부터 꼬리까지 등을 따라 길쭉한 뼈가 줄지어 있어요.', '앞발에 날카로운 발톱이 달린 손가락이 세 개 있어요.'],
    fact: '박물관에 들어가면 제일 먼저 만나는 커다란 공룡이에요. 등을 따라 길쭉한 뼈가 줄지어 있어요.',
  },
  {
    id: 'tyrannosaurus',
    name: '티라노사우루스',
    emoji: '🦖',
    group: 'ancient',
    aliases: ['티라노', '티렉스', '티락스'],
    traits: { dinosaur: true, meat: true, plants: false, extinct: true, land: true, big: true, tail: true, teeth: true, fly: false, wings: false, water: false, horn: false },
    home: '아주 옛날 땅 위에 살았어요',
    food: '고기를 먹었어요',
    size: '아주 크고 무거운 몸이에요',
    legs: '뒷다리 두 개로 걷고, 앞발은 아주 짧아요',
    looks: `머리가 아주 크고, ${WALK_TWO}`,
    place: '박물관 2층 생명진화관',
    hints: ['아주 유명한 육식 공룡이에요.', '머리가 크고 입이 아주 커요.', '이름이 "티"로 시작해요.'],
    fact: '고기를 먹던 아주 힘센 공룡이에요. 박물관 2층에서 공룡 친구들을 만날 수 있어요.',
  },
  {
    id: 'stegosaurus',
    name: '스테고사우루스',
    emoji: '🦕',
    group: 'ancient',
    aliases: ['스테고', '스테고사우르스'],
    traits: { dinosaur: true, meat: false, plants: true, extinct: true, land: true, big: true, tail: true, fly: false, wings: false, water: false, fur: false, horn: false },
    home: '아주 옛날 땅 위에 살았어요',
    food: '풀을 먹었어요',
    size: '몸집이 커요. 그런데 몸집에 비해 뇌는 아주 작아요',
    legs: '다리가 네 개예요',
    looks: '꼬리 끝에 창처럼 뾰족한 뼈가 달려 있어요',
    place: '박물관 2층 생명진화관',
    hints: ['풀을 먹는 공룡이에요.', '꼬리가 무기예요. 창처럼 뾰족한 뼈가 있어요.', '꼬리의 뾰족한 뼈는 모두 네 개예요.'],
    fact: '꼬리에 있는 창 모양의 뼈 네 개가 무기였어요. 몸집에 비해 뇌는 아주 작았대요.',
  },
  {
    id: 'pachycephalosaurus',
    name: '파키케팔로사우루스',
    emoji: '🦕',
    group: 'ancient',
    aliases: ['파키케팔로', '파키', '박치기공룡', '박치기'],
    traits: { dinosaur: true, extinct: true, land: true, tail: true, fly: false, wings: false, water: false },
    home: '아주 옛날 땅 위에 살았어요',
    legs: '뒷다리 두 개로 걸었어요',
    looks: '머리뼈가 아주 단단하고 볼록해요',
    place: '박물관 2층 생명진화관',
    hints: ['별명이 재미있는 공룡이에요.', '머리뼈가 볼록하고 단단해요.', '별명이 머리로 쿵 하는 놀이와 관계있어요.'],
    fact: '별명이 박치기공룡이에요. 볼록하고 단단한 머리뼈를 가졌어요.',
  },
  {
    id: 'pteranodon',
    name: '프테라노돈',
    emoji: '🪽',
    group: 'ancient',
    aliases: ['프테라노돈', '프테라', '테라노돈'],
    traits: { dinosaur: false, pterosaur: true, bird: false, wings: true, fly: true, extinct: true, water: false, big: true },
    notes: {
      dinosaur: '아니요, 공룡은 아니에요. 하늘을 나는 익룡이에요.',
      bird: '아니요, 새는 아니에요. 공룡이 살던 때 하늘을 날던 익룡이에요.',
    },
    home: '아주 옛날 하늘을 날아다녔어요',
    size: '날개를 펼치면 아주 커요',
    looks: '커다란 날개가 있고 머리 뒤쪽이 뾰족해요',
    place: '박물관 1층 중앙홀',
    hints: ['공룡은 아니지만 공룡이 살던 때에 살았어요.', '커다란 날개로 하늘을 날았어요.', '박물관 밖 화석찾기 놀이원에도 이 친구 화석이 숨어 있어요.'],
    fact: '하늘을 날던 익룡이에요. 1층 중앙홀에서 만날 수 있고, 박물관 밖 화석찾기 놀이원에도 화석이 숨어 있어요.',
  },
  {
    id: 'elasmosaurus',
    name: '엘라스모사우루스',
    emoji: '🦕',
    group: 'water',
    aliases: ['엘라스모', '엘라스모사우르스'],
    traits: { dinosaur: false, fish: false, water: true, land: false, meat: true, plants: false, extinct: true, big: true, longNeck: true, tail: true, fly: false, wings: false },
    notes: { dinosaur: '아니요, 공룡은 아니에요. 공룡이 살던 때 바다에 살던 목 긴 친구예요.' },
    home: '아주 옛날 물속에 살았어요',
    food: '물속의 물고기를 주로 잡아먹었어요',
    size: '몸이 아주아주 길어요',
    legs: '다리 대신 지느러미가 네 개 있어요',
    looks: '목이 아주아주 길어요',
    place: '박물관 3층 구름다리',
    hints: ['공룡이 살던 때 물속에 살았어요.', '물고기를 잡아먹었어요.', '목이 아주아주 길어요.', '박물관 3층 구름다리에서 볼 수 있어요.'],
    fact: '목이 아주아주 길어서 물속에서 물고기를 잡아먹었어요. 박물관 3층 구름다리에서 만날 수 있어요.',
  },
  {
    id: 'ammonite',
    name: '암모나이트',
    emoji: '🐚',
    group: 'water',
    aliases: ['암모나이트', '암모나'],
    traits: { dinosaur: false, fish: false, water: true, land: false, extinct: true, shell: true, fly: false, wings: false, fur: false },
    home: '아주 옛날 바다에 살았어요',
    looks: '돌돌 말린 껍데기가 있어요',
    place: '박물관 밖 화석찾기 놀이원',
    hints: ['지금은 화석으로 만날 수 있어요.', '돌돌 말린 껍데기가 있어요.', '박물관 밖 화석찾기 놀이원에 숨어 있어요.'],
    fact: '돌돌 말린 껍데기를 가진 옛날 바다 생물이에요. 박물관 밖 화석찾기 놀이원에 화석이 숨어 있어요.',
  },
  {
    id: 'sperm-whale',
    name: '향고래',
    emoji: '🐋',
    group: 'water',
    aliases: ['향고래', '고래'],
    traits: { dinosaur: false, fish: false, mammal: true, water: true, land: false, meat: true, plants: false, extinct: false, big: true, tail: true, teeth: true, fly: false, wings: false, fur: false },
    notes: { fish: '아니요, 물고기가 아니에요. 새끼에게 젖을 먹여 키우는 동물이에요.' },
    home: '넓은 바다에 살아요',
    food: '바다에 사는 동물을 잡아먹어요',
    size: '아주 큰 몸이에요',
    legs: '다리가 없고 지느러미로 헤엄쳐요',
    looks: '머리가 아주 크고 네모나 보여요',
    place: '박물관 1층 중앙홀',
    hints: ['바다에 살지만 물고기가 아니에요.', '새끼에게 젖을 먹여요.', '박물관 중앙홀 위에서 만날 수 있어요.', '이름에 좋은 냄새를 뜻하는 "향"이 들어가요.'],
    fact: '바다에 살지만 새끼에게 젖을 먹이는 동물이에요. 이빨이 있는 고래이고 1층 중앙홀에서 만날 수 있어요.',
  },
  {
    id: 'shark',
    name: '상어',
    emoji: '🦈',
    group: 'water',
    aliases: ['상어'],
    traits: { dinosaur: false, fish: true, water: true, land: false, extinct: false, tail: true, teeth: true, fly: false, wings: false, fur: false },
    home: '바다에 살아요',
    legs: '다리가 없고 지느러미로 헤엄쳐요',
    looks: '날카로운 이빨과 뾰족한 지느러미가 있어요',
    place: '박물관 2층 생명진화관',
    hints: ['바다에 사는 물고기예요.', '등에 뾰족한 지느러미가 있어요.', '이빨이 아주 날카로워요.'],
    fact: '바다에 사는 물고기예요. 2층 생명진화관에는 우리나라 바다의 상어를 소개하는 곳도 있어요.',
  },
  {
    id: 'minnow',
    name: '버들치',
    emoji: '🐟',
    group: 'water',
    aliases: ['버들치', '버들'],
    traits: { dinosaur: false, fish: true, water: true, land: false, extinct: false, big: false, tail: true, fly: false, wings: false, fur: false },
    home: '깨끗한 시냇물에 살아요',
    size: '작은 물고기예요',
    legs: '다리가 없고 지느러미로 헤엄쳐요',
    looks: '몸이 날씬하고 작아요',
    place: '박물관 1층 인간과 자연관 수족관',
    hints: ['작은 물고기예요.', '바다가 아니라 시냇물에 살아요.', '깨끗한 물을 좋아해요.'],
    fact: '깨끗한 시냇물에 사는 작은 물고기예요. 박물관 1층 수족관에서 만날 수 있어요.',
  },
  {
    id: 'mammoth',
    name: '매머드',
    emoji: '🦣',
    group: 'land',
    aliases: ['매머드', '맘모스', '메머드'],
    traits: { dinosaur: false, mammal: true, land: true, water: false, plants: true, meat: false, extinct: true, fur: true, big: true, tail: true, longNose: true, fly: false, wings: false },
    home: '옛날에 시베리아 같은 추운 곳에 살았어요',
    food: '풀을 먹었어요',
    size: '아주 큰 몸이에요',
    legs: '다리가 네 개예요',
    looks: '온몸에 긴 털이 있고 둥글게 말린 커다란 상아가 있어요',
    place: '박물관 2층 생명진화관',
    hints: ['코끼리와 사촌이에요.', '온몸에 긴 털이 있어요.', '둥글게 말린 커다란 상아가 있어요.', '만 년 전쯤 사라졌어요.'],
    fact: '아시아코끼리의 사촌이에요. 온몸에 긴 털이 있었고 만 년 전쯤 사라졌어요.',
  },
  {
    id: 'elephant',
    name: '아시아코끼리',
    emoji: '🐘',
    group: 'land',
    aliases: ['코끼리', '아시아코끼리'],
    traits: { dinosaur: false, mammal: true, land: true, water: false, plants: true, meat: false, extinct: false, big: true, tail: true, longNose: true, fly: false, wings: false },
    notes: { fur: '온몸을 덮을 만큼 길지는 않고, 짧은 털이 조금 있어요.' },
    home: '아시아의 따뜻한 곳에 살아요',
    food: '풀과 나뭇잎을 먹어요',
    size: '아주 큰 몸이에요',
    legs: '다리가 네 개예요',
    looks: '코가 아주 길고 귀가 커요',
    place: '박물관 2층 생명진화관 입구',
    hints: ['2층 전시실 입구에서 우리를 맞아 줘요.', '코가 아주 길어요.', '아프리카에 사는 사촌보다 귀가 작아요.'],
    fact: '2층 전시실 입구에서 만날 수 있어요. 아프리카코끼리보다 귀가 작아요.',
  },
  {
    id: 'wolf',
    name: '회색늑대',
    emoji: '🐺',
    group: 'land',
    aliases: ['늑대', '회색늑대'],
    traits: { dinosaur: false, mammal: true, land: true, water: false, meat: true, plants: false, extinct: false, fur: true, tail: true, teeth: true, fly: false, wings: false, horn: false },
    home: '숲이나 들판에 살아요',
    food: '다른 동물을 사냥해서 먹어요',
    legs: '다리가 네 개예요',
    looks: '회색 털이 있고 개를 닮았어요',
    place: '박물관 2층 생명진화관',
    hints: ['털이 복슬복슬해요.', '개를 많이 닮았어요.', '털이 회색이에요.'],
    fact: '2층 전시실에서 만날 수 있어요. 개를 닮았고 회색 털을 가졌어요.',
  },
  {
    id: 'polar-bear',
    name: '북극곰',
    emoji: '🐻‍❄️',
    group: 'land',
    aliases: ['북극곰', '흰곰'],
    traits: { dinosaur: false, mammal: true, land: true, meat: true, extinct: false, fur: true, big: true, tail: false, fly: false, wings: false },
    notes: { water: '얼음 위에서 살지만 물에서 수영도 잘해요.', tail: '아주 짧은 꼬리만 있어요.' },
    home: '아주 추운 북극에 살아요',
    food: '다른 동물을 사냥해서 먹어요',
    size: '아주 큰 몸이에요',
    legs: '다리가 네 개예요',
    looks: '온몸이 하얀 털로 덮여 있어요',
    place: '박물관 2층 생명진화관',
    hints: ['아주 추운 곳에 살아요.', '온몸이 하얀 털로 덮여 있어요.', '얼음 위를 걸어 다니는 큰 동물이에요.'],
    fact: '아주 추운 북극에 사는 동물이에요. 같은 북극에는 북극여우도 살아요.',
  },
  {
    id: 'beetle',
    name: '장수풍뎅이',
    emoji: '🪲',
    group: 'land',
    aliases: ['장수풍뎅이', '풍뎅이'],
    traits: { dinosaur: false, insect: true, land: true, water: false, extinct: false, horn: true, wings: true, fly: true, big: false, fur: false },
    home: '숲의 나무 근처에 살아요',
    size: '손에 올라갈 만큼 작아요',
    legs: '다리가 여섯 개예요',
    looks: '단단한 몸에 멋진 뿔이 있어요',
    place: '박물관 1층 살아있는 동물 코너',
    hints: ['작은 곤충이에요.', '머리에 멋진 뿔이 있어요.', '1층 살아있는 동물 코너에서 만날 수 있어요.'],
    fact: '머리에 뿔이 있는 곤충이에요. 1층 살아있는 동물 코너에서 만날 수 있어요.',
  },
  {
    id: 'tree-frog',
    name: '청개구리',
    emoji: '🐸',
    group: 'land',
    aliases: ['개구리', '청개구리'],
    traits: { dinosaur: false, fish: false, insect: false, meat: true, plants: false, extinct: false, big: false, fur: false, tail: false, fly: false, wings: false, horn: false },
    notes: { water: '물가에서 살아요. 물에도 들어가고 나무나 풀에도 올라가요.', land: '물가에서 살아요. 물에도 들어가고 나무나 풀에도 올라가요.' },
    home: '물가의 풀이나 나무에 살아요',
    food: '작은 벌레를 잡아먹어요',
    size: '손가락만큼 작아요',
    legs: '다리가 네 개예요',
    looks: '몸이 초록색이고 폴짝폴짝 잘 뛰어요',
    place: '박물관 1층 살아있는 동물 코너',
    hints: ['몸이 초록색이에요.', '폴짝폴짝 뛰어다녀요.', '비 오는 날 개굴개굴 울어요.'],
    fact: '작은 벌레를 잡아먹어요. 박물관 1층에는 진짜 청개구리가 살고 있어요.',
  },
  // ---- 아이들이 잘 아는 동물 (박물관 전시와 이어지는 이야기를 곁들인다) ----
  {
    id: 'dog',
    name: '강아지',
    emoji: '🐶',
    group: 'near',
    aliases: ['강아지', '멍멍이', '댕댕이'],
    traits: { mammal: true, land: true, water: false, fur: true, tail: true, teeth: true, big: false, fly: false, wings: false, extinct: false, horn: false },
    notes: {
      meat: '네, 고기도 먹고 사료도 먹어요.',
      plants: '풀보다는 사료랑 고기를 좋아해요.',
      water: '물에 살지는 않지만 헤엄은 칠 수 있어요.',
    },
    home: '우리 집이나 마당에 살아요',
    food: '사료랑 고기를 먹어요',
    size: '작은 강아지도 있고 큰 강아지도 있어요',
    legs: '다리가 네 개예요',
    looks: '꼬리를 살랑살랑 흔들고 멍멍 짖어요',
    place: '우리 집이나 동네 공원',
    hints: ['사람이랑 아주 친한 동물이에요.', '기분이 좋으면 꼬리를 살랑살랑 흔들어요.', '멍멍 하고 짖어요.'],
    fact: '사람과 아주 오래전부터 함께 산 친구예요. 박물관에 있는 회색늑대와 닮았어요.',
  },
  {
    id: 'cat',
    name: '고양이',
    emoji: '🐱',
    group: 'near',
    aliases: ['고양이', '야옹이', '냥이'],
    traits: { mammal: true, land: true, water: false, meat: true, plants: false, fur: true, tail: true, teeth: true, big: false, fly: false, wings: false, extinct: false, horn: false },
    home: '우리 집이나 동네에 살아요',
    food: '고기나 생선을 좋아해요',
    size: '품에 안을 만큼 작아요',
    legs: '다리가 네 개예요',
    looks: '수염이 길고 야옹 하고 울어요',
    place: '우리 집이나 동네 골목',
    hints: ['밤에도 눈이 반짝반짝 잘 보여요.', '수염이 길고 발바닥이 말랑말랑해요.', '야옹 하고 울어요.'],
    fact: '사자랑 같은 고양잇과 친구예요. 발바닥이 말랑말랑해서 살금살금 조용히 걸어요.',
  },
  {
    id: 'rabbit',
    name: '토끼',
    emoji: '🐰',
    group: 'near',
    aliases: ['토끼', '토깽이'],
    traits: { mammal: true, land: true, water: false, plants: true, meat: false, fur: true, tail: true, big: false, fly: false, wings: false, extinct: false, horn: false },
    notes: { teeth: '날카롭지는 않지만 앞니가 길어서 당근을 오독오독 잘 먹어요.' },
    home: '풀밭이나 굴 속에 살아요',
    food: '풀이랑 채소를 먹어요',
    size: '품에 안을 만큼 작아요',
    legs: '다리가 네 개이고 뒷다리가 길어요',
    looks: '귀가 길쭉하고 깡충깡충 뛰어요',
    place: '동물원이나 유치원 마당',
    hints: ['귀가 아주 길쭉해요.', '깡충깡충 뛰어다녀요.', '당근이랑 풀을 좋아해요.'],
    fact: '긴 귀로 작은 소리도 아주 잘 들어요.',
  },
  {
    id: 'squirrel',
    name: '다람쥐',
    emoji: '🐿️',
    group: 'near',
    aliases: ['다람쥐', '다람이'],
    traits: { mammal: true, land: true, water: false, fur: true, tail: true, big: false, fly: false, wings: false, extinct: false, horn: false },
    notes: { plants: '네, 도토리랑 밤 같은 열매를 좋아해요.', meat: '고기보다 도토리 같은 열매를 좋아해요.' },
    home: '숲속 나무 위나 땅굴에 살아요',
    food: '도토리랑 밤 같은 열매를 먹어요',
    size: '손바닥에 올라갈 만큼 작아요',
    legs: '다리가 네 개예요',
    looks: '등에 줄무늬가 있고 꼬리가 복슬복슬해요',
    place: '숲이나 공원 나무 위',
    hints: ['숲에 사는 작은 동물이에요.', '볼에 도토리를 가득 넣고 다녀요.', '등에 까만 줄무늬가 있어요.'],
    fact: '겨울에 먹으려고 도토리를 땅에 숨겨 둬요. 깜빡 잊은 도토리는 나무로 자라기도 해요.',
  },
  {
    id: 'duck',
    name: '오리',
    emoji: '🦆',
    group: 'near',
    aliases: ['오리', '꽥꽥이'],
    traits: { bird: true, wings: true, water: true, teeth: false, big: false, extinct: false, horn: false },
    notes: {
      fly: '하늘을 나는 오리도 있고, 잘 못 나는 오리도 있어요.',
      land: '물에서 헤엄도 치고, 땅에서 뒤뚱뒤뚱 걷기도 해요.',
      fur: '털 대신 깃털이 있어요.',
      tail: '짧은 꼬리 깃털이 있어요.',
    },
    home: '연못이나 강가에 살아요',
    food: '물풀이랑 작은 벌레를 먹어요',
    size: '작은 편이에요',
    legs: '다리가 두 개이고 발에 물갈퀴가 있어요',
    looks: '부리가 납작하고 꽥꽥 울어요',
    place: '공원 연못이나 호수',
    hints: ['연못에서 둥둥 떠다녀요.', '발에 물갈퀴가 있어요.', '꽥꽥 하고 울어요.'],
    fact: '발에 물갈퀴가 있어서 헤엄을 아주 잘 쳐요.',
  },
  {
    id: 'butterfly',
    name: '나비',
    emoji: '🦋',
    group: 'near',
    aliases: ['나비', '나비야'],
    traits: { insect: true, wings: true, fly: true, land: true, water: false, meat: false, big: false, extinct: false, horn: false, tail: false },
    notes: { teeth: '이빨 대신 빨대처럼 기다란 입이 있어요.', plants: '꽃에서 달콤한 꿀을 먹어요.' },
    home: '꽃이 많은 풀밭에 살아요',
    food: '꽃에서 꿀을 빨아 먹어요',
    size: '아주 작아요',
    legs: '다리가 여섯 개예요',
    looks: '알록달록 예쁜 날개가 네 장 있어요',
    place: '꽃밭이나 박물관 곤충 전시',
    hints: ['꽃을 아주 좋아해요.', '알록달록 예쁜 날개가 있어요.', '애벌레가 자라서 이 친구가 돼요.'],
    fact: '애벌레였다가 번데기가 되고, 날개를 달고 나와요. 다리가 여섯 개인 곤충이에요.',
  },
  {
    id: 'snail',
    name: '달팽이',
    emoji: '🐌',
    group: 'near',
    aliases: ['달팽이'],
    traits: { shell: true, insect: false, land: true, plants: true, meat: false, fur: false, big: false, fly: false, wings: false, extinct: false },
    notes: {
      water: '물속에 살지는 않고, 비 오는 날 촉촉한 곳을 좋아해요.',
      teeth: '아주 작은 이가 아주 많아서 잎을 사각사각 갉아 먹어요.',
      horn: '뿔처럼 보이는 더듬이가 있어요.',
    },
    home: '촉촉한 풀숲이나 화분 밑에 살아요',
    food: '나뭇잎이랑 채소를 먹어요',
    size: '손가락만큼 작아요',
    legs: '다리가 없고 배로 천천히 기어가요',
    looks: '등에 돌돌 말린 집을 지고 다녀요',
    place: '비 온 뒤 풀숲이나 화단',
    hints: ['아주아주 느릿느릿 움직여요.', '등에 돌돌 말린 집이 있어요.', '비 오는 날 자주 나와요.'],
    fact: '등에 진 집이 박물관 밖 화석 놀이원의 암모나이트처럼 돌돌 말려 있어요.',
  },
  {
    id: 'lion',
    name: '사자',
    emoji: '🦁',
    group: 'land',
    aliases: ['사자', '라이언'],
    traits: { mammal: true, land: true, water: false, meat: true, plants: false, fur: true, tail: true, teeth: true, big: true, fly: false, wings: false, extinct: false, horn: false },
    home: '아프리카의 넓은 풀밭에 살아요',
    food: '다른 동물을 사냥해서 먹어요',
    size: '아주 큰 몸이에요',
    legs: '다리가 네 개예요',
    looks: '수컷은 목 둘레에 복슬복슬한 갈기가 있어요',
    place: '동물원',
    hints: ['동물의 왕이라고 불려요.', '어흥 하고 크게 울어요.', '목 둘레에 복슬복슬한 털이 있어요.'],
    fact: '가족이 함께 무리를 지어 살아요. 고양이와 같은 고양잇과 동물이에요.',
  },
  {
    id: 'giraffe',
    name: '기린',
    emoji: '🦒',
    group: 'land',
    aliases: ['기린'],
    traits: { mammal: true, land: true, water: false, plants: true, meat: false, fur: true, tail: true, teeth: false, big: true, longNeck: true, fly: false, wings: false, extinct: false },
    notes: { horn: '머리에 작고 뭉툭한 뿔 같은 것이 있어요.' },
    home: '아프리카의 넓은 풀밭에 살아요',
    food: '높은 나무의 잎을 먹어요',
    size: '키가 아주아주 커요',
    legs: '다리가 네 개이고 아주 길어요',
    looks: '목이 아주 길고 몸에 얼룩무늬가 있어요',
    place: '동물원',
    hints: ['키가 세상에서 제일 큰 동물이에요.', '높은 나무의 잎을 먹어요.', '목이 아주아주 길어요.'],
    fact: '목이 길어서 높은 나무의 잎도 먹을 수 있어요. 세상에서 키가 가장 큰 동물이에요.',
  },
  {
    id: 'penguin',
    name: '펭귄',
    emoji: '🐧',
    group: 'water',
    aliases: ['펭귄', '펭긴', '팽귄'],
    traits: { bird: true, wings: true, fly: false, water: true, meat: true, plants: false, teeth: false, big: false, extinct: false, horn: false },
    notes: {
      fly: '아니요, 하늘은 못 날아요. 대신 날개로 물속을 헤엄쳐요.',
      land: '얼음이나 바닷가 땅 위에서 뒤뚱뒤뚱 걷기도 해요.',
      fur: '털 대신 촘촘한 깃털이 있어요.',
    },
    home: '추운 남극 바닷가에 많이 살아요',
    food: '물고기를 잡아먹어요',
    size: '아이 키보다 작은 펭귄이 많아요',
    legs: '다리가 두 개이고 뒤뚱뒤뚱 걸어요',
    looks: '등은 까맣고 배는 하얘요',
    place: '아쿠아리움이나 동물원',
    hints: ['새인데 하늘을 날지 못해요.', '뒤뚱뒤뚱 걸어요.', '등은 까맣고 배는 하얘요.'],
    fact: '하늘은 못 날지만 날개로 물속을 쌩쌩 헤엄쳐요.',
  },
  {
    id: 'turtle',
    name: '거북이',
    emoji: '🐢',
    group: 'water',
    aliases: ['거북이', '거북', '바다거북'],
    traits: { shell: true, tail: true, teeth: false, fur: false, fly: false, wings: false, extinct: false, horn: false },
    notes: {
      water: '바다에 사는 거북도 있고, 땅에 사는 거북도 있어요.',
      land: '바다에 사는 거북도 있고, 땅에 사는 거북도 있어요.',
      teeth: '이빨 대신 단단한 부리가 있어요.',
    },
    home: '바다나 연못, 땅 위에도 살아요',
    size: '작은 거북도 있고 아주 큰 거북도 있어요',
    legs: '다리가 네 개예요',
    looks: '등에 단단한 등딱지가 있어요',
    place: '아쿠아리움이나 동물원',
    hints: ['아주 느릿느릿 걸어요.', '등에 단단한 집 같은 등딱지가 있어요.', '토끼랑 달리기 경주를 한 이야기 속 친구예요.'],
    fact: '등딱지는 뼈로 되어 있어서 아주 단단해요.',
  },
  {
    id: 'octopus',
    name: '문어',
    emoji: '🐙',
    group: 'water',
    aliases: ['문어'],
    traits: { water: true, land: false, fish: false, meat: true, plants: false, teeth: false, fur: false, shell: false, tail: false, fly: false, wings: false, extinct: false, horn: false },
    notes: { teeth: '이빨 대신 단단한 부리가 있어요.' },
    home: '바닷속 바위틈에 살아요',
    food: '게나 조개를 잡아먹어요',
    size: '작은 문어도 있고 아주 큰 문어도 있어요',
    legs: '다리가 여덟 개예요',
    looks: '머리가 동그랗고 다리에 빨판이 많아요',
    place: '아쿠아리움',
    hints: ['바닷속에 사는 친구예요.', '다리가 여덟 개예요.', '위험하면 까만 먹물을 뿜어요.'],
    fact: '다리의 빨판으로 바위에 착 붙을 수 있어요. 몸 색깔도 바꿀 수 있어요.',
  },
];

/* ---------------- 질문 해석 ---------------- */

interface TraitQuestion {
  key: TraitKey;
  re: RegExp;
  yes: string;
  no: string;
}

// 띄어쓰기를 지운 문장에서 찾는다. 위에 있을수록 먼저 판단한다.
const TRAIT_QUESTIONS: TraitQuestion[] = [
  { key: 'meat', re: /고기(를|을)?(먹|잡)|육식|잡아먹|사냥/, yes: '네, 다른 동물을 잡아먹어요.', no: '아니요, 고기를 먹지 않아요.' },
  { key: 'plants', re: /풀(을|만)?먹|초식|나뭇잎(을)?먹|식물(을)?먹|채소/, yes: '네, 풀 같은 식물을 먹어요.', no: '아니요, 풀을 먹지 않아요.' },
  { key: 'dinosaur', re: /공룡/, yes: '네, 공룡이에요.', no: '아니요, 공룡은 아니에요.' },
  { key: 'pterosaur', re: /익룡/, yes: '네, 익룡이에요.', no: '아니요, 익룡은 아니에요.' },
  { key: 'insect', re: /곤충|벌레/, yes: '네, 곤충이에요.', no: '아니요, 곤충은 아니에요.' },
  { key: 'fish', re: /물고기/, yes: '네, 물고기예요.', no: '아니요, 물고기는 아니에요.' },
  { key: 'bird', re: /^새(야|예요|에요|이야|인가|니|지)?\??$|새(야|예요|에요|이에요)\??$/, yes: '네, 새예요.', no: '아니요, 새는 아니에요.' },
  { key: 'mammal', re: /젖|포유/, yes: '네, 새끼에게 젖을 먹여요.', no: '아니요, 젖을 먹이지 않아요.' },
  { key: 'wings', re: /날개/, yes: '네, 날개가 있어요.', no: '아니요, 날개가 없어요.' },
  // "만날 수 있어요"의 "날 수"는 나는 것이 아니다
  { key: 'fly', re: /날아|(^|[^만])날수|날줄|날을수|날어|하늘|나는거/, yes: '네, 하늘을 날 수 있어요.', no: '아니요, 하늘을 날지 못해요.' },
  { key: 'water', re: /바다|물속|물에|강에|수영|헤엄|수족관/, yes: '네, 물에 살아요.', no: '아니요, 물에 살지 않아요.' },
  { key: 'land', re: /땅|육지|숲에|걸어/, yes: '네, 땅 위에 살아요.', no: '아니요, 땅 위에 살지 않아요.' },
  { key: 'extinct', re: /옛날|멸종|오래전|사라졌|지금없|이제없/, yes: '네, 아주 옛날에 살았고 지금은 볼 수 없어요.', no: '아니요, 지금도 살아 있어요.' },
  { key: 'fur', re: /털/, yes: '네, 털이 있어요.', no: '아니요, 털은 없어요.' },
  { key: 'horn', re: /뿔/, yes: '네, 뿔이 있어요.', no: '아니요, 뿔은 없어요.' },
  { key: 'tail', re: /꼬리/, yes: '네, 꼬리가 있어요.', no: '아니요, 꼬리는 없어요.' },
  { key: 'teeth', re: /이빨|이가/, yes: '네, 날카로운 이빨이 있어요.', no: '아니요, 날카로운 이빨은 없어요.' },
  { key: 'longNose', re: /코(가)?(길|긴)/, yes: '네, 코가 아주 길어요.', no: '아니요, 코가 길지 않아요.' },
  { key: 'longNeck', re: /목(이)?(길|긴)/, yes: '네, 목이 아주 길어요.', no: '아니요, 목이 아주 길지는 않아요.' },
  { key: 'shell', re: /껍데기|껍질/, yes: '네, 껍데기가 있어요.', no: '아니요, 껍데기는 없어요.' },
];

// "지금도 살아 있어?"는 extinct의 반대 답
const ALIVE_RE = /지금도|지금살|지금있|살아있/;
const BIG_RE = /커\??$|커요|커다|큰|크니|크지|보다커|보다크/;
const SMALL_RE = /작아|작은|작니|작지|조그/;
const OPEN_WHERE_MUSEUM = /박물관|몇층|어디에?있|어디가면|어디(에)?서볼|어디(에)?서만나|어디(에)?서만날/;
const OPEN_HOME = /어디(에|서)?(살|사)|사는곳|집이어디/;
const OPEN_FOOD = /뭐(를)?먹|뭘먹|무엇(을)?먹|무슨.*먹|먹이|뭐먹/;
const OPEN_SIZE = /얼마나|크기|몸집|몇미터/;
const OPEN_LEGS = /다리|발이몇|발몇/;
const OPEN_LOOKS = /어떻게생|생겼|무슨색|색깔|모양/;
// 생물 종류와 눈에 띄는 생김새는 카드에 적혀 있지 않으면 아닌 것으로 답한다
const KIND_TRAITS: TraitKey[] = ['fish', 'bird', 'insect', 'pterosaur', 'mammal', 'horn', 'longNose', 'longNeck', 'shell'];
const HINT_RE = /힌트|모르겠|어려워/;
const GIVE_UP_RE = /포기|정답(이)?뭐|정답알려|답알려|답이뭐/;
const COMPARISON_RE = /보다|처럼|같이|닮|하고|랑/;
const NOUN_GUESS_RE = /^(.{1,8}?)(이야|야|이지|이니|인가요|인가|이에요|예요|맞지|맞아)\??$/;
const NOT_A_NOUN = /^(뭐|누구|어디|왜|어때|뭐|그래|진짜|정말|좋|안|아니)/;

/** 질문 예시 버튼. key가 같은 질문을 이미 했으면 숨긴다 */
export const QUESTION_CHIPS: Array<{ key: string; label: string }> = [
  { key: 'dinosaur', label: '공룡이에요?' },
  { key: 'home', label: '어디에 살아요?' },
  { key: 'food', label: '무엇을 먹어요?' },
  { key: 'fly', label: '하늘을 날 수 있어요?' },
  { key: 'water', label: '물에 살아요?' },
  { key: 'size', label: '얼마나 커요?' },
  { key: 'looks', label: '어떻게 생겼어요?' },
  { key: 'extinct', label: '옛날에 살았어요?' },
  { key: 'fur', label: '털이 있어요?' },
  { key: 'place', label: '어디서 만날 수 있어요?' },
];

export type QuizAnswerKind = 'win' | 'wrong' | 'fact' | 'unknown' | 'hint' | 'giveup' | 'unclear';

export interface QuizAnswer {
  kind: QuizAnswerKind;
  /** 아이에게 들려줄 말 (unclear면 빈 문자열) */
  speech: string;
  /** 어떤 질문이었는지 (예시 버튼 숨김용) */
  key?: string;
  /** 틀리게 맞힌 카드 이름 */
  guessed?: string;
}

function compact(text: string): string {
  return text.replace(/[\s.,!~]/g, '');
}

export function matchesCard(card: QuizCard, said: string): boolean {
  return said.includes(compact(card.name)) || card.aliases.some((a) => said.includes(compact(a)));
}

const UNKNOWN_SPEECH = '음, 그건 나도 잘 모르겠어요.';

/** 카드에 적힌 값. 생물 종류와 눈에 띄는 생김새는 없으면 아닌 것으로 본다. */
export function traitValue(card: QuizCard, key: TraitKey): boolean | undefined {
  return card.traits[key] ?? (KIND_TRAITS.includes(key) ? false : undefined);
}

/** 아이의 말을 카드 정보로 해석한다. 처리할 수 없으면 kind가 unclear */
export function answerQuestion(card: QuizCard, text: string): QuizAnswer {
  const said = compact(text);
  if (!said) return { kind: 'unclear', speech: '' };

  if (GIVE_UP_RE.test(said)) return { kind: 'giveup', speech: '' };
  if (HINT_RE.test(said)) return { kind: 'hint', speech: '' };

  // 비교하는 말("코끼리보다 커?")은 이름 맞히기가 아니다
  const comparing = COMPARISON_RE.test(said);
  if (!comparing) {
    if (matchesCard(card, said)) return { kind: 'win', speech: '' };
    const other = QUIZ_CARDS.find((c) => c.id !== card.id && matchesCard(c, said));
    if (other) {
      return { kind: 'wrong', guessed: other.name, speech: `아쉽지만 ${josa(other.name, '은/는')} 아니에요.` };
    }
  }

  // 열린 질문
  if (OPEN_WHERE_MUSEUM.test(said)) return { kind: 'fact', key: 'place', speech: `${card.place}에서 만날 수 있어요.` };
  if (OPEN_HOME.test(said)) return { kind: 'fact', key: 'home', speech: `${card.home}.` };
  if (OPEN_FOOD.test(said)) {
    return card.food ? { kind: 'fact', key: 'food', speech: `${card.food}.` } : { kind: 'unknown', key: 'food', speech: UNKNOWN_SPEECH };
  }
  if (OPEN_SIZE.test(said)) {
    return card.size ? { kind: 'fact', key: 'size', speech: `${card.size}.` } : { kind: 'unknown', key: 'size', speech: UNKNOWN_SPEECH };
  }
  if (OPEN_LEGS.test(said)) {
    return card.legs ? { kind: 'fact', key: 'legs', speech: `${card.legs}.` } : { kind: 'unknown', key: 'legs', speech: UNKNOWN_SPEECH };
  }
  if (OPEN_LOOKS.test(said)) return { kind: 'fact', key: 'looks', speech: `${card.looks}.` };

  // 지금도 살아 있는지
  if (ALIVE_RE.test(said) && card.traits.extinct !== undefined) {
    return {
      kind: 'fact',
      key: 'extinct',
      speech: card.traits.extinct ? '아니요, 아주 옛날에 살았고 지금은 볼 수 없어요.' : '네, 지금도 살아 있어요.',
    };
  }

  // 예/아니요 질문
  for (const q of TRAIT_QUESTIONS) {
    if (!q.re.test(said)) continue;
    const note = card.notes?.[q.key];
    const value = traitValue(card, q.key);
    if (note && (value === undefined || value === false)) return { kind: 'fact', key: q.key, speech: note };
    if (value === undefined) return { kind: 'unknown', key: q.key, speech: UNKNOWN_SPEECH };
    return { kind: 'fact', key: q.key, speech: value ? q.yes : q.no };
  }

  // 크기 질문은 "코끼리보다 커?"처럼 정확히 비교할 수 없어 큰 편인지로 답한다
  if (SMALL_RE.test(said) || BIG_RE.test(said)) {
    const big = card.traits.big;
    if (big === undefined) return { kind: 'unknown', key: 'size', speech: UNKNOWN_SPEECH };
    const askedSmall = SMALL_RE.test(said);
    const yes = askedSmall ? !big : big;
    return { kind: 'fact', key: 'size', speech: yes ? `네, ${askedSmall ? '작은' : '큰'} 편이에요.` : `아니요, ${big ? '큰' : '작은'} 편이에요.` };
  }

  // 카드에 없는 이름을 말한 경우 ("사자야?")
  if (!comparing) {
    const noun = said.match(NOUN_GUESS_RE)?.[1];
    if (noun && !NOT_A_NOUN.test(noun)) {
      return { kind: 'wrong', guessed: noun, speech: `아쉽지만 ${josa(noun, '은/는')} 아니에요.` };
    }
  }

  return { kind: 'unclear', speech: '' };
}

const NEXT_PROMPTS = ['또 무엇이 궁금해요?', '이제 누구일 것 같아요?', '다음에는 무엇을 물어볼까요?'];

export function nextPrompt(turn: number): string {
  return NEXT_PROMPTS[turn % NEXT_PROMPTS.length];
}

export function revealSpeech(card: QuizCard, solved: boolean): string {
  const lead = solved ? `딩동댕, 정답은 ${card.name}예요!` : `정답은 ${card.name}예요.`;
  return `${lead.replace(/([가-힣])예요/, (_m, ch: string) => `${ch}${(ch.charCodeAt(0) - 0xac00) % 28 === 0 ? '예요' : '이에요'}`)} ${card.fact} 어떤 점이 제일 신기했어요?`;
}

/* ---------------- 문제 고르기 ---------------- */

export function pickCard(group: QuizGroup | null, solved: Set<string>, exceptId?: string): QuizCard {
  const pool = QUIZ_CARDS.filter((c) => (!group || c.group === group) && c.id !== exceptId);
  const fresh = pool.filter((c) => !solved.has(c.id));
  const list = fresh.length ? fresh : pool;
  return list[Math.floor(Math.random() * list.length)];
}

/** 정답을 고를 때 보여줄 보기: 정답 + 같은 묶음에서 2개 */
export function answerOptions(card: QuizCard): QuizCard[] {
  const others = QUIZ_CARDS.filter((c) => c.id !== card.id);
  const same = others.filter((c) => c.group === card.group).sort(() => Math.random() - 0.5);
  const rest = others.filter((c) => c.group !== card.group).sort(() => Math.random() - 0.5);
  return [card, ...[...same, ...rest].slice(0, 2)].sort(() => Math.random() - 0.5);
}

export function quizContext(card: QuizCard, state: 'playing' | 'done'): string {
  const facts = [card.home, card.food, card.size, card.legs, card.looks, `만나는 곳: ${card.place}`, ...card.hints, card.fact].filter(Boolean).join(' / ');
  if (state === 'done') {
    return `아이가 방금 스무고개에서 "${card.name}"를 맞혔어. 아래 사실만 근거로 이야기하고, 모르는 건 모른다고 말해: ${facts}`;
  }
  return `아이와 스무고개 놀이 중이야. 네가 몰래 떠올린 정답은 "${card.name}"이고, 아이가 질문해서 맞혀야 해. 정답 이름이나 이름의 일부는 절대 말하지 마. 아래 사실만 근거로 짧게 답하고, 여기 없는 내용은 잘 모르겠다고 말해. 아이가 속상하거나 화가 나 보이면 놀이보다 마음을 먼저 받아 줘: ${facts}`;
}

/* ---------------- 맞힌 문제 기록 ---------------- */

const solvedKey = (characterId: string) => `maeum-friend:quiz-solved:${characterId}`;

export function getSolved(characterId: string): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(solvedKey(characterId)) ?? '[]') as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function saveSolved(characterId: string, solved: Set<string>): void {
  try {
    if (solved.size) localStorage.setItem(solvedKey(characterId), JSON.stringify([...solved]));
    else localStorage.removeItem(solvedKey(characterId));
  } catch {
    /* noop */
  }
}
