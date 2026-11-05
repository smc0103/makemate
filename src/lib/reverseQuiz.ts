import { josa } from './offline';
import { QUIZ_CARDS, matchesCard, traitValue, type QuizCard, type TraitKey } from './quiz';

/**
 * 내가 문제 내기: 아이가 동물이나 공룡을 떠올리고 친구가 질문해서 맞히는 놀이.
 * - 온라인 AI가 있으면 어떤 동물이든 맞히려고 시도한다.
 * - 없으면 박물관 카드 안에서 질문으로 후보를 좁혀 맞힌다.
 */

export const REVERSE_LIMIT = 10;
/** 못 맞혔을 때 아이가 "더 물어봐"를 고르면 늘어나는 질문 수 */
export const REVERSE_MORE = 5;

export type ChildAnswer = 'yes' | 'no' | 'unknown';

/** 아이의 말에서 네/아니요/몰라요를 읽는다. 알 수 없으면 null */
export function interpretAnswer(text: string, question = ''): ChildAnswer | null {
  const said = text.replace(/[\s.,!?~]/g, '');
  if (!said) return null;
  if (/모르|몰라|글쎄|헷갈/.test(said)) return 'unknown';
  // 크기 질문에 반대로 대답한 경우 ("몸이 커요?" → "작아요")
  if (/커요|큰\s|크기/.test(question) && /작아|작은|조그/.test(said) && !/^(네|응)/.test(said)) return 'no';
  if (/작아요|작은\s/.test(question) && /커요|커$|큰|크다/.test(said) && !/^(네|응)/.test(said)) return 'no';
  if (/^(아니|아뇨|아닌|아냐|안|없어|못|틀려|틀렸|땡|노$)/.test(said)) return 'no';
  if (/^(네|넹|넵|녜|예$|예요|응|웅|어$|어요|맞|그래|그렇|딩동|있어|먹어|살아|날아|커요|커$)/.test(said)) return 'yes';
  // 자세히 대답했을 때 ("털은 짧지만 있어요", "날개는 있는데 못 날아요"는 마지막 뜻을 따른다)
  const negative = /(안|못)[가-힣]|없어|없고|없는|없지|아니|아닌|아냐|비슷/;
  const positive = /(있어|있고|있는|있지|있다|있죠|커요|커서|작아|살아|먹어|날아|맞아|맞지|그래)/;
  const lastNeg = said.search(new RegExp(`${negative.source}(?!.*(${negative.source}))`));
  // "못 날아요" 속의 "날아"는 긍정이 아니다: 부정 표현을 같은 길이로 가린 뒤 찾는다
  const masked = said.replace(/(안|못)[가-힣]{1,3}/g, (m) => '#'.repeat(m.length));
  const lastPos = masked.search(new RegExp(`${positive.source}(?!.*(${positive.source}))`));
  if (lastNeg < 0 && lastPos < 0) return null;
  return lastNeg > lastPos ? 'no' : 'yes';
}

/** "아까 말했잖아요"처럼 이미 대답한 질문이라는 말인지 */
export function recallsEarlier(said: string): boolean {
  return /(아까|이미|벌써|전에)/.test(said.replace(/\s/g, '')) || /말했잖|했잖/.test(said.replace(/\s/g, ''));
}

/** 질문이 어떤 특징을 묻는지 (중복 질문을 막고 카드 질문으로 이어 갈 때 쓴다) */
const QUESTION_KEY_PATTERNS: Array<[TraitKey, RegExp]> = [
  ['dinosaur', /공룡/],
  ['pterosaur', /익룡/],
  ['insect', /곤충|벌레/],
  ['fish', /물고기/],
  ['bird', /^새(예요|에요|인가요)|[^가-힣]새(예요|에요)/],
  ['mammal', /젖/],
  ['wings', /날개/],
  ['fly', /날\s*수|날아|하늘을/],
  ['water', /물에|물속|바다|강에|헤엄|수영/],
  ['land', /땅에|땅에서|땅 위/],
  ['meat', /고기|잡아먹|사냥/],
  ['plants', /풀을|풀 먹|나뭇잎|열매/],
  ['extinct', /옛날|멸종|지금도/],
  ['fur', /털/],
  ['horn', /뿔/],
  ['tail', /꼬리/],
  ['teeth', /이빨/],
  ['longNose', /코가\s*(길|긴)/],
  ['longNeck', /목이\s*(길|긴)/],
  ['shell', /껍데기|껍질|등딱지/],
  ['big', /몸이\s*(아주\s*)?커|큰\s*(동물|몸|친구)|커요\?|크기가\s*커/],
];

export function questionKey(question: string): TraitKey | null {
  if (/^혹시/.test(question.trim())) return null;
  return QUESTION_KEY_PATTERNS.find(([, re]) => re.test(question))?.[0] ?? null;
}

/** "혹시 사자일까요?"에서 사자 */
export function guessName(question: string): string | null {
  return question.match(/혹시\s*(.+?)(이|가)?\s*(일까요|인가요|예요|이에요|맞아요|맞나요)/)?.[1]?.replace(/\s/g, '') ?? null;
}

/** 지금까지 알아낸 대답으로 카드 후보를 다시 만든다 (AI가 하던 질문을 카드 질문이 이어받을 때) */
export function localFromFacts(facts: Partial<Record<TraitKey, ChildAnswer>>, rejected: string[]): LocalReverse {
  let state = newLocalReverse();
  for (const [key, answer] of Object.entries(facts) as Array<[TraitKey, ChildAnswer]>) state = applyLocalAnswer(state, key, answer);
  for (const name of rejected) {
    state = { ...state, candidates: state.candidates.filter((c) => !matchesCard(c, name)) };
  }
  return state;
}

const QUESTIONS: Partial<Record<TraitKey, string>> = {
  dinosaur: '공룡이에요?',
  water: '물에 살아요?',
  fly: '하늘을 날 수 있어요?',
  fur: '털이 있어요?',
  extinct: '아주 옛날에 살았던 친구예요?',
  meat: '다른 동물을 잡아먹어요?',
  plants: '풀을 먹어요?',
  big: '몸이 아주 커요?',
  insect: '곤충이에요?',
  fish: '물고기예요?',
  bird: '새예요?',
  mammal: '새끼에게 젖을 먹여요?',
  wings: '날개가 있어요?',
  horn: '뿔이 있어요?',
  longNose: '코가 아주 길어요?',
  longNeck: '목이 아주 길어요?',
  shell: '단단한 껍데기가 있어요?',
  tail: '꼬리가 있어요?',
};

const QUESTION_KEYS = Object.keys(QUESTIONS) as TraitKey[];

export interface LocalReverse {
  candidates: QuizCard[];
  asked: TraitKey[];
}

export function newLocalReverse(): LocalReverse {
  return { candidates: [...QUIZ_CARDS], asked: [] };
}

export type LocalMove =
  | { kind: 'ask'; key: TraitKey; speech: string }
  | { kind: 'guess'; card: QuizCard; speech: string }
  | { kind: 'giveup' };

/** 후보를 가장 반으로 잘 나누는 질문을 고른다 */
export function nextLocalMove(state: LocalReverse, remaining: number): LocalMove {
  const { candidates, asked } = state;
  if (candidates.length === 0) return { kind: 'giveup' };

  const guess = (): LocalMove => {
    const card = candidates[Math.floor(Math.random() * candidates.length)];
    return { kind: 'guess', card, speech: `혹시 ${card.name}일까요?` };
  };
  if (candidates.length === 1 || remaining <= 1) return guess();
  if (remaining <= 3 && candidates.length <= 2) return guess();

  let bestKey: TraitKey | null = null;
  let bestScore = 0;
  for (const key of QUESTION_KEYS) {
    if (asked.includes(key)) continue;
    let yes = 0;
    let no = 0;
    for (const c of candidates) {
      const v = traitValue(c, key);
      if (v === true) yes += 1;
      else if (v === false) no += 1;
    }
    const score = Math.min(yes, no);
    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }
  if (!bestKey) return guess();
  return { kind: 'ask', key: bestKey, speech: QUESTIONS[bestKey] as string };
}

/** 질문의 답으로 후보를 좁힌다. 카드가 모르는 항목은 남겨 둔다. */
export function applyLocalAnswer(state: LocalReverse, key: TraitKey, answer: ChildAnswer): LocalReverse {
  const asked = [...state.asked, key];
  if (answer === 'unknown') return { ...state, asked };
  const wanted = answer === 'yes';
  return { asked, candidates: state.candidates.filter((c) => traitValue(c, key) !== !wanted) };
}

export function removeCandidate(state: LocalReverse, id: string): LocalReverse {
  return { ...state, candidates: state.candidates.filter((c) => c.id !== id) };
}

export interface ReverseQA {
  q: string;
  a: string;
}

export function reverseContext(remaining: number, qa: ReverseQA[] = []): string {
  const known = qa.length
    ? `\n[지금까지 물어본 것과 아이의 대답 — 이 질문들은 다시 하지 마]\n${qa.map((x) => `- ${x.q} → ${x.a}`).join('\n')}\n`
    : '';
  return `아이가 동물이나 공룡 하나를 마음속으로 떠올렸고, 네가 네/아니요 질문으로 맞히는 스무고개 놀이 중이야. 남은 기회는 ${remaining}번이야. 이 놀이 규칙이 아래의 다른 모든 규칙보다 우선해.${known}
- speech에는 질문 딱 한 문장만 써. 인사, 칭찬, 감탄, 놀이 제안, 그림 그리기나 다른 놀이 이야기, 다른 동물을 생각해 보라는 말은 절대 넣지 마.
- 네 또는 아니요로 답할 수 있는 질문만 해. "무슨 색", "어디", "왜" 같은 열린 질문은 하지 마.
- 자연스러운 해요체로 짧게 물어. 좋은 예: "털이 있어요?", "바다에 살아요?", "날개가 있어요?", "고기를 먹어요?", "몸이 커요?", "다리가 네 개예요?", "알을 낳아요?", "꼬리가 길어요?"
- 어색한 말은 쓰지 마. 나쁜 예: "큰 크기가 있어요?", "입이 크게 있어요?", "땅에 살아 있어요?", "다른 색이요?"
- 아이의 지금까지 대답을 모두 기억하고, 그 대답과 어긋나는 질문이나 이미 한 질문을 다시 하지 마. 이미 아니라고 한 동물은 다시 맞히지 마.
- 공룡인지, 물에 사는지, 날 수 있는지, 털이 있는지처럼 넓은 질문부터 시작해 점점 좁혀.
- 아이가 "잘 모르겠어요"라고 하면 그 질문은 넘어가고 다른 질문을 해.
- 짐작이 서면 "혹시 코끼리일까요?"처럼 맞혀 봐. 맞히는 말일 때 emotion은 "proud", 보통 질문일 때 emotion은 "curious"로 해.
${remaining <= 1 ? '- 지금이 마지막 기회야. 질문하지 말고 반드시 하나를 골라 "혹시 ~일까요?"로 맞혀.\n' : ''}- 아이가 속상하거나 화나 보일 때만 emotion을 "comfort"나 "calm"으로 하고 마음을 먼저 받아 줘.`;
}

/** AI가 놀이 규칙을 어겼을 때 한 번 더 부탁하는 말 */
export const REVERSE_RETRY_NOTE =
  '(규칙을 다시 지켜 줘: 다른 말 없이 네/아니요로 답할 수 있는 짧은 질문 한 문장만 말해. 예: "털이 있어요?")';

/** AI 대답이 놀이에 맞는 네/아니요 질문인지 (인사, 열린 질문, 놀이 제안이면 false) */
export function isYesNoQuestion(speech: string): boolean {
  const s = speech.trim();
  if (s.length > 30) return false;
  if (/고마워|안녕/.test(s)) return false;
  if (/(기분|왜|뭐|무엇|무슨|어떻게|어디|누구|어때|얼마나|몇)/.test(s)) return false;
  // 놀이를 바꾸자는 제안이나 다른 이야기 ("그림 그려볼까요?", "다른 동물 생각해 볼래?")
  if (/(볼까|볼래|할까|해\s*볼|하자|그려|그림|같이|함께|생각해|다른)/.test(s)) return false;
  // 어색한 말 ("큰 크기가 있어요?", "입이 크게 있어요?")
  if (/(크기가\s*있|크게\s*있|작게\s*있)/.test(s)) return false;
  // 반말 질문이나 낱말 하나 질문("다른 색이요?")은 받지 않는다
  if (!/[가-힣]{2,}\s*[가-힣]*요\s*[?？]\s*$/.test(s)) return false;
  return true;
}

/** 군말이 붙어도 첫 번째 네/아니요 질문만 쓴다. 없으면 null */
export function pickYesNoQuestion(speech: string): string | null {
  const sentences = speech.split(/(?<=[?？.!])\s+/);
  return sentences.find((s) => isYesNoQuestion(s.trim()))?.trim() ?? null;
}

/** AI 대답이 "맞히는 말"인지 */
export function isGuessSpeech(speech: string, emotion: string): boolean {
  return emotion === 'proud' || /혹시.*(일까요|인가요|예요|이에요|맞아요|맞나요)\s*[?？]?\s*$/.test(speech);
}

/** 못 맞힌 뒤 아이가 질문을 더 해 달라고 하는지 */
export function wantsMoreQuestions(said: string): boolean {
  const text = said.replace(/[\s.,!?~]/g, '');
  return /(더|계속|다시|또)(물어|질문|맞춰|맞혀|맞추|해)|물어봐|질문해|맞춰봐|맞혀봐|맞춰보|맞혀보|안알려|못알려|비밀/.test(text);
}

/** 정답을 알려 주겠다는 말인지 */
export function wantsToReveal(said: string): boolean {
  const text = said.replace(/\s/g, '');
  // "안 알려 줄래"는 알려 주겠다는 말이 아니다
  if (/(안|못)(알려|말해)/.test(text)) return false;
  return /(알려|정답|말해|포기|그만)/.test(text);
}

/**
 * 아이가 알려 준 정답에 대한 반응. 이름을 알아들을 수 없으면 null
 * (예: "너랑 관련되어 있어"처럼 이름이 아닌 말)
 */
export function revealReaction(said: string): string | null {
  const text = said.replace(/[\s.,!?~]/g, '');
  const card = QUIZ_CARDS.find((c) => matchesCard(c, text));
  const ending = (name: string) => josa(name, '이었구나/였구나');
  if (card) return `와, ${ending(card.name)}! ${card.fact} 왜 그 친구를 떠올렸어요?`;
  // 한 낱말로 답했을 때만 이름을 따라 말한다 ("내 강아지 몽이야"처럼 긴 말은 그대로 말하지 않는다)
  if (/\s/.test(said.trim()) || wantsMoreQuestions(said) || wantsToReveal(said)) return null;
  const noun = text.match(/^(.{1,8}?)(이었어요|였어요|이었어|였어|이에요|예요|이야|야|이요|요)?$/)?.[1];
  // 완성된 한글 낱말만 이름으로 본다 ("ㅇ"처럼 자음만 있으면 이름이 아니다)
  if (!noun || !/^[가-힣]{1,8}$/.test(noun) || /^(몰라|모르|비밀|안돼|싫어|아니|응|네)/.test(noun)) return null;
  return `와, ${ending(noun)}! 정말 멋진 문제였어요. 왜 그 친구를 떠올렸어요?`;
}
