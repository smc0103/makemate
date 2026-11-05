/**
 * 외부 파일 없이 Web Audio API 오실레이터만으로 합성하는 효과음 엔진.
 */

type AudioContextCtor = typeof AudioContext;

declare global {
  interface Window {
    webkitAudioContext?: AudioContextCtor;
  }
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.55;

    // 살짝 울리는 공간감 (짧은 피드백 딜레이)
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.18;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.22;
    const wet = ctx.createGain();
    wet.gain.value = 0.25;
    master.connect(ctx.destination);
    master.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** 사용자 제스처 안에서 한 번 호출해 두면 이후 소리가 바로 난다 */
export function unlockAudio(): void {
  getContext();
}

/** 실로폰 한 음: 기음 + 비화성 배음(실로폰 특유의 맑은 금속감) */
function xylophoneNote(freq: number, when: number, velocity = 1): void {
  const ac = getContext();
  if (!ac || !master) return;

  const partials: Array<{ ratio: number; gain: number; decay: number; type: OscillatorType }> = [
    { ratio: 1, gain: 0.5, decay: 1.1, type: 'sine' },
    { ratio: 3.932, gain: 0.16, decay: 0.35, type: 'sine' },
    { ratio: 9.538, gain: 0.05, decay: 0.12, type: 'sine' },
    { ratio: 2, gain: 0.08, decay: 0.6, type: 'triangle' },
  ];

  for (const p of partials) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = p.type;
    osc.frequency.setValueAtTime(freq * p.ratio, when);
    const peak = p.gain * velocity;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(peak, when + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + p.decay);
    osc.connect(gain);
    gain.connect(master);
    osc.start(when);
    osc.stop(when + p.decay + 0.05);
  }

  // 말렛이 닿는 순간의 짧은 '틱'
  const click = ac.createOscillator();
  const clickGain = ac.createGain();
  click.type = 'square';
  click.frequency.setValueAtTime(freq * 6, when);
  clickGain.gain.setValueAtTime(0.03 * velocity, when);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.02);
  click.connect(clickGain);
  clickGain.connect(master);
  click.start(when);
  click.stop(when + 0.03);
}

const noteFreq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

// C 메이저 펜타토닉 (C5 ~ E7) — 어떤 음을 눌러도 예쁘게 어울림
const PENTATONIC = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96, 98, 100];

// 터치마다 이어지는 동요풍 멜로디 (작은 별 변주, 펜타토닉 인덱스)
const MELODY = [0, 0, 3, 3, 4, 4, 3, 2, 2, 1, 1, 0, 3, 3, 2, 2, 1, 1, 0];
let melodyStep = 0;

/**
 * 화면 터치 실로폰 멜로디.
 * 이어지는 멜로디 음을 기본으로, 가로 위치에 따라 옥타브가 달라지고 위쪽 배음 장식음이 더해진다.
 * @param xRatio 0~1 사이 화면 가로 위치
 */
export function playTouchMelody(xRatio = 0.5): void {
  const ac = getContext();
  if (!ac) return;
  const now = ac.currentTime + 0.01;
  const octaveShift = xRatio > 0.66 ? 5 : xRatio < 0.33 ? 0 : 2;
  const idx = Math.min(PENTATONIC.length - 1, MELODY[melodyStep % MELODY.length] + octaveShift);
  melodyStep += 1;

  xylophoneNote(noteFreq(PENTATONIC[idx]), now, 1);
  // 반짝이는 꾸밈음 (3도 위, 작게)
  const grace = Math.min(PENTATONIC.length - 1, idx + 2);
  xylophoneNote(noteFreq(PENTATONIC[grace]), now + 0.07, 0.35);
}

/** 물방울 팝: 빠르게 올라가는 사인 스윕 */
export function playPop(): void {
  const ac = getContext();
  if (!ac || !master) return;
  const now = ac.currentTime + 0.005;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  const base = 380 + Math.random() * 160;
  osc.frequency.setValueAtTime(base, now);
  osc.frequency.exponentialRampToValueAtTime(base * 3.2, now + 0.08);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.45, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  osc.connect(gain);
  gain.connect(master);
  osc.start(now);
  osc.stop(now + 0.2);
}

/** 올라가는 아르페지오 — 기쁨/칭찬 반응 */
export function playSparkle(): void {
  const ac = getContext();
  if (!ac) return;
  const now = ac.currentTime + 0.01;
  [0, 2, 4, 5, 7].forEach((step, i) => {
    xylophoneNote(noteFreq(PENTATONIC[step]), now + i * 0.08, 0.7);
  });
}

/** 짜잔! 하고 올라가 길게 울리는 팡파르 — 뿌듯함 반응 */
export function playFanfare(): void {
  const ac = getContext();
  if (!ac) return;
  const now = ac.currentTime + 0.01;
  xylophoneNote(noteFreq(PENTATONIC[0]), now, 0.6);
  xylophoneNote(noteFreq(PENTATONIC[2]), now + 0.14, 0.6);
  // 마지막 음은 화음으로 크게
  [3, 5, 7].forEach((step) => xylophoneNote(noteFreq(PENTATONIC[step]), now + 0.32, 0.75));
}

/** 부드럽게 내려오는 음 — 위로 반응 */
export function playSoftChime(): void {
  const ac = getContext();
  if (!ac) return;
  const now = ac.currentTime + 0.01;
  [5, 4, 2, 0].forEach((step, i) => {
    xylophoneNote(noteFreq(PENTATONIC[step]), now + i * 0.22, 0.4);
  });
}

/** 마이크 켜짐/꺼짐 알림음 */
export function playMicCue(on: boolean): void {
  const ac = getContext();
  if (!ac) return;
  const now = ac.currentTime + 0.01;
  const notes = on ? [2, 5] : [5, 2];
  notes.forEach((step, i) => xylophoneNote(noteFreq(PENTATONIC[step]), now + i * 0.09, 0.45));
}
