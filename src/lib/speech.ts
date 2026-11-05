/* ================================================================
 * 음성 인식 (STT) — webkitSpeechRecognition
 * ================================================================ */

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: ((ev: Event) => void) | null;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null;
  onend: ((ev: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    webkitSpeechRecognition?: SpeechRecognitionCtor;
    SpeechRecognition?: SpeechRecognitionCtor;
  }
}

function getRecognitionCtor(): SpeechRecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.webkitSpeechRecognition ?? window.SpeechRecognition;
}

export function isSTTSupported(): boolean {
  return Boolean(getRecognitionCtor());
}

export interface RecognizerHandlers {
  onStart?: () => void;
  /** 말하는 도중의 임시 문장 */
  onInterim?: (text: string) => void;
  /** 확정된 문장 */
  onFinal: (text: string) => void;
  onError?: (error: string, message: string) => void;
  onEnd?: () => void;
}

export interface Recognizer {
  start: () => void;
  stop: () => void;
  abort: () => void;
}

const STT_ERROR_MESSAGES: Record<string, string> = {
  'no-speech': '목소리가 들리지 않았어요. 다시 말해 볼까요?',
  'audio-capture': '마이크를 찾을 수 없어요.',
  'not-allowed': '마이크 사용을 허락해 주세요.',
  'service-not-allowed': '마이크 사용을 허락해 주세요.',
  network: '인터넷 연결을 확인해 주세요.',
  aborted: '',
};

export function createRecognizer(handlers: RecognizerHandlers): Recognizer | null {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = 'ko-KR';
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let finalText = '';
  let running = false;

  recognition.onstart = () => {
    running = true;
    finalText = '';
    handlers.onStart?.();
  };

  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const transcript = result[0]?.transcript ?? '';
      if (result.isFinal) finalText += transcript;
      else interim += transcript;
    }
    handlers.onInterim?.((finalText + interim).trim());
  };

  recognition.onerror = (event) => {
    const message = STT_ERROR_MESSAGES[event.error] ?? '음성 인식 중 문제가 생겼어요.';
    handlers.onError?.(event.error, message);
  };

  recognition.onend = () => {
    running = false;
    const text = finalText.trim();
    finalText = '';
    if (text) handlers.onFinal(text);
    handlers.onEnd?.();
  };

  return {
    start: () => {
      if (running) return;
      try {
        recognition.start();
      } catch {
        /* 이미 시작된 경우 InvalidStateError — 무시 */
      }
    },
    stop: () => {
      try {
        recognition.stop();
      } catch {
        /* noop */
      }
    },
    abort: () => {
      try {
        recognition.abort();
      } catch {
        /* noop */
      }
    },
  };
}

/* ================================================================
 * 음성 합성 (TTS) — window.speechSynthesis
 * ================================================================ */

export const VOICE_STORAGE_KEY = 'maeum-friend:tts-voice';

export function isTTSSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

/** 브라우저가 보이스 목록을 비동기로 채우는 경우까지 기다린다 */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!isTTSSupported()) return Promise.resolve([]);
  const immediate = window.speechSynthesis.getVoices();
  if (immediate.length) return Promise.resolve(immediate);
  if (voicesPromise) return voicesPromise;

  const pending = new Promise<SpeechSynthesisVoice[]>((resolve) => {
    const done = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', done);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener('voiceschanged', done);
    window.setTimeout(done, 1500);
  }).then((voices) => {
    // 아직 목록이 비어 있으면 다음 호출에서 다시 기다린다
    if (!voices.length) voicesPromise = null;
    return voices;
  });
  voicesPromise = pending;
  return pending;
}

export function getKoreanVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith('ko'));
}

/** 다정하고 자연스러운 한국어 보이스 선호 순서 (여성/뉴럴 보이스 우선) */
const PREFERRED_VOICE_PATTERNS: RegExp[] = [
  /SunHi.*Natural/i,
  /SeoHyeon.*Natural/i,
  /JiMin.*Natural/i,
  /Natural/i,
  /Online/i,
  /Yuna/i,
  /Google\s*한국/i,
  /Google.*Korean/i,
  // 안드로이드(갤럭시탭) 크롬: 시스템 TTS 엔진의 한국어 음성
  /ko-kr-x-\w+-network/i,
  /ko-kr-x-\w+-local/i,
  /Samsung/i,
  /한국어/,
  /Heami/i,
  /SunHi/i,
  /Sora/i,
];

export function pickKoreanVoice(voices: SpeechSynthesisVoice[], preferredName?: string): SpeechSynthesisVoice | null {
  const korean = getKoreanVoices(voices);
  if (!korean.length) return null;

  // 친구마다 고른 음성
  if (preferredName) {
    const chosen = korean.find((v) => v.name === preferredName);
    if (chosen) return chosen;
  }

  let savedName = '';
  try {
    savedName = localStorage.getItem(VOICE_STORAGE_KEY) ?? '';
  } catch {
    /* noop */
  }
  if (savedName) {
    const saved = korean.find((v) => v.name === savedName);
    if (saved) return saved;
  }

  for (const pattern of PREFERRED_VOICE_PATTERNS) {
    const match = korean.find((v) => pattern.test(v.name));
    if (match) return match;
  }
  return korean[0];
}

/** 말하기 시작 전 이만큼 기다려도 소리가 안 나면 끝난 것으로 본다 */
const START_GRACE_MS = 2500;
const POLL_MS = 250;

interface ActiveSpeech {
  /** Chrome에서 utterance가 GC되면 onend가 호출되지 않는 버그 방지용 참조 */
  utterance: SpeechSynthesisUtterance | null;
  /** notify=false면 onEnd를 부르지 않고 조용히 정리 (새 문장으로 교체될 때) */
  finish: (notify: boolean) => void;
}

let active: ActiveSpeech | null = null;

export interface SpeakOptions {
  onStart?: () => void;
  onEnd?: () => void;
  rate?: number;
  pitch?: number;
  voiceName?: string;
}

export interface VoiceProfile {
  voiceName?: string;
  pitch: number;
  rate: number;
}

/** 지금 대화 중인 친구의 목소리. 따로 지정하지 않은 speak는 모두 이 목소리로 말한다 */
let profile: VoiceProfile | null = null;

export function setVoiceProfile(next: VoiceProfile | null): void {
  profile = next;
}

/**
 * 문장을 소리 내어 읽는다.
 * - 끝나거나 cancelSpeech로 멈추면 onEnd가 정확히 한 번 호출된다.
 * - 새 speak가 이전 문장을 대체하면 이전 문장의 onEnd는 호출되지 않는다.
 *   (늦게 도착한 이전 문장의 종료 신호가 새 문장 상태를 망가뜨리지 않게)
 */
export async function speak(text: string, options: SpeakOptions = {}): Promise<void> {
  active?.finish(false);

  let finished = false;
  let cleanup: () => void = () => undefined;
  const me: ActiveSpeech = {
    utterance: null,
    finish: (notify) => {
      if (finished) return;
      finished = true;
      cleanup();
      if (active === me) active = null;
      if (notify) options.onEnd?.();
    },
  };
  active = me;

  if (!isTTSSupported() || !text.trim()) {
    options.onStart?.();
    // 음성이 없으면 읽는 시간만큼 기다렸다가 종료
    const timer = window.setTimeout(() => me.finish(true), Math.min(6000, 600 + text.length * 90));
    cleanup = () => window.clearTimeout(timer);
    return;
  }

  const synth = window.speechSynthesis;
  synth.cancel();

  const voices = await loadVoices();
  if (finished) return; // 기다리는 사이 취소되었거나 다른 문장으로 교체됨
  const voice = pickKoreanVoice(voices, options.voiceName ?? profile?.voiceName);

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ko-KR';
  if (voice) utterance.voice = voice;
  // 기본은 높이 1.0, 아이가 알아듣기 쉽게 살짝 천천히. 친구 목소리를 골랐으면 그 값을 쓴다
  utterance.rate = options.rate ?? profile?.rate ?? 0.95;
  utterance.pitch = options.pitch ?? profile?.pitch ?? 1.0;
  utterance.volume = 1;
  me.utterance = utterance;

  let started = false;
  let resumeTimer: number | null = null;

  utterance.onstart = () => {
    started = true;
    options.onStart?.();
  };
  utterance.onend = () => me.finish(true);
  utterance.onerror = () => me.finish(true);

  const queuedAt = Date.now();
  synth.speak(utterance);

  // onend 이벤트를 보내지 않는 음성(일부 Natural/온라인 음성 등)이 있어
  // 엔진이 실제로 말하고 있는지 직접 확인해서 끝을 감지한다.
  const pollTimer = window.setInterval(() => {
    if (synth.speaking || synth.pending) {
      if (synth.speaking) started = true;
      return;
    }
    if (started || Date.now() - queuedAt > START_GRACE_MS) me.finish(true);
  }, POLL_MS);

  // Chrome의 Google 온라인 음성은 15초 이상 읽으면 멈추는 문제가 있어 주기적으로 resume
  // (다른 음성에서는 pause/resume이 오히려 멈춤을 일으키므로 Google 음성에만 적용)
  if (voice && /google/i.test(voice.name)) {
    resumeTimer = window.setInterval(() => {
      if (!synth.speaking) return;
      synth.pause();
      synth.resume();
    }, 10000);
  }

  // 최후의 안전장치
  const safetyTimer = window.setTimeout(() => me.finish(true), 8000 + text.length * 200);

  cleanup = () => {
    window.clearInterval(pollTimer);
    if (resumeTimer !== null) window.clearInterval(resumeTimer);
    window.clearTimeout(safetyTimer);
    utterance.onstart = null;
    utterance.onend = null;
    utterance.onerror = null;
  };
}

/** 지금 말하는 문장을 멈추고 onEnd를 호출한다 */
export function cancelSpeech(): void {
  const current = active;
  active = null;
  if (isTTSSupported()) window.speechSynthesis.cancel();
  current?.finish(true);
}
