import confetti from 'canvas-confetti';

type ConfettiFire = ReturnType<typeof confetti.create>;

const PASTEL = ['#FFB5C5', '#FFD6C2', '#FFEFA8', '#BDEBD7', '#BFE3FF', '#D9C8FF', '#FFFFFF'];

/**
 * 전용 캔버스에 붙는 파티클 엔진.
 * 표정은 그림과 영상으로 보여주므로, 파티클은 아이가 해낸 순간의 작은 축하에만 쓴다.
 */
export class ParticleEngine {
  private fire: ConfettiFire;

  constructor(canvas: HTMLCanvasElement) {
    this.fire = confetti.create(canvas, { resize: true, useWorker: false });
  }

  /** 미션 성공, 정답 같은 순간에 한 번 작게 터지는 축하 */
  celebrate(): void {
    void this.fire({
      particleCount: 36,
      spread: 80,
      startVelocity: 32,
      gravity: 0.9,
      ticks: 110,
      scalar: 0.9,
      origin: { x: 0.5, y: 0.8 },
      colors: PASTEL,
      disableForReducedMotion: true,
    });
  }

  reset(): void {
    this.fire.reset();
  }
}
