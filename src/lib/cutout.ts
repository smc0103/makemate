/**
 * 자연물 누끼(배경 오리기)
 * - 마법 가위: 구글 MediaPipe 'Magic Touch' 모델이 아이가 콕 누른 물건만 골라 낸다.
 *   처음 한 번 약 20MB(엔진 14MB + 모델 6MB)를 내려받고, 그다음부터는 기기에 저장된 것을 쓴다.
 *   사진은 기기 밖으로 나가지 않고 AI 할당량도 쓰지 않는다.
 * - 간단 가위: 인터넷이 없거나 마법 가위를 못 쓰는 기기에서는 색이 비슷한 곳을 이어 붙여 오린다.
 */
import type { InteractiveSegmenterLegacy } from '@mediapipe/tasks-vision';

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite';

/** 오릴 사진의 긴 변 (마스크도 같은 크기) */
export const WORK_SIDE = 768;

export interface CutMask {
  /** 0~1 물건일 확률 */
  data: Float32Array;
  width: number;
  height: number;
  /** 'magic' 마법 가위 / 'simple' 간단 가위 */
  method: 'magic' | 'simple';
}

let segmenter: Promise<InteractiveSegmenterLegacy> | null = null;

/** 마법 가위를 미리 준비한다. 실패하면 다음에 다시 시도할 수 있게 비운다 */
export function prepareMagicScissors(): Promise<InteractiveSegmenterLegacy> {
  if (!segmenter) {
    segmenter = (async () => {
      const { FilesetResolver, InteractiveSegmenterLegacy } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      return InteractiveSegmenterLegacy.createFromOptions(fileset, {
        // 태블릿마다 GPU 상태가 달라 CPU로 돌린다 (한 장에 1초 안팎)
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
    })();
    segmenter.catch(() => {
      segmenter = null;
    });
  }
  return segmenter;
}

/** 사진을 작업 크기로 줄여 캔버스에 그린다 (사진 방향 반영) */
export async function loadWorkCanvas(photo: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(photo, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(photo));
  const fit = Math.min(1, WORK_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * fit));
  canvas.height = Math.max(1, Math.round(bitmap.height * fit));
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

/** 콕 누른 곳(0~1 비율)의 물건을 찾는다. 마법 가위가 안 되면 간단 가위로 오린다 */
export async function findObjectAt(canvas: HTMLCanvasElement, x: number, y: number): Promise<CutMask> {
  try {
    const seg = await withTimeout(prepareMagicScissors(), 60_000);
    const result = seg.segment(canvas, { keypoint: { x, y } });
    const masks = result.confidenceMasks ?? [];
    const mask = masks[masks.length - 1];
    if (!mask) throw new Error('no mask');
    let data = Float32Array.from(mask.getAsFloat32Array());
    const { width, height } = mask;
    masks.forEach((m) => m.close());
    // 모델마다 물건/배경 순서가 달라서, 누른 곳이 물건 쪽이 되도록 맞춘다
    const at = data[Math.min(height - 1, Math.floor(y * height)) * width + Math.min(width - 1, Math.floor(x * width))];
    if (at < 0.5) data = data.map((v) => 1 - v);
    const resized = width === canvas.width && height === canvas.height ? data : resample(data, width, height, canvas.width, canvas.height);
    return { data: resized, width: canvas.width, height: canvas.height, method: 'magic' };
  } catch (err) {
    console.warn('[cutout] 마법 가위 대신 간단 가위를 써요', err);
    return { ...simpleCut(canvas, x, y), method: 'simple' };
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        window.clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        window.clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function resample(src: Float32Array, sw: number, sh: number, dw: number, dh: number): Float32Array {
  const out = new Float32Array(dw * dh);
  for (let y = 0; y < dh; y += 1) {
    const sy = Math.min(sh - 1, Math.floor(((y + 0.5) / dh) * sh));
    for (let x = 0; x < dw; x += 1) {
      out[y * dw + x] = src[sy * sw + Math.min(sw - 1, Math.floor(((x + 0.5) / dw) * sw))];
    }
  }
  return out;
}

/**
 * 간단 가위: 누른 곳 색과 비슷하고, 사진 가장자리(배경) 색과는 다른 곳을 이어 붙인다.
 * 단색 바닥(종이, 손바닥, 보도블록) 위에 올려 찍으면 꽤 잘 된다.
 */
export function simpleCut(canvas: HTMLCanvasElement, x: number, y: number): Omit<CutMask, 'method'> {
  const W = canvas.width;
  const H = canvas.height;
  const px = canvas.getContext('2d', { willReadFrequently: true })?.getImageData(0, 0, W, H).data;
  const data = new Float32Array(W * H);
  if (!px) return { data, width: W, height: H };

  const color = (i: number) => [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]];
  const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], (a[1] - b[1]) * 1.2, a[2] - b[2]);

  // 배경 색 후보: 가장자리 픽셀들을 몇 묶음으로 나눈다
  const border: number[][] = [];
  const step = Math.max(1, Math.floor((W + H) / 200));
  for (let i = 0; i < W; i += step) border.push(color(i), color((H - 1) * W + i));
  for (let j = 0; j < H; j += step) border.push(color(j * W), color(j * W + W - 1));
  const bgColors = cluster(border, 4);

  // 누른 곳 둘레 평균 색
  const sx = Math.min(W - 1, Math.max(0, Math.round(x * W)));
  const sy = Math.min(H - 1, Math.max(0, Math.round(y * H)));
  const seedSamples: number[][] = [];
  const r = Math.max(2, Math.round(Math.min(W, H) * 0.015));
  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      const xx = sx + dx;
      const yy = sy + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H) seedSamples.push(color(yy * W + xx));
    }
  }
  const fgColors = cluster(seedSamples, 2);

  // 물건 같은 픽셀: 배경 색보다 누른 곳 색에 가깝다
  const likely = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i += 1) {
    const c = color(i);
    const dBg = Math.min(...bgColors.map((b) => dist(c, b)));
    const dFg = Math.min(...fgColors.map((f) => dist(c, f)));
    likely[i] = dFg < dBg * 1.05 || dBg > 70 ? 1 : 0;
  }
  // 누른 곳과 이어진 부분만 남긴다
  const seed = likely[sy * W + sx] ? sy * W + sx : nearestOn(likely, W, H, sx, sy);
  if (seed < 0) return { data, width: W, height: H };
  const keep = floodFrom(likely, W, H, seed);
  for (let i = 0; i < W * H; i += 1) data[i] = keep[i];
  return { data, width: W, height: H };
}

function cluster(colors: number[][], k: number): number[][] {
  if (colors.length <= k) return colors;
  let centers = Array.from({ length: k }, (_, i) => colors[Math.floor((i / k) * colors.length)]);
  for (let iter = 0; iter < 6; iter += 1) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const c of colors) {
      let best = 0;
      let bestD = Infinity;
      centers.forEach((m, j) => {
        const d = (c[0] - m[0]) ** 2 + (c[1] - m[1]) ** 2 + (c[2] - m[2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      });
      sums[best][0] += c[0];
      sums[best][1] += c[1];
      sums[best][2] += c[2];
      sums[best][3] += 1;
    }
    centers = sums.map((s, j) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : centers[j]));
  }
  return centers;
}

function nearestOn(bin: Uint8Array, W: number, H: number, sx: number, sy: number): number {
  const maxR = Math.round(Math.min(W, H) * 0.08);
  for (let r = 1; r <= maxR; r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = sx + dx;
        const y = sy + dy;
        if (x >= 0 && y >= 0 && x < W && y < H && bin[y * W + x]) return y * W + x;
      }
    }
  }
  return -1;
}

/** start와 이어진 1 픽셀만 1로 표시한다 */
function floodFrom(bin: Uint8Array, W: number, H: number, start: number): Uint8Array {
  const out = new Uint8Array(W * H);
  const stack = [start];
  out[start] = 1;
  while (stack.length) {
    const i = stack.pop() as number;
    const x = i % W;
    const y = (i - x) / W;
    const next = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
    for (const n of next) {
      if (n >= 0 && bin[n] && !out[n]) {
        out[n] = 1;
        stack.push(n);
      }
    }
  }
  return out;
}

/**
 * 마스크를 깔끔하게 정리한다: 누른 곳과 이어진 덩어리만 남기고, 안쪽 구멍을 메운다.
 * 반환값은 0~1 알파 (가장자리는 부드럽게)
 */
export function cleanMask(mask: CutMask, x: number, y: number): Float32Array | null {
  const { data, width: W, height: H } = mask;
  const bin = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i += 1) bin[i] = data[i] >= 0.5 ? 1 : 0;
  const sx = Math.min(W - 1, Math.max(0, Math.round(x * W)));
  const sy = Math.min(H - 1, Math.max(0, Math.round(y * H)));
  const seed = bin[sy * W + sx] ? sy * W + sx : nearestOn(bin, W, H, sx, sy);
  if (seed < 0) return null;
  const keep = floodFrom(bin, W, H, seed);

  // 바깥에서 닿지 않는 빈 곳(구멍)은 메운다
  const outside = new Uint8Array(W * H);
  const inv = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i += 1) inv[i] = keep[i] ? 0 : 1;
  const stack: number[] = [];
  const push = (i: number) => {
    if (inv[i] && !outside[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let i = 0; i < W; i += 1) {
    push(i);
    push((H - 1) * W + i);
  }
  for (let j = 0; j < H; j += 1) {
    push(j * W);
    push(j * W + W - 1);
  }
  while (stack.length) {
    const i = stack.pop() as number;
    const px = i % W;
    const py = (i - px) / W;
    if (px > 0) push(i - 1);
    if (px < W - 1) push(i + 1);
    if (py > 0) push(i - W);
    if (py < H - 1) push(i + W);
  }

  let count = 0;
  const alpha = new Float32Array(W * H);
  for (let i = 0; i < W * H; i += 1) {
    if (keep[i] || !outside[i]) {
      // 덩어리 안쪽은 원래 확률로 가장자리를 부드럽게
      alpha[i] = keep[i] ? Math.min(1, Math.max(0, (data[i] - 0.35) / 0.3)) : 1;
      count += 1;
    }
  }
  if (count < W * H * 0.002) return null;
  return softenEdges(alpha, W, H);
}

/** 3x3 평균으로 가장자리 계단을 없앤다 */
function softenEdges(alpha: Float32Array, W: number, H: number): Float32Array {
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      let s = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          s += alpha[yy * W + xx];
          n += 1;
        }
      }
      out[y * W + x] = s / n;
    }
  }
  return out;
}

/** 붓으로 마스크를 고친다. 위치·반지름은 마스크 픽셀 단위 */
export function paintMask(alpha: Float32Array, W: number, H: number, cx: number, cy: number, radius: number, add: boolean) {
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(W - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(H - 1, Math.ceil(cy + radius));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const d2 = (x - cx) ** 2 + (y - cy) ** 2;
      if (d2 > r2) continue;
      // 붓 가장자리는 살짝 부드럽게
      const edge = Math.min(1, (radius - Math.sqrt(d2)) / 2 + 0.5);
      const i = y * W + x;
      alpha[i] = add ? Math.max(alpha[i], edge) : Math.min(alpha[i], 1 - edge);
    }
  }
}

const OUTLINE_KEY = 'maeum-friend:sticker-outline';

/** 스티커에 흰 테두리를 두를지 (기기에 기억해 둔다, 기본은 켬) */
export function getOutlinePref(): boolean {
  try {
    return localStorage.getItem(OUTLINE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setOutlinePref(on: boolean): void {
  try {
    localStorage.setItem(OUTLINE_KEY, on ? 'on' : 'off');
  } catch {
    /* noop */
  }
}

/**
 * 오려 낸 모양에서 사진 쪽 색을 남겨 스티커로 만든다.
 * outline이 켜져 있으면 흰 테두리와 그림자를 두르고, 꺼져 있으면 자연물 모양 그대로 둔다.
 */
export async function makeSticker(
  canvas: HTMLCanvasElement,
  alpha: Float32Array,
  outline = true,
): Promise<{ blob: Blob; width: number; height: number } | null> {
  const W = canvas.width;
  const H = canvas.height;
  let minX = W;
  let minY = H;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (alpha[y * W + x] > 0.1) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;

  // 1) 물건만 남긴 조각
  const src = canvas.getContext('2d', { willReadFrequently: true })?.getImageData(minX, minY, cw, ch);
  if (!src) return null;
  for (let y = 0; y < ch; y += 1) {
    for (let x = 0; x < cw; x += 1) {
      src.data[(y * cw + x) * 4 + 3] = Math.round(alpha[(y + minY) * W + x + minX] * 255);
    }
  }
  const piece = document.createElement('canvas');
  piece.width = cw;
  piece.height = ch;
  piece.getContext('2d')?.putImageData(src, 0, 0);

  // 2) 크기를 정리하고 테두리 자리를 만든다
  const fit = Math.min(1, 520 / Math.max(cw, ch));
  const pw = Math.max(1, Math.round(cw * fit));
  const ph = Math.max(1, Math.round(ch * fit));
  const border = outline ? Math.round(Math.max(pw, ph) * 0.016) + 3 : 0;
  const pad = outline ? border + 8 : 1;
  const out = document.createElement('canvas');
  out.width = pw + pad * 2;
  out.height = ph + pad * 2;
  const ctx = out.getContext('2d');
  if (!ctx) return null;

  if (!outline) {
    ctx.drawImage(piece, pad, pad, pw, ph);
    const plain = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
    return plain ? { blob: plain, width: out.width, height: out.height } : null;
  }

  // 흰 실루엣을 둥글게 퍼뜨려 테두리를 만든다
  const silhouette = document.createElement('canvas');
  silhouette.width = pw;
  silhouette.height = ph;
  const sctx = silhouette.getContext('2d');
  if (!sctx) return null;
  sctx.drawImage(piece, 0, 0, pw, ph);
  sctx.globalCompositeOperation = 'source-in';
  sctx.fillStyle = '#ffffff';
  sctx.fillRect(0, 0, pw, ph);

  const ring = document.createElement('canvas');
  ring.width = out.width;
  ring.height = out.height;
  const octx = ring.getContext('2d');
  if (!octx) return null;
  for (const radius of [border, border * 0.5]) {
    for (let i = 0; i < 24; i += 1) {
      const a = (i / 24) * Math.PI * 2;
      octx.drawImage(silhouette, pad + Math.cos(a) * radius, pad + Math.sin(a) * radius);
    }
  }
  octx.drawImage(silhouette, pad, pad);

  // 살짝 뜬 느낌의 그림자 + 흰 테두리 + 자연물
  ctx.shadowColor = 'rgba(92, 64, 51, 0.28)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;
  ctx.drawImage(ring, 0, 0);
  ctx.shadowColor = 'transparent';
  ctx.drawImage(piece, pad, pad, pw, ph);

  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
  return blob ? { blob, width: out.width, height: out.height } : null;
}
