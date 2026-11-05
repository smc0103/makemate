import type { GeminiReply } from '../types';
import { GeminiError, buildSystemInstruction, parseReply, type ChatTurn, type VisionImage } from './gemini';
import {
  TimeoutError,
  clearCooldowns,
  fetchWithTimeout,
  isAbortError,
  isCooling,
  parseRetrySeconds,
  setCooldown,
} from './aiutil';

/**
 * Groq (OpenAI 호환 API) — 무료 키, 매우 빠른 응답.
 */

export const GROQ_KEY_STORAGE_KEY = 'maeum-friend:groq-api-key';

const API_BASE = 'https://api.groq.com/openai/v1';
// Groq는 보통 1초 안에 대답하므로 짧게 기다린다
const REQUEST_TIMEOUT_MS = 5000;
const MAX_MODELS_PER_TURN = 2;

/** 한국어가 자연스럽고 JSON 모드를 지원하는 순서 */
const PREFERRED_MODELS = [
  'llama-3.3-70b-versatile',
  'openai/gpt-oss-120b',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'openai/gpt-oss-20b',
  'llama-3.1-8b-instant',
];

export function getGroqKey(): string {
  try {
    return localStorage.getItem(GROQ_KEY_STORAGE_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function setGroqKey(key: string): void {
  try {
    if (key.trim()) localStorage.setItem(GROQ_KEY_STORAGE_KEY, key.trim());
    else localStorage.removeItem(GROQ_KEY_STORAGE_KEY);
  } catch {
    /* noop */
  }
}

let discovered: { apiKey: string; models: string[] } | null = null;
let lastWorkingModel: string | null = null;

const cooldownKey = (model: string) => `groq:${model}`;

function authHeaders(apiKey: string): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
}

async function discoverModels(apiKey: string, signal?: AbortSignal): Promise<string[]> {
  if (discovered?.apiKey === apiKey) return discovered.models;
  try {
    const res = await fetchWithTimeout(`${API_BASE}/models`, { headers: authHeaders(apiKey) }, 5000, signal);
    if (res.status === 401 || res.status === 403) {
      throw new GeminiError('invalid_key', 'Groq API 키가 올바르지 않아요. 복사할 때 빠진 글자가 없는지 확인해 주세요.');
    }
    if (res.ok) {
      const data = (await res.json()) as { data?: Array<{ id: string; active?: boolean }> };
      const ids = new Set((data.data ?? []).filter((m) => m.active !== false).map((m) => m.id));
      const models = PREFERRED_MODELS.filter((m) => ids.has(m));
      if (models.length) {
        discovered = { apiKey, models };
        return models;
      }
    }
  } catch (err) {
    if (err instanceof GeminiError || isAbortError(err)) throw err;
    if (err instanceof TypeError) throw new GeminiError('network', '인터넷 연결을 확인해 주세요.');
  }
  return PREFERRED_MODELS;
}

const KOREAN_NOTE = `

[중요]
- 반드시 자연스러운 한국어로만 말해. 영어, 한자, 다른 언어를 섞지 마.
- 출력은 {"emotion": "...", "speech": "..."} 형태의 JSON 객체 하나뿐이야.`;

function buildBody(model: string, characterName: string, history: ChatTurn[], simple: boolean) {
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: buildSystemInstruction(characterName) + KOREAN_NOTE },
      ...history.map((turn) => ({ role: turn.role === 'model' ? 'assistant' : 'user', content: turn.text })),
    ],
    temperature: 0.8,
    top_p: 0.95,
    max_completion_tokens: 400,
  };
  if (!simple) {
    body.response_format = { type: 'json_object' };
    // gpt-oss는 추론 모델이라 생각을 짧게 해야 빠르다
    if (model.startsWith('openai/gpt-oss')) body.reasoning_effort = 'low';
  }
  return body;
}

interface GroqResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string; code?: string; type?: string };
}

export async function groqReply(
  characterName: string,
  history: ChatTurn[],
  options: { apiKey?: string; signal?: AbortSignal } = {},
): Promise<GeminiReply> {
  const apiKey = options.apiKey ?? getGroqKey();
  if (!apiKey) throw new GeminiError('no_key', 'Groq API 키가 없어요.');

  const available = await discoverModels(apiKey, options.signal);
  const ordered = lastWorkingModel ? [lastWorkingModel, ...available.filter((m) => m !== lastWorkingModel)] : available;
  const models = ordered.filter((m) => !isCooling(cooldownKey(m))).slice(0, MAX_MODELS_PER_TURN);
  if (models.length === 0) throw new GeminiError('rate_limit', 'Groq 무료 사용량 제한으로 잠시 쉬는 중이에요.');

  let rateLimited = false;
  let timedOut = false;
  let lastProblem = '';

  modelLoop: for (const model of models) {
    for (const simple of [false, true]) {
      let res: Response;
      try {
        res = await fetchWithTimeout(
          `${API_BASE}/chat/completions`,
          { method: 'POST', headers: authHeaders(apiKey), body: JSON.stringify(buildBody(model, characterName, history, simple)) },
          REQUEST_TIMEOUT_MS,
          options.signal,
        );
      } catch (err) {
        if (err instanceof TimeoutError) {
          // 서비스 전체가 느린 경우가 많아, 같은 서비스의 다른 모델을 또 기다리지 않고 바로 다음 AI로 넘긴다
          timedOut = true;
          lastProblem = `${model}: 시간 초과`;
          setCooldown(cooldownKey(model), 30);
          if (lastWorkingModel === model) lastWorkingModel = null;
          break modelLoop;
        }
        if (isAbortError(err)) throw err;
        throw new GeminiError('network', '인터넷 연결을 확인해 주세요.');
      }

      const data = (await res.json().catch(() => ({}))) as GroqResponse;

      if (res.ok) {
        const raw = data.choices?.[0]?.message?.content ?? '';
        if (!raw) {
          lastProblem = `${model}: 빈 응답`;
          break;
        }
        lastWorkingModel = model;
        return parseReply(raw);
      }

      const message = data.error?.message ?? '';
      lastProblem = `${model}: HTTP ${res.status} ${message}`.slice(0, 200);
      console.warn('[groq]', lastProblem);

      if (res.status === 401 || res.status === 403) {
        throw new GeminiError('invalid_key', 'Groq API 키가 올바르지 않아요.');
      }
      // JSON 생성 실패(json_validate_failed) 등은 단순 요청으로 한 번 더
      if (res.status === 400 && !simple) continue;
      if (res.status === 429) {
        rateLimited = true;
        const retry = res.headers.get('retry-after');
        setCooldown(cooldownKey(model), /per day|tokens per day|TPD|RPD/i.test(message) ? 600 : parseRetrySeconds(retry, 30));
      } else if (res.status === 404) {
        setCooldown(cooldownKey(model), 600);
      } else if (res.status >= 500) {
        setCooldown(cooldownKey(model), 20);
      }
      if (lastWorkingModel === model) lastWorkingModel = null;
      break;
    }
  }

  if (rateLimited) throw new GeminiError('rate_limit', 'Groq 무료 사용량 제한에 걸렸어요.');
  if (timedOut) throw new GeminiError('timeout', 'Groq 대답이 너무 늦어요.');
  throw new GeminiError('unknown', `Groq에서 대답을 받지 못했어요. (${lastProblem || '응답 없음'})`);
}

/** 설정 화면 연결 확인. 성공한 모델 이름을 돌려준다 */
export async function testGroqKey(apiKey: string): Promise<string> {
  discovered = null;
  lastWorkingModel = null;
  clearCooldowns('groq:');
  await groqReply('테스트 친구', [{ role: 'user', text: '안녕?' }], { apiKey });
  return lastWorkingModel ?? '';
}

/** 사진을 볼 수 있는 Groq 모델 (없어진 모델은 404로 건너뛴다) */
const VISION_MODELS = ['qwen/qwen3.8-27b', 'meta-llama/llama-4-scout-17b-16e-instruct'];
const VISION_TIMEOUT_MS = 12000;

/** 사진을 함께 보내고 모델이 쓴 글을 그대로 돌려준다 (미션 확인용) */
export async function groqVisionRaw(
  systemInstruction: string,
  text: string,
  image: VisionImage,
  signal?: AbortSignal,
): Promise<string> {
  const apiKey = getGroqKey();
  if (!apiKey) throw new GeminiError('no_key', 'Groq API 키가 없어요.');
  const models = VISION_MODELS.filter((m) => !isCooling(cooldownKey(m)));
  if (models.length === 0) throw new GeminiError('rate_limit', 'Groq 사용량 제한으로 잠시 쉬는 중이에요.');

  let problem = new GeminiError('unknown', 'Groq가 사진을 확인하지 못했어요.');
  for (const model of models) {
    // 옵션을 지원하지 않는 모델(400)은 옵션 없이 한 번 더 시도
    for (const simple of [false, true]) {
      const body: Record<string, unknown> = {
        model,
        messages: [
          { role: 'system', content: systemInstruction },
          {
            role: 'user',
            content: [
              { type: 'text', text },
              { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.base64}` } },
            ],
          },
        ],
        temperature: 0.4,
        max_completion_tokens: 1024,
      };
      if (!simple) {
        body.response_format = { type: 'json_object' };
        body.reasoning_format = 'hidden';
      }
      const res = await fetchWithTimeout(
        `${API_BASE}/chat/completions`,
        { method: 'POST', headers: authHeaders(apiKey), body: JSON.stringify(body) },
        VISION_TIMEOUT_MS,
        signal,
      );
      const data = (await res.json().catch(() => ({}))) as GroqResponse;
      if (res.ok) {
        const raw = data.choices?.[0]?.message?.content ?? '';
        if (raw) return raw;
        break;
      }
      const message = data.error?.message ?? '';
      console.warn('[groq vision]', model, res.status, message.slice(0, 160));
      if (res.status === 401 || res.status === 403) {
        throw new GeminiError('invalid_key', 'Groq API 키가 올바르지 않아요.');
      }
      if (res.status === 400 && !simple) continue;
      if (res.status === 429) {
        setCooldown(cooldownKey(model), parseRetrySeconds(res.headers.get('retry-after'), 30));
        problem = new GeminiError('rate_limit', 'Groq 사용량 제한에 걸렸어요.');
      } else if (res.status === 404) {
        setCooldown(cooldownKey(model), 600);
      }
      break;
    }
  }
  throw problem;
}
