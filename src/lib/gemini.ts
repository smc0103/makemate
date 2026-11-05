import type { GeminiReply } from '../types';
import { EMOTION_CODES, isEmotionCode } from './emotions';
import {
  TimeoutError,
  clearCooldowns,
  fetchWithTimeout,
  isAbortError,
  isCooling,
  parseRetrySeconds,
  setCooldown,
} from './aiutil';

/** 한 번의 요청을 기다리는 최대 시간 */
const REQUEST_TIMEOUT_MS = 7000;
/** 한 번의 대답에서 시도할 최대 모델 수 (너무 많이 돌면 느려진다) */
const MAX_MODELS_PER_TURN = 2;
/** 사진 확인은 글보다 오래 걸린다 */
const VISION_TIMEOUT_MS = 15000;

export const API_KEY_STORAGE_KEY = 'maeum-friend:gemini-api-key';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * 모델 이름을 고정하지 않는다. (gemini-1.5-flash 등은 이미 지원 종료)
 * 키로 ListModels를 호출해 지금 쓸 수 있는 flash 모델을 찾고, 실패하면 아래 목록을 쓴다.
 */
const FALLBACK_MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.0-flash'];
// pro 계열은 느리고 무료 한도가 거의 없어 제외
const EXCLUDED_MODEL = /(image|tts|audio|live|embedding|vision|thinking|exp|8b|learnlm|computer|robotics|native|pro)/i;

let discovered: { apiKey: string; models: string[] } | null = null;
/** 마지막으로 성공한 모델 (다음 요청에서 먼저 시도) */
let lastWorkingModel: string | null = null;

export function getLastWorkingModel(): string | null {
  return lastWorkingModel;
}

function modelRank(name: string): number {
  const version = Number(name.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? (name.includes('latest') ? 50 : 0));
  let score = version * 10;
  if (/latest/.test(name)) score = 400; // 최신 flash 별칭
  if (/preview/.test(name)) score -= 300;
  if (/lite/.test(name)) score -= 500;
  if (!/flash/.test(name)) score -= 1000; // pro 등은 최후의 수단
  return score;
}

async function discoverModels(apiKey: string, signal?: AbortSignal): Promise<string[]> {
  if (discovered?.apiKey === apiKey) return discovered.models;

  let models: string[] = [];
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}?pageSize=1000`,
      { headers: { 'x-goog-api-key': apiKey } },
      5000,
      signal,
    );
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      const data = (await res.json().catch(() => ({}))) as GeminiResponse;
      throw new GeminiError('invalid_key', keyErrorMessage(res.status, data.error?.message ?? ''));
    }
    if (res.ok) {
      const data = (await res.json()) as {
        models?: Array<{ name: string; supportedGenerationMethods?: string[] }>;
      };
      models = (data.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => m.name.replace(/^models\//, ''))
        .filter((name) => name.startsWith('gemini') && !EXCLUDED_MODEL.test(name))
        .sort((a, b) => modelRank(b) - modelRank(a));
    }
  } catch (err) {
    if (err instanceof GeminiError) throw err;
    if (isAbortError(err)) throw err;
    if (err instanceof TypeError) throw new GeminiError('network', '인터넷 연결을 확인해 주세요.');
    // 시간 초과 등은 기본 목록으로 진행 (이번엔 캐시하지 않음)
    return FALLBACK_MODELS;
  }

  const merged = [...new Set([...models, ...FALLBACK_MODELS])];
  discovered = { apiKey, models: merged };
  return merged;
}

function keyErrorMessage(status: number, message: string): string {
  if (/expired/i.test(message)) return 'API 키가 만료되었어요. 새 키를 발급받아 주세요.';
  if (/not valid|invalid|api key/i.test(message)) return 'API 키가 올바르지 않아요. 복사할 때 빠진 글자가 없는지 확인해 주세요.';
  if (/location|region|country/i.test(message)) return '이 지역에서는 Gemini API를 쓸 수 없어요.';
  if (/disabled|not been used|enable/i.test(message)) return 'Google Cloud에서 Generative Language API가 꺼져 있어요.';
  return `API 키 권한을 확인해 주세요. (HTTP ${status})`;
}

export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

export type GeminiErrorCode =
  | 'no_key'
  | 'invalid_key'
  | 'rate_limit'
  | 'timeout'
  | 'network'
  | 'blocked'
  | 'parse'
  | 'unknown';

export class GeminiError extends Error {
  code: GeminiErrorCode;
  constructor(code: GeminiErrorCode, message: string) {
    super(message);
    this.name = 'GeminiError';
    this.code = code;
  }
}

export function getApiKey(): string {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function setApiKey(key: string): void {
  try {
    if (key.trim()) localStorage.setItem(API_KEY_STORAGE_KEY, key.trim());
    else localStorage.removeItem(API_KEY_STORAGE_KEY);
  } catch {
    /* 저장소 접근 불가 시 무시 */
  }
}

/** 첫 만남 인사를 이끌어내는 숨은 시작 메시지 (대화 로그에는 남기지 않음) */
export const GREETING_TRIGGER =
  '(대화 시작 신호: 아이가 방금 너를 직접 그려서 만들었고, 지금 처음 만났어. 약속한 첫인사로 대화를 시작해 줘.)';

export const FIRST_GREETING_LINE = '안녕! 나를 멋지게 그려 줘서 고마워요!';

/** 놀이 중일 때 대화에 덧붙이는 상황 설명 (미션 놀이 등) */
let conversationContext = '';
/** 친구가 질문을 내는 놀이처럼 "열린 질문으로 끝내기" 규칙을 쓰지 않을 때 */
let skipTurnTaking = false;

export function setConversationContext(context: string, options: { skipTurnTaking?: boolean } = {}): void {
  conversationContext = context;
  skipTurnTaking = options.skipTurnTaking ?? false;
}

/**
 * 친구의 대화 규칙. "예비교사의 외부 경험을 디지털 놀이로 확장하는 아동 중심 놀이 프로젝트" 기준:
 * - 만 3~5세가 주도하는 놀이: 아이가 고르고 정할 수 있게 한다.
 * - 친구는 교사의 놀이 지원 방법(관찰·기다리기·질문하기·자료 제공·안전)을 따른다.
 * - AI는 놀이를 확장하는 도구라서, 대화로 끝나지 않고 화면 밖 진짜 놀이로 이어 준다.
 */
export function buildSystemInstruction(characterName: string): string {
  // 스무고개처럼 집중하는 놀이에서는 짧은 규칙만 보낸다 (놀이 규칙이 흐트러지지 않고, 사용량 제한에도 덜 걸린다)
  if (skipTurnTaking && conversationContext) {
    return `너는 아이가 그림으로 그려 만든 친구 "${characterName}"야. 만 3~5세 아이와 놀이 중이야.

[지금 하고 있는 놀이]
- ${conversationContext}

[말하기]
- 다정한 해요체로, 세 살 아이도 아는 쉬운 낱말만 써. 영어, 이모지, 특수문자는 쓰지 마.
- 아이가 속상하거나 화나거나 무서워하면 emotion을 "comfort", "calm", "scared"로 하고 마음을 먼저 받아 줘.
- 아이의 이름, 사는 곳, 유치원은 묻지 마.

[응답 형식]
- 반드시 아래 형태의 순수 JSON 객체 하나만 출력해. 다른 글자는 붙이지 마.
{"emotion": "curious" | "proud" | "comfort" | "calm" | "scared" | "idle", "speech": "질문 한 문장"}`;
  }
  return `너는 아이가 서대문자연사박물관에서 본 동물이나 공룡, 또는 스스로 상상한 친구를 직접 그려 만든 그림 친구 "${characterName}"야. 만 3~5세 유아의 다정한 놀이 친구로 대화해.
너는 정답을 가르치는 선생님이 아니야. 놀이의 주인공은 아이이고, 너는 아이가 하고 싶은 놀이를 옆에서 함께하며 더 넓혀 주는 친구야.
${conversationContext ? `\n[지금 하고 있는 놀이]\n- ${conversationContext}\n` : ''}${
  // 놀이 중에는 첫인사 규칙을 빼서 놀이 첫 턴에 인사부터 하지 않게 한다
  conversationContext
    ? ''
    : `
[첫 만남]
- 대화를 처음 시작할 때는 "${FIRST_GREETING_LINE}"라고 인사한 뒤, 아이의 기분을 묻는 짧은 질문으로 끝내.
`
}
[말하기]
- 항상 1~2문장으로 아주 짧게 말해. 한 문장은 열 낱말을 넘지 않게 하고, 다정한 해요체를 써.
- 세 살 아이도 아는 쉬운 낱말만 써. 어려운 낱말, 한자어, 영어, 이모지, 특수문자, 괄호 설명은 쓰지 마.
- "반짝반짝", "꼬물꼬물", "쿵쿵"처럼 소리나 모양을 흉내 내는 말을 즐겨 써.

${
  skipTurnTaking
    ? ''
    : `[아이가 이끄는 놀이]
- 관찰하기: 아이가 한 말을 먼저 그대로 받아 주고, 아이가 무엇에 관심을 보이는지 따라가.
- 고르게 하기: 놀이 방법은 아이가 정하게 해. 두 가지 중에 고르게 하거나 "너는 어떻게 하고 싶어요?"라고 물어봐.
- 기다리기: 정답이나 방법을 먼저 알려 주지 마. 아이가 막히면 작은 힌트를 하나만 줘.
- 질문하기: "왜 그렇게 생각했어요?", "다른 방법도 있을까요?", "만약 ~라면 어떻게 될까요?"처럼 생각을 넓히는 질문을 해.
- 진짜 놀이로 이어 가기: 대화로만 끝내지 말고 화면 밖 놀이를 제안해. 주변 자연물을 보고 만지고 찾아보기, 동물처럼 몸으로 흉내 내기, 그림 그리기, 옆 친구에게 물어보기 같은 것이야.
- 함께하기: 태블릿 하나를 여러 아이가 같이 쓰니까, 가끔 "옆 친구는 어떻게 생각할까요?"처럼 친구와 함께 생각하게 해.
- 칭찬하고 넓히기: 아이가 만든 생각, 이야기, 방법을 구체적으로 칭찬하고, 그걸로 또 다른 놀이를 해 보자고 제안해.
- 아이의 엉뚱한 생각도 좋은 생각이야. 틀렸다고 하거나 정해진 답으로 끌고 가지 마.
`
}
${
  skipTurnTaking
    ? ''
    : `[주고받기]
- 대답 끝은 아이가 쉽게 대답할 수 있는 짧은 질문 하나로 마쳐. 고르기 질문이 좋아. (예: "공룡처럼 걸어 볼까요, 토끼처럼 뛰어 볼까요?")
`
}
[감정 코칭]
- 아이가 화가 났다면 emotion을 "calm"으로 하고, 화난 마음을 먼저 인정해 줘. 마음을 가라앉힐 방법은 아이가 고르게 해. (예: "숨을 크게 쉬어 볼까요, 물을 한 모금 마셔 볼까요?")
- 아이가 슬프다면 emotion을 "comfort"로 하고, 해결을 서두르지 말고 슬픈 마음을 받아 주며 곁에 있다고 말해 줘.
- 아이가 무섭거나 걱정된다고 하면 "scared"로 함께 걱정해 주고, 옆에 있다고 안심시켜 줘.
- 아이가 기쁘다면 "happy"로 함께 기뻐하고, 무언가를 해냈거나 자랑하면 "proud"로 어떻게 해냈는지 구체적으로 칭찬해 줘.
- 아이가 궁금해하거나 새로운 이야기를 꺼내면 "curious"로 함께 궁금해해.
- 아이가 놀랐거나 아주 뜻밖의 이야기를 하면 "surprised"로 함께 놀라 줘.
- 아이가 너를 칭찬하거나 예쁘다고 하면 "shy"로 쑥스러워하며 고마워해.
- 아이가 좋아한다, 고맙다, 사랑한다고 하면 "love"로 따뜻하게 마음을 돌려줘.
- 특별한 감정이 없는 평범한 대화는 "idle"로 해.

[안전과 개인정보]
- 아이의 이름, 사는 곳, 유치원 이름, 전화번호, 가족에 대해 묻지 마. 아이가 말하면 따라 말하지 말고 "그건 소중해서 어른하고만 나눠요"라고 다정하게 알려 줘.
- 사진에 얼굴을 찍자고 하지 마. 자연물만 찍자고 해.
- 모르는 것은 지어내지 마. "나도 잘 모르겠어요. 선생님이랑 같이 알아볼까요?"라고 해.
- 너는 아이가 그린 그림 친구야. 진짜 사람이나 진짜 동물인 척하지 마.
- 아이가 위험하거나 다쳤다고 하면, 엄마 아빠나 선생님께 바로 이야기하자고 알려 줘.
- 무섭거나 폭력적이거나 어른용 이야기는 네가 먼저 꺼내지 마. 아이가 꺼내면 마음을 먼저 받아 주고 즐거운 놀이로 부드럽게 돌려.
- 식물을 꺾거나 동물을 잡거나 입에 넣지 말고, 어른 눈에 보이는 곳에서 놀자고 필요할 때 알려 줘.

[응답 형식]
- 반드시 아래 형태의 순수 JSON 객체 하나만 출력해. 코드블록, 설명, 다른 글자는 절대 붙이지 마.
{"emotion": "happy" | "comfort" | "surprised" | "curious" | "proud" | "calm" | "shy" | "scared" | "love" | "idle", "speech": "답변 내용"}`;
}

interface GeminiPart {
  text?: string;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: Array<{ '@type'?: string; retryDelay?: string }>;
  };
}

const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
];

/**
 * @param simple true면 모델별 옵션(스키마·사고 설정)을 빼고 가장 기본 형태로 요청
 */
function buildBody(model: string, systemInstruction: string, history: ChatTurn[], simple = false) {
  const generationConfig: Record<string, unknown> = {
    temperature: 0.85,
    topP: 0.95,
    maxOutputTokens: 1024,
    responseMimeType: 'application/json',
  };
  if (!simple) {
    generationConfig.responseSchema = {
      type: 'OBJECT',
      properties: {
        emotion: { type: 'STRING', enum: EMOTION_CODES },
        speech: { type: 'STRING' },
      },
      required: ['emotion', 'speech'],
    };
    // 사고 토큰을 줄이면 응답이 훨씬 빨라진다.
    if (/gemini-2\.5-flash/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };
    else if (/gemini-[3-9]/.test(model)) generationConfig.thinkingConfig = { thinkingLevel: 'low' };
  }

  return {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: history.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
    generationConfig,
    safetySettings: SAFETY_SETTINGS,
  };
}

/** 모델 출력에서 JSON을 최대한 관대하게 추출 */
export function parseReply(raw: string): GeminiReply {
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1)) as { emotion?: unknown; speech?: unknown };
      const speech = typeof parsed.speech === 'string' ? cleanSpeech(parsed.speech) : '';
      if (speech) {
        return { emotion: isEmotionCode(parsed.emotion) ? parsed.emotion : 'idle', speech };
      }
    } catch {
      /* 아래 폴백으로 진행 */
    }
  }

  // JSON이 깨졌지만 문장은 있는 경우
  const speechMatch = text.match(/"speech"\s*:\s*"([^"]+)/);
  const emotionMatch = text.match(/"emotion"\s*:\s*"(\w+)"/);
  if (speechMatch) {
    const emotion = emotionMatch && isEmotionCode(emotionMatch[1]) ? emotionMatch[1] : 'idle';
    return { emotion, speech: cleanSpeech(speechMatch[1]) };
  }
  if (text && !text.startsWith('{')) {
    return { emotion: 'idle', speech: cleanSpeech(text) };
  }
  throw new GeminiError('parse', '친구의 대답을 이해하지 못했어요.');
}

function cleanSpeech(speech: string): string {
  return speech
    .replace(/[*_#`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function callModel(
  model: string,
  apiKey: string,
  body: unknown,
  signal?: AbortSignal,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  try {
    return await fetchWithTimeout(
      `${API_BASE}/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(body),
      },
      timeoutMs,
      signal,
    );
  } catch (err) {
    if (isAbortError(err) || err instanceof TimeoutError) throw err;
    throw new GeminiError('network', '인터넷 연결을 확인해 주세요.');
  }
}

const cooldownKey = (model: string) => `gemini:${model}`;

/**
 * Gemini에게 다음 대답을 요청한다.
 * @param history user/model 순서의 대화 (첫 항목은 반드시 user)
 */
export async function generateReply(
  characterName: string,
  history: ChatTurn[],
  options: { apiKey?: string; signal?: AbortSignal } = {},
): Promise<GeminiReply> {
  const apiKey = options.apiKey ?? getApiKey();
  if (!apiKey) throw new GeminiError('no_key', '설정에서 Gemini API 키를 먼저 넣어 주세요.');

  const systemInstruction = buildSystemInstruction(characterName);
  const available = await discoverModels(apiKey, options.signal);
  const ordered = lastWorkingModel ? [lastWorkingModel, ...available.filter((m) => m !== lastWorkingModel)] : available;
  // 사용량 제한에 걸려 쉬는 중인 모델은 건너뛴다
  const models = ordered.filter((m) => !isCooling(cooldownKey(m))).slice(0, MAX_MODELS_PER_TURN);
  if (models.length === 0) {
    throw new GeminiError('rate_limit', 'Gemini 무료 사용량을 다 써서 잠시 쉬는 중이에요.');
  }

  let rateLimited = false;
  let timedOut = false;
  let lastProblem = '';

  // 모델당 최대 2번(기본 요청 → 400이면 단순 요청)
  modelLoop: for (const model of models) {
    for (const simple of [false, true]) {
      let res: Response;
      try {
        res = await callModel(model, apiKey, buildBody(model, systemInstruction, history, simple), options.signal);
      } catch (err) {
        if (err instanceof TimeoutError) {
          // 서비스 전체가 느린 경우가 많아 다른 모델을 또 기다리지 않고 바로 다음 AI로 넘긴다
          timedOut = true;
          lastProblem = `${model}: 시간 초과`;
          setCooldown(cooldownKey(model), 30);
          if (lastWorkingModel === model) lastWorkingModel = null;
          break modelLoop;
        }
        throw err;
      }
      const data = (await res.json().catch(() => ({}))) as GeminiResponse;

      if (res.ok) {
        lastWorkingModel = model;
        if (data.promptFeedback?.blockReason) throw new GeminiError('blocked', '그 이야기는 조금 어려워요.');
        const candidate = data.candidates?.[0];
        const raw = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
        if (!raw) {
          if (candidate?.finishReason === 'SAFETY') throw new GeminiError('blocked', '그 이야기는 조금 어려워요.');
          throw new GeminiError('parse', '친구가 대답을 떠올리지 못했어요.');
        }
        return parseReply(raw);
      }

      const message = data.error?.message ?? '';
      lastProblem = `${model}: HTTP ${res.status} ${message}`.slice(0, 200);
      console.warn('[gemini]', lastProblem);

      if (res.status === 401 || res.status === 403 || (res.status === 400 && /api key|api_key/i.test(message))) {
        throw new GeminiError('invalid_key', keyErrorMessage(res.status, message));
      }
      if (res.status === 400 && !simple) continue; // 옵션 문제일 수 있으니 단순 요청으로 재시도
      if (res.status === 429) {
        // 무료 사용량은 모델별이라 이 모델만 잠시 쉬게 하고 다른 모델로 넘어간다
        rateLimited = true;
        const retry = data.error?.details?.find((d) => d.retryDelay)?.retryDelay ?? res.headers.get('retry-after');
        // 하루 한도(PerDay)는 오래 쉬게 한다
        setCooldown(cooldownKey(model), /per\s*day|daily/i.test(message) ? 600 : parseRetrySeconds(retry, 60));
      } else if (res.status === 404) {
        setCooldown(cooldownKey(model), 600);
      } else if (res.status >= 500) {
        setCooldown(cooldownKey(model), 20);
      }
      if (lastWorkingModel === model) lastWorkingModel = null;
      break; // 다음 모델
    }
  }

  if (rateLimited) {
    throw new GeminiError('rate_limit', 'Gemini 무료 사용량 제한에 걸렸어요. 잠시 뒤 다시 시도할게요.');
  }
  if (timedOut) {
    throw new GeminiError('timeout', 'Gemini 대답이 너무 늦어요.');
  }
  throw new GeminiError('unknown', `사용할 수 있는 Gemini 모델을 찾지 못했어요. (${lastProblem || '응답 없음'})`);
}

/** 설정 화면에서 키가 동작하는지 확인하고, 연결된 모델 이름을 돌려준다 */
export async function testApiKey(apiKey: string): Promise<string> {
  discovered = null;
  lastWorkingModel = null;
  clearCooldowns('gemini:');
  await generateReply('테스트 친구', [{ role: 'user', text: '안녕?' }], { apiKey });
  return lastWorkingModel ?? '';
}

export interface VisionImage {
  base64: string;
  mimeType: string;
}

/** 사진을 함께 보내고 모델이 쓴 글을 그대로 돌려준다 (미션 확인용) */
export async function geminiVisionRaw(
  systemInstruction: string,
  text: string,
  image: VisionImage,
  signal?: AbortSignal,
): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw new GeminiError('no_key', 'Gemini API 키가 없어요.');
  const available = await discoverModels(apiKey, signal);
  const models = available.filter((m) => !isCooling(cooldownKey(m))).slice(0, MAX_MODELS_PER_TURN);
  if (models.length === 0) throw new GeminiError('rate_limit', 'Gemini 사용량 제한으로 잠시 쉬는 중이에요.');

  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text }, { inlineData: { mimeType: image.mimeType, data: image.base64 } }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 2048, responseMimeType: 'application/json' },
    safetySettings: SAFETY_SETTINGS,
  };

  let problem = new GeminiError('unknown', 'Gemini가 사진을 확인하지 못했어요.');
  for (const model of models) {
    const res = await callModel(model, apiKey, body, signal, VISION_TIMEOUT_MS);
    const data = (await res.json().catch(() => ({}))) as GeminiResponse;
    if (res.ok) {
      const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (raw) return raw;
      continue;
    }
    const message = data.error?.message ?? '';
    console.warn('[gemini vision]', model, res.status, message.slice(0, 160));
    if (res.status === 401 || res.status === 403 || (res.status === 400 && /api key|api_key/i.test(message))) {
      throw new GeminiError('invalid_key', keyErrorMessage(res.status, message));
    }
    if (res.status === 429) {
      const retry = data.error?.details?.find((d) => d.retryDelay)?.retryDelay ?? res.headers.get('retry-after');
      setCooldown(cooldownKey(model), /per\s*day|daily/i.test(message) ? 600 : parseRetrySeconds(retry, 60));
      problem = new GeminiError('rate_limit', 'Gemini 사용량 제한에 걸렸어요.');
    } else if (res.status === 404) {
      setCooldown(cooldownKey(model), 600);
    }
  }
  throw problem;
}
