import type { GeminiReply } from '../types';
import { GeminiError, generateReply, getApiKey, type ChatTurn } from './gemini';
import { getGroqKey, groqReply } from './groq';
import { offlineGreeting, offlineReply } from './offline';
import { isAbortError, isCooling, setCooldown } from './aiutil';

/**
 * 친구의 두뇌 선택
 * - cloud  : 온라인 AI (Groq·Gemini를 이어서 사용, API 키 필요)
 * - offline: 오프라인 친구 (키·인터넷 없음, 즉시 대답)
 * 온라인 AI는 하나가 막히면 다음 AI가 잇고, 모두 막혀야 오프라인 친구가 대답한다.
 */
export type EngineKind = 'cloud' | 'offline';
export type CloudProvider = 'groq' | 'gemini';

export const ENGINE_STORAGE_KEY = 'maeum-friend:engine';
export const PROVIDER_ORDER_STORAGE_KEY = 'maeum-friend:provider-first';

export function hasAnyCloudKey(): boolean {
  return Boolean(getApiKey() || getGroqKey());
}

export function getEngine(): EngineKind {
  try {
    const saved = localStorage.getItem(ENGINE_STORAGE_KEY);
    if (saved === 'gemini') return 'cloud'; // 이전 버전 설정 호환
    if (saved === 'cloud' || saved === 'offline') return saved;
    // 'local'(없앤 기기 속 AI)이나 처음 쓰는 기기는 키가 있는지로 정한다
  } catch {
    /* noop */
  }
  return hasAnyCloudKey() ? 'cloud' : 'offline';
}

export function setEngine(kind: EngineKind): void {
  try {
    localStorage.setItem(ENGINE_STORAGE_KEY, kind);
  } catch {
    /* noop */
  }
}

/** 먼저 물어볼 온라인 AI (기본: 더 빠른 Groq) */
export function getFirstProvider(): CloudProvider {
  try {
    return localStorage.getItem(PROVIDER_ORDER_STORAGE_KEY) === 'gemini' ? 'gemini' : 'groq';
  } catch {
    return 'groq';
  }
}

export function setFirstProvider(provider: CloudProvider): void {
  try {
    localStorage.setItem(PROVIDER_ORDER_STORAGE_KEY, provider);
  } catch {
    /* noop */
  }
}

export const ENGINE_LABEL: Record<EngineKind, string> = {
  cloud: '온라인 AI',
  offline: '오프라인 친구',
};

export const PROVIDER_LABEL: Record<CloudProvider, string> = {
  groq: 'Groq',
  gemini: 'Gemini',
};

export interface ThinkResult {
  reply: GeminiReply;
  /** 실제로 대답한 두뇌 */
  usedEngine: EngineKind;
  usedProvider?: CloudProvider;
  /** 대체 대답을 했다면 보호자에게 보여줄 이유 */
  fallbackNotice?: string;
}

const HANGUL = /[가-힣]/;
const HAN_OR_LATIN_HEAVY = /[一-鿿぀-ヿ]|[a-zA-Z]{6,}/;

/** 모델이 엉뚱한 언어/길이로 답하는 경우 걸러낸다 */
export function isUsable(reply: GeminiReply): boolean {
  return HANGUL.test(reply.speech) && !HAN_OR_LATIN_HEAVY.test(reply.speech) && reply.speech.length <= 160;
}

function lastUserText(history: ChatTurn[]): string {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].role === 'user') return history[i].text;
  }
  return '';
}

function problemLabel(err: unknown): string {
  if (!(err instanceof GeminiError)) return '오류';
  switch (err.code) {
    case 'invalid_key':
      return '키 오류';
    case 'rate_limit':
      return '사용량 제한';
    case 'timeout':
      return '응답 지연';
    case 'network':
      return '연결 끊김';
    default:
      return '오류';
  }
}

async function askCloud(
  characterName: string,
  history: ChatTurn[],
  signal: AbortSignal | undefined,
): Promise<{ reply: GeminiReply; provider: CloudProvider } | { problems: string[] }> {
  const first = getFirstProvider();
  const order: CloudProvider[] = first === 'groq' ? ['groq', 'gemini'] : ['gemini', 'groq'];
  const withKey = order.filter((p) => (p === 'groq' ? getGroqKey() : getApiKey()));
  if (withKey.length === 0) return { problems: ['API 키 없음'] };

  const problems: string[] = [];
  // 방금 응답이 너무 느렸던 서비스는 잠시 통째로 건너뛴다 (매 턴 기다리지 않게)
  const providers = withKey.filter((p) => {
    if (!isCooling(`provider:${p}`)) return true;
    problems.push(`${PROVIDER_LABEL[p]} 응답 지연`);
    return false;
  });

  for (const provider of providers) {
    try {
      const reply =
        provider === 'groq'
          ? await groqReply(characterName, history, { signal })
          : await generateReply(characterName, history, { signal });
      if (!isUsable(reply)) {
        problems.push(`${PROVIDER_LABEL[provider]} 이상한 대답`);
        continue;
      }
      return { reply, provider };
    } catch (err) {
      if (isAbortError(err)) throw err;
      if (err instanceof GeminiError && err.code === 'blocked') {
        return {
          reply: { emotion: 'curious', speech: '음, 우리 다른 재미있는 이야기를 해 볼까요? 요즘 제일 좋아하는 놀이는 뭐예요?' },
          provider,
        };
      }
      console.warn(`[brain] ${provider}`, err);
      if (err instanceof GeminiError && (err.code === 'timeout' || err.code === 'network')) {
        setCooldown(`provider:${provider}`, 30);
      }
      problems.push(`${PROVIDER_LABEL[provider]} ${problemLabel(err)}`);
    }
  }
  return { problems };
}

/**
 * 다음 대답을 만든다.
 * @param history 마지막 항목이 아이의 말(user)인 대화. 첫 인사일 때는 GREETING_TRIGGER 하나.
 * @param isGreeting 첫 만남 인사 여부
 */
export async function think(
  characterName: string,
  history: ChatTurn[],
  options: { signal?: AbortSignal; isGreeting?: boolean } = {},
): Promise<ThinkResult> {
  const engine = getEngine();
  const offline = (): GeminiReply =>
    options.isGreeting ? offlineGreeting() : offlineReply(lastUserText(history), characterName);

  if (engine === 'cloud') {
    const result = await askCloud(characterName, history, options.signal);
    if ('reply' in result) return { reply: result.reply, usedEngine: 'cloud', usedProvider: result.provider };
    return {
      reply: offline(),
      usedEngine: 'offline',
      fallbackNotice: `📖 ${result.problems.join(', ')} — 오프라인 친구가 대신 대답했어요`,
    };
  }

  // 오프라인 친구는 생각하는 척 살짝 뜸을 들인다
  await new Promise((resolve) => window.setTimeout(resolve, 450 + Math.random() * 400));
  if (options.signal?.aborted) throw new DOMException('aborted', 'AbortError');
  return { reply: offline(), usedEngine: 'offline' };
}
