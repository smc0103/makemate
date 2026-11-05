import type { EmotionCode, GeminiReply } from '../types';
import { FIRST_GREETING_LINE } from './gemini';

/**
 * 오프라인 대화 엔진
 * - API 키·인터넷 없이 키워드 기반으로 아이의 감정을 읽고 1~2문장으로 대답한다.
 * - 모든 대답은 아이의 생각/기분을 묻는 열린 질문으로 끝난다.
 */

/* ---------------- 한국어 조사 처리 ---------------- */

function hasBatchim(word: string): boolean {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

const JOSA: Record<string, [string, string]> = {
  '이/가': ['이', '가'],
  '을/를': ['을', '를'],
  '은/는': ['은', '는'],
  '와/과': ['과', '와'],
  '이랑/랑': ['이랑', '랑'],
  '이에요/예요': ['이에요', '예요'],
  '이었구나/였구나': ['이었구나', '였구나'],
};

export function josa(word: string, pair: keyof typeof JOSA): string {
  const [withBatchim, without] = JOSA[pair];
  return word + (hasBatchim(word) ? withBatchim : without);
}

/** 템플릿의 {T}, {T이/가} 같은 자리에 주제어와 조사를 채운다 */
function fill(template: string, topic: string | null, name: string): string {
  return template
    .replace(/\{N(이에요\/예요)?\}/g, (_m, pair?: string) => (pair ? josa(name, pair as keyof typeof JOSA) : name))
    .replace(/\{T([^}]*)\}/g, (_m, pair: string) => {
      if (!topic) return '';
      return pair ? josa(topic, pair as keyof typeof JOSA) : topic;
    });
}

/* ---------------- 반복 방지 랜덤 선택 ---------------- */

const recent: string[] = [];

function pick(options: string[]): string {
  const fresh = options.filter((o) => !recent.includes(o));
  const pool = fresh.length ? fresh : options;
  const choice = pool[Math.floor(Math.random() * pool.length)];
  recent.push(choice);
  if (recent.length > 14) recent.shift();
  return choice;
}

/* ---------------- 감정 사전 ---------------- */

// "재미없어", "안 좋아"처럼 긍정 낱말이 들어 있지만 실제로는 속상한 표현
const NEGATED_POSITIVE = /(안\s*좋|좋지\s*않|재미\s*없|재미가\s*없|안\s*재밌|안\s*재미있|안\s*신나|기분\s*(이\s*)?(안|나빠|나쁘|별로)|별로)/g;

const LEXICON: Record<Exclude<EmotionCode, 'idle'>, RegExp[]> = {
  calm: [
    /화(가)?\s*(나|났|난|내)/, /짜증/, /열\s*(받|나)/, /미워/, /밉/, /싫어/, /싫다/, /뺏/, /빼앗/, /약\s*올/, /놀렸/, /놀려/,
    /억울/, /싸웠/, /싸워/, /때리고\s*싶/, /부숴/, /소리\s*질/, /화난/, /꼴\s*보기/, /답답/,
  ],
  comfort: [
    /슬퍼/, /슬프/, /슬펐/, /울었/, /울어/, /울고/, /눈물/, /속상/, /아파/, /아팠/, /아프/, /외로/,
    /보고\s*싶/, /그리워/, /혼났/, /혼나/, /다쳤/, /넘어졌/, /서운/, /심심/, /혼자/, /같이\s*안\s*놀/, /안\s*놀아/,
    /잃어버/, /없어졌/, /망쳤/, /실수/, /못\s*했/, /힘들/, /피곤/, /지쳤/, /우울/,
  ],
  proud: [
    /해냈/, /성공/, /칭찬/, /상\s*(을\s*)?받/, /1등/, /일등/, /잘\s*했/, /만들었/, /그렸/, /혼자서/, /스스로/, /완성/,
    /이겼/, /다\s*먹었/, /배웠/, /할\s*수\s*있게/, /도와\s*줬/, /도와줬/, /양보/, /정리했/, /씩씩/, /용감/,
  ],
  happy: [
    /좋아/, /좋았/, /좋은/, /신나/, /신났/, /재밌/, /재미있/, /행복/, /기뻐/, /기뻤/, /기쁘/, /즐거/, /최고/, /웃었/, /웃겨/,
    /놀이\s*공원/, /생일/, /선물/, /여행/, /놀러/, /맛있/, /예뻐/, /예쁜/, /설레/,
  ],
  surprised: [/깜짝/, /놀랐/, /놀라/, /헉/, /세상에/, /대박/, /믿을\s*수\s*없/],
  scared: [/무서/, /무섭/, /겁\s*(나|났|이)/, /걱정/, /떨려/, /떨렸/, /깜깜/, /괴물/, /귀신/, /천둥/, /벌레가\s*와/, /도망/],
  shy: [/부끄/, /쑥스/, /창피/, /수줍/, /예쁘다/, /귀여워/, /귀엽다/, /멋있어/, /멋지다/, /잘생/],
  love: [/사랑/, /좋아해/, /좋아한다/, /고마워/, /고맙/, /감사/, /최고야/, /보고\s*싶었/, /안아/, /뽀뽀/, /친구\s*하자/],
  curious: [/왜/, /어떻게/, /뭐야/, /뭐예요/, /궁금/, /무엇/, /있을까/, /알아\?/, /어디/, /누구/, /\?$/, /신기/],
};

const PRIORITY: Exclude<EmotionCode, 'idle'>[] = ['calm', 'scared', 'comfort', 'surprised', 'love', 'shy', 'proud', 'happy', 'curious'];

function detectEmotion(text: string): EmotionCode {
  const scores: Record<string, number> = Object.fromEntries(PRIORITY.map((e) => [e, 0]));

  const negations = text.match(NEGATED_POSITIVE);
  if (negations) scores.comfort += negations.length * 2;
  const cleaned = text.replace(NEGATED_POSITIVE, ' ');

  for (const emotion of PRIORITY) {
    for (const pattern of LEXICON[emotion]) {
      if (pattern.test(cleaned)) scores[emotion] += 1;
    }
  }
  // "내가 ~했어" 형태의 자랑
  if (/(내가|나\s*혼자|나도)\s*.*(했어|했다|했지|했어요)/.test(cleaned)) scores.proud += 1;

  let best: EmotionCode = 'idle';
  let bestScore = 0;
  for (const emotion of PRIORITY) {
    if (scores[emotion] > bestScore) {
      best = emotion;
      bestScore = scores[emotion];
    }
  }
  return best;
}

/* ---------------- 주제어 찾기 ---------------- */

const TOPICS = [
  '할머니', '할아버지', '선생님', '어린이집', '유치원', '학교', '놀이터', '놀이공원', '아이스크림', '케이크', '눈사람',
  '자전거', '장난감', '강아지', '고양이', '비행기', '자동차', '친구', '엄마', '아빠', '동생', '오빠', '언니', '누나', '형',
  '공룡', '그림', '블록', '레고', '인형', '생일', '선물', '간식', '수영', '축구', '기차', '바다', '우주', '토끼', '로봇',
  '공주', '책', '꿈', '눈', '비',
];

function findTopic(text: string): string | null {
  for (const topic of TOPICS) {
    // 단어 시작에서만 매칭 ("인형" 안의 "형" 같은 오탐 방지)
    if (new RegExp(`(^|[\\s,.!?])${topic}`).test(text)) return topic;
  }
  return null;
}

/* ---------------- 대답 문장 ---------------- */

interface Bank {
  reactions: string[];
  topicReactions: string[];
  questions: string[];
}

const BANK: Record<EmotionCode, Bank> = {
  calm: {
    reactions: [
      '정말 화가 났구나, 화나는 마음이 드는 건 괜찮아요.',
      '그런 일이 있었으면 나도 속이 부글부글했을 거예요.',
      '마음속 화산이 펑 터질 것 같았겠어요.',
      '많이 억울하고 화가 났겠어요.',
    ],
    topicReactions: ['{T이/가} 그래서 많이 화가 났구나.', '{T} 때문에 마음이 부글부글했겠어요.'],
    questions: [
      '우리 같이 풍선 불듯 후~ 숨을 쉬어 볼까요, 숨 쉬고 나니 마음이 어때요?',
      '코로 꽃향기 맡고 촛불 끄듯 후~ 해 볼까요, 지금 마음은 얼마나 뜨거워요?',
      '같이 천천히 숨을 세 번 쉬어 봐요, 그다음엔 어떻게 하고 싶어요?',
      '후~ 하고 숨을 내쉬어 볼까요, 무엇 때문에 제일 화가 났어요?',
    ],
  },
  comfort: {
    reactions: [
      '그랬구나, 많이 속상했겠어요.',
      '슬픈 마음이 들 수 있어요, 내가 옆에 꼭 있을게요.',
      '말해 줘서 고마워요, 마음이 아팠겠어요.',
      '울고 싶을 땐 울어도 괜찮아요.',
    ],
    topicReactions: ['{T} 일 때문에 많이 속상했겠어요.', '{T} 이야기를 해 줘서 고마워요, 마음이 많이 아팠겠어요.'],
    questions: [
      '지금 마음은 어떤 색깔이에요?',
      '어떻게 해 주면 마음이 조금 나아질 것 같아요?',
      '그때 어떤 생각이 들었어요?',
      '누가 꼭 안아 주면 좋겠어요?',
    ],
  },
  proud: {
    reactions: [
      '우와, 정말 멋지게 해냈네요!',
      '끝까지 해낸 게 정말 대단해요!',
      '와, 너무 자랑스러워요!',
      '최고예요, 박수 짝짝짝!',
    ],
    topicReactions: ['{T}까지 해내다니 정말 멋져요!', '우와, {T} 이야기 들으니 너무 자랑스러워요!'],
    questions: [
      '해냈을 때 기분이 어땠어요?',
      '어떤 부분이 제일 어려웠어요?',
      '다음엔 또 무엇에 도전해 보고 싶어요?',
      '어떻게 그렇게 잘할 수 있었어요?',
    ],
  },
  happy: {
    reactions: [
      '와, 듣기만 해도 나까지 신나요!',
      '정말 즐거웠겠어요!',
      '좋은 일이 있었구나, 나도 기뻐요!',
      '히히, 행복한 마음이 전해져요!',
    ],
    topicReactions: ['{T} 이야기라니 정말 신나요!', '우와, {T이랑/랑} 함께라서 즐거웠겠어요!'],
    questions: [
      '어떤 순간이 제일 신났어요?',
      '그때 어떤 표정이었는지 알려 줄래요?',
      '다음에는 무엇을 하고 놀고 싶어요?',
      '그 기분을 색깔로 말하면 무슨 색이에요?',
    ],
  },
  surprised: {
    reactions: ['우와, 정말 깜짝 놀랐겠어요!', '어머나, 나도 깜짝 놀랐어요!', '세상에, 그런 일이 있었어요?', '우와, 정말 놀라운 이야기예요!'],
    topicReactions: ['우와, {T} 이야기에 나도 깜짝 놀랐어요!', '{T}에 그런 일이 있었다니 정말 놀라워요!'],
    questions: ['그때 어떤 기분이 들었어요?', '그다음에 어떻게 됐어요?', '제일 놀란 순간은 언제였어요?', '지금 마음은 어때요?'],
  },
  scared: {
    reactions: ['무서웠구나, 내가 옆에 있을게요.', '걱정되는 마음이 드는 건 괜찮아요.', '오들오들, 나도 조금 무서워요. 우리 같이 있어요.', '무서울 땐 꼭 안아 주고 싶어요.'],
    topicReactions: ['{T} 때문에 무서웠구나, 내가 옆에 있을게요.', '{T이/가} 무서웠구나, 이제 괜찮아요.'],
    questions: ['무서울 때 누가 옆에 있으면 좋겠어요?', '지금은 마음이 좀 괜찮아요?', '어른에게 같이 이야기해 볼까요?', '용기가 나는 주문을 같이 외쳐 볼까요?'],
  },
  shy: {
    reactions: ['헤헤, 그렇게 말해 주니 쑥스러워요.', '어머, 부끄러워서 얼굴이 빨개졌어요.', '히히, 칭찬 고마워요!', '쑥스럽지만 정말 기뻐요.'],
    topicReactions: ['{T} 이야기에 나 조금 쑥스러워요, 헤헤.', '{T} 칭찬 고마워요, 부끄러워요!'],
    questions: ['너는 언제 쑥스러워요?', '너도 정말 멋진 친구예요, 알고 있어요?', '우리 서로 칭찬 하나씩 해 볼까요?', '너의 멋진 점은 뭐예요?'],
  },
  love: {
    reactions: ['나도 네가 정말 좋아요!', '고마워요, 마음이 따뜻해졌어요.', '와, 그 말 들으니 너무 행복해요.', '나도 사랑해요, 우리는 단짝이에요!'],
    topicReactions: ['{T}도 정말 좋아하는구나!', '{T을/를} 좋아하는 마음이 예뻐요.'],
    questions: ['또 누구를 좋아해요?', '좋아하는 마음을 누구에게 전하고 싶어요?', '우리 같이 무엇을 하고 놀까요?', '오늘 고마운 사람은 누구예요?'],
  },
  curious: {
    reactions: [
      '오, 정말 궁금한 이야기예요!',
      '우와, 생각만 해도 신기해요.',
      '음, 나도 그게 궁금했어요!',
      '좋은 질문이에요!',
    ],
    topicReactions: ['{T은/는} 정말 신기한 게 많지요!', '오, {T} 이야기 정말 재미있어요!'],
    questions: [
      '너는 어떻게 생각해요?',
      '만약 네가 정할 수 있다면 어떻게 하고 싶어요?',
      '그게 왜 궁금해졌어요?',
      '우리 같이 상상해 볼까요, 어떤 모습일 것 같아요?',
    ],
  },
  idle: {
    reactions: ['그렇구나!', '와, 그런 일이 있었구나.', '이야기해 줘서 고마워요.', '음, 그랬구나.'],
    topicReactions: ['{T} 이야기구나!', '오, {T} 이야기 좋아요.', '{T} 이야기를 들려줘서 고마워요.'],
    questions: [
      '그때 기분은 어땠어요?',
      '그다음엔 어떻게 됐어요?',
      '그걸 하면서 어떤 생각이 들었어요?',
      '거기서 제일 기억에 남는 건 뭐예요?',
    ],
  },
};

// 화면 밖 진짜 놀이로 이어지고, 아이가 고를 수 있는 제안
const PLAY_SUGGESTIONS = [
  '우리 공룡처럼 쿵쿵 걸어 볼까요, 토끼처럼 깡충 뛰어 볼까요?',
  '주변에서 초록색을 찾아볼까요, 동그란 걸 찾아볼까요?',
  '옆 친구는 무슨 동물을 좋아하는지 물어봐 줄래요?',
  '우리 같이 이야기를 지어 볼까요, 나는 어디로 놀러 가면 좋을까요?',
  '오늘 마음은 해님 같아요, 구름 같아요?',
];

/* ---------------- 특수 상황 ---------------- */

interface Rule {
  test: RegExp;
  reply: (name: string) => GeminiReply;
}

const SAFETY = /(다쳤|피가|피\s*나|누가\s*때렸|맞았|모르는\s*사람|무서운\s*사람|아저씨가|위험)/;

const RULES: Rule[] = [
  {
    test: /이름/,
    reply: (name) => ({ emotion: 'happy', speech: `내 이름은 ${josa(name, '이에요/예요')}! 너는 내 이름이 마음에 들어요?` }),
  },
  {
    test: /몇\s*살/,
    reply: () => ({ emotion: 'curious', speech: '나는 네가 그려 준 날 태어난 아기 친구예요! 너는 몇 살이고, 몇 살이 되면 뭘 하고 싶어요?' }),
  },
  {
    test: /(사랑해|좋아해|보고\s*싶었)/,
    reply: () => ({ emotion: 'love', speech: '나도 너를 정말 정말 좋아해요! 너는 언제 내 생각이 났어요?' }),
  },
  {
    test: /(너는|넌|너\s).*(뭐|좋아|싫어|먹|해)/,
    reply: () => ({ emotion: 'happy', speech: '나는 너랑 이야기하는 게 제일 좋아요! 너는 뭘 할 때 제일 신나요?' }),
  },
  {
    test: /(고마워|고맙)/,
    reply: () => ({ emotion: 'love', speech: '나도 고마워요, 너랑 있으면 마음이 따뜻해져요! 오늘 또 고마웠던 일이 있었어요?' }),
  },
  {
    test: /(배고파|배고프|배가\s*고파)/,
    reply: () => ({ emotion: 'curious', speech: '배에서 꼬르륵 소리가 나는구나! 지금 제일 먹고 싶은 음식은 뭐예요?' }),
  },
  {
    test: /(졸려|졸리|잘\s*자|자야|잘게)/,
    reply: () => ({ emotion: 'idle', speech: '졸린 우리 친구, 오늘도 정말 수고했어요. 오늘 제일 좋았던 일은 뭐였어요?' }),
  },
  {
    test: /^(안녕|안뇽|하이|반가워)/,
    reply: () => ({ emotion: 'happy', speech: '안녕, 다시 만나서 너무 반가워요! 오늘은 어떤 하루였어요?' }),
  },
  {
    test: /(몰라|모르겠|글쎄)/,
    reply: () => ({ emotion: 'idle', speech: '괜찮아요, 몰라도 돼요. 천천히 생각해 보고 떠오르는 걸 말해 줄래요?' }),
  },
];

/* ---------------- 공개 API ---------------- */

/** 놀이 중에도 놀이보다 마음을 먼저 받아 줘야 하는 말인지 (안전 문제, 화남, 슬픔, 무서움) */
export function needsCare(text: string): boolean {
  const emotion = detectEmotion(text);
  return SAFETY.test(text) || emotion === 'calm' || emotion === 'comfort' || emotion === 'scared';
}

let idleStreak = 0;

export function offlineGreeting(): GeminiReply {
  return { emotion: 'happy', speech: `${FIRST_GREETING_LINE} 오늘 기분은 어때요?` };
}

export function offlineReply(input: string, characterName: string): GeminiReply {
  const text = input.trim();

  if (text.length < 2) {
    return { emotion: 'idle', speech: pick(['음, 조금 더 이야기해 줄래요?', '응응, 그래서 어떻게 됐어요?']) };
  }

  if (SAFETY.test(text)) {
    idleStreak = 0;
    return {
      emotion: 'comfort',
      speech: '많이 아프고 무서웠겠어요, 꼭 엄마 아빠나 선생님께 바로 이야기해요. 지금 마음은 좀 어때요?',
    };
  }

  const emotion = detectEmotion(text);

  // 감정이 뚜렷하지 않을 때만 특수 규칙 적용 (감정 코칭이 우선)
  if (emotion === 'idle' || emotion === 'curious' || emotion === 'happy') {
    for (const rule of RULES) {
      if (rule.test.test(text)) {
        idleStreak = 0;
        return rule.reply(characterName);
      }
    }
  }

  // 짧은 대답(응/아니)
  if (/^(응|어|네|맞아|그래|웅|아니|아니야|아니요|싫어요?)[.!~ ]*$/.test(text)) {
    return {
      emotion: 'idle',
      speech: pick(['그렇구나! 조금 더 자세히 이야기해 줄래요?', '알겠어요! 그럼 너는 어떻게 생각해요?']),
    };
  }

  if (emotion === 'idle') {
    idleStreak += 1;
    if (idleStreak >= 4) {
      idleStreak = 0;
      return { emotion: 'curious', speech: pick(PLAY_SUGGESTIONS) };
    }
  } else {
    idleStreak = 0;
  }

  const bank = BANK[emotion];
  const topic = findTopic(text);
  const reaction = topic && Math.random() < 0.6 ? pick(bank.topicReactions) : pick(bank.reactions);
  const question = pick(bank.questions);
  return { emotion, speech: `${fill(reaction, topic, characterName)} ${question}`.replace(/\s+/g, ' ').trim() };
}
