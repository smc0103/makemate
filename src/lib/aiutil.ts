/**
 * 온라인 AI 공통 도구
 * - 요청 시간 제한: 오래 걸리면 기다리지 않고 다음 AI로 넘어간다.
 * - 쿨다운: 사용량 제한(429)에 걸린 모델은 잠시 건너뛰어 헛된 재시도를 없앤다.
 */

export class TimeoutError extends Error {
  constructor() {
    super('timeout');
    this.name = 'TimeoutError';
  }
}

/** 바깥 signal(화면 이탈)과 시간 제한을 함께 거는 fetch */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  outerSignal?: AbortSignal,
): Promise<Response> {
  if (outerSignal?.aborted) throw new DOMException('aborted', 'AbortError');
  const controller = new AbortController();
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onOuterAbort = () => controller.abort();
  outerSignal?.addEventListener('abort', onOuterAbort, { once: true });

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (timedOut) throw new TimeoutError();
    throw err;
  } finally {
    window.clearTimeout(timer);
    outerSignal?.removeEventListener('abort', onOuterAbort);
  }
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/* ---------------- 쿨다운 ---------------- */

const cooldownUntil = new Map<string, number>();

export function setCooldown(key: string, seconds: number): void {
  const clamped = Math.min(Math.max(seconds, 5), 600);
  cooldownUntil.set(key, Date.now() + clamped * 1000);
}

export function isCooling(key: string): boolean {
  const until = cooldownUntil.get(key);
  if (!until) return false;
  if (Date.now() >= until) {
    cooldownUntil.delete(key);
    return false;
  }
  return true;
}

export function clearCooldowns(prefix: string): void {
  for (const key of [...cooldownUntil.keys()]) {
    if (key.startsWith(prefix)) cooldownUntil.delete(key);
  }
}

/** "37s", "1.5s", 숫자 문자열 등에서 초 단위 대기 시간을 읽는다 */
export function parseRetrySeconds(value: string | null | undefined, fallback = 60): number {
  if (!value) return fallback;
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return fallback;
  if (/ms$/.test(value)) return n / 1000;
  if (/m$/.test(value) && !/ms$/.test(value)) return n * 60;
  return n;
}
