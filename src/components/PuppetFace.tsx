import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { EmotionVideoSlot, FaceMap, VideoSlot } from '../types';
import type { BaseMode, DualVideoHandle } from './DualVideoPlayer';
import { BLUSH, SymbolArt, TEARS, hasSideSymbol, type SymbolKind } from './EmotionSymbol';

/**
 * 영상 없이 그림을 직접 움직이는 얼굴.
 * 눈과 입 주변의 그림을 셰이더로 접고 늘려서 깜빡임과 말하기를 만들기 때문에,
 * 어떤 색과 화풍의 그림이든 그림 위에 무언가를 덧그리지 않고 움직인다.
 */

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uTex;
uniform vec2 uRes;      // 화면(px)
uniform vec2 uImg;      // 그림(px)
uniform vec2 uAnchor;   // 얼굴 중심이 놓일 화면 위치(px)
uniform vec2 uFocus;    // 그림에서 얼굴 중심(px)
uniform float uK;       // 그림 1px당 화면 px
uniform float uRot;
uniform vec2 uEyeA;
uniform vec2 uEyeB;
uniform float uHasB;
uniform float uEyeR;
uniform float uBlink;
uniform vec2 uMouth;
uniform float uMouthW;
uniform float uOpen;
uniform float uHasMouth;
uniform float uSmile;   // 1이면 입꼬리 올리기, -1이면 내리기
uniform float uWide;    // 눈 크게 뜨기
uniform float uWinkB;   // 두 번째 눈만 더 감기
uniform vec3 uBg;       // 그림 밖을 채우는 종이 색
uniform vec3 uInk;      // 감은 눈 선에 쓰는 그림의 가장 진한 색

// 눈을 돋보기처럼 키운다
vec2 widenEye(vec2 p, vec2 c) {
  vec2 rel = (p - c) / (uEyeR * 1.7);
  float amount = 0.32 * uWide * exp(-dot(rel, rel) * 1.3);
  return c + (p - c) * (1.0 - amount);
}

// 눈 위아래 그림을 가운데로 접어 눈을 감긴다
vec2 foldEye(vec2 p, vec2 c, float blink) {
  vec2 rel = p - c;
  float H = uEyeR * 1.45;
  float t = rel.y / H;
  float at = abs(t);
  if (at >= 1.0) return p;
  float wx = 1.0 - smoothstep(1.0, 1.35, abs(rel.x) / uEyeR);
  float g = mix(1.0, 0.18, blink);
  float m = mix(at, pow(max(at, 0.0001), g), wx);
  return vec2(p.x, c.y + sign(t) * m * H);
}

// 감은 눈: 아래로 살짝 휜 선 (0~1 진하기)
float closedEye(vec2 p, vec2 c) {
  vec2 rel = (p - c) / uEyeR;
  if (abs(rel.x) > 1.05) return 0.0;
  float curve = 0.28 * (1.0 - rel.x * rel.x);
  float thick = 0.09;
  return 1.0 - smoothstep(thick * 0.6, thick, abs(rel.y - curve));
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 d = (frag - uAnchor) / uK;
  float cs = cos(uRot);
  float sn = sin(uRot);
  vec2 p = uFocus + vec2(cs * d.x + sn * d.y, -sn * d.x + cs * d.y);

  // 입: 아이가 그린 입과 주변을 위아래로 늘리고 턱을 내린다. 새로 그리는 것은 없다.
  vec2 src = p;
  if (uHasMouth > 0.5 && (uOpen > 0.001 || abs(uSmile) > 0.001)) {
    vec2 n = (p - uMouth) / uMouthW;
    // 입을 중심으로 부드럽게 줄어드는 영향 범위
    float around = exp(-(n.x * n.x * 1.05 + n.y * n.y * 1.5));
    src.y = uMouth.y + (p.y - uMouth.y) * (1.0 - 0.42 * uOpen * around);
    // 입을 벌리면 양옆이 살짝 좁아진다
    src.x = uMouth.x + (p.x - uMouth.x) * (1.0 + 0.14 * uOpen * around);
    // 턱이 내려간다: 입 아래쪽일수록 많이 움직이고 턱 밑에서 사라진다
    vec2 j = (p - (uMouth + vec2(0.0, uMouthW * 0.45))) / uMouthW;
    float jaw = exp(-(j.x * j.x * 0.9 + j.y * j.y * 1.1));
    src.y -= uOpen * uMouthW * 0.15 * jaw;
    // 입꼬리: 가운데는 그대로 두고 양 끝만 올리거나 내려 그린 입 선을 휘게 한다
    float bend = n.x * n.x * exp(-(n.x * n.x * 0.55 + n.y * n.y * 1.5));
    src.y += uSmile * uMouthW * 0.32 * bend;
  }

  if (uWide > 0.001) {
    src = widenEye(src, uEyeA);
    if (uHasB > 0.5) src = widenEye(src, uEyeB);
  }
  src = foldEye(src, uEyeA, uBlink);
  if (uHasB > 0.5) src = foldEye(src, uEyeB, max(uBlink, uWinkB));

  vec2 uv = src / uImg;
  vec4 color = texture2D(uTex, clamp(uv, 0.0, 1.0));
  // 그림 밖은 종이 색으로 부드럽게 이어 준다
  vec2 edge = smoothstep(vec2(0.0), vec2(0.03), uv) * (1.0 - smoothstep(vec2(0.97), vec2(1.0), uv));
  color.rgb = mix(uBg, color.rgb, edge.x * edge.y);

  // 거의 감았을 때 또렷한 선을 그려 눈을 감은 모습으로 보이게 한다
  float lid = smoothstep(0.55, 0.95, uBlink);
  if (lid > 0.0) {
    float line = closedEye(p, uEyeA);
    if (uHasB > 0.5) line = max(line, closedEye(p, uEyeB));
    color.rgb = mix(color.rgb, uInk, line * lid);
  }

  gl_FragColor = vec4(color.rgb, 1.0);
}
`;

interface EmotionMotion {
  duration: number;
  /** t: 0~1. 값은 기울기(rad), 좌우·위아래(화면 짧은 변 비율), 크기, 눈 감김, 입꼬리, 눈 크기, 찡긋, 입 벌림 */
  at: (
    t: number,
    sec: number,
  ) => { rot?: number; x?: number; y?: number; scale?: number; lid?: number; smile?: number; wide?: number; wink?: number; open?: number };
}

/** 표정이 천천히 나타나 잠시 머물다 사라지는 정도 (0~1) */
function hold(t: number, fade = 0.2): number {
  const up = Math.min(1, t / fade);
  const down = Math.min(1, (1 - t) / fade);
  return Math.min(up, down) * Math.min(up, down) * (3 - 2 * Math.min(up, down));
}

/** 0~1 구간을 두 번 통통 튀는 모양 (끝 30%는 가만히) */
function hops(t: number, count: number): number {
  if (t >= 0.7) return 0;
  return Math.abs(Math.sin((t / 0.7) * Math.PI * count));
}

/**
 * 감정 몸짓. 그림이 늘어나 보이지 않도록 몸 전체(위치·기울기·크기)를 크게 움직이고,
 * 눈·입 변형은 살짝만 쓴다. 감정은 머리 옆 그림책 기호가 함께 알려 준다.
 */
const MOTIONS: Record<string, EmotionMotion> = {
  // 신나요: 빠르게 통통통 세 번 뛰며 좌우로 들썩이고 눈웃음 (가볍고 빠른 움직임)
  happy: {
    duration: 2.2,
    at: (t, s) => ({
      y: -0.065 * hops(t, 3),
      rot: 0.04 * Math.sin(s * 14) * (t < 0.7 ? 1 : 0) * hold(t, 0.1),
      scale: 0.02 * hold(t),
      smile: hold(t),
      lid: 0.35 * hold(t),
    }),
  },
  // 슬퍼요: 몸이 아래로 축 처지며 작아진다
  comfort: {
    duration: 3.4,
    at: (t, s) => ({
      y: 0.04 * hold(t),
      scale: -0.06 * hold(t),
      rot: (-0.035 + 0.01 * Math.sin(s * 1.5)) * hold(t),
      smile: -1.2 * hold(t),
      lid: 0.45 * hold(t),
    }),
  },
  // 놀라요: 움찔 물러났다가 눈이 커진다
  surprised: {
    duration: 2.2,
    at: (t, s) => {
      const e = hold(t, 0.06);
      const jolt = t < 0.25 ? Math.sin(s * 40) * 0.012 * (1 - t / 0.25) : 0;
      return { x: jolt, y: -0.03 * e, scale: 0.07 * e, wide: e, open: 0.6 * e };
    },
  },
  // 궁금해요: 고개를 이쪽저쪽 갸웃갸웃
  curious: {
    duration: 2.8,
    at: (t) => {
      const tilt = Math.sin(t * Math.PI * 3) * hold(t, 0.15);
      return { rot: 0.14 * tilt, x: 0.015 * tilt, wink: 0.4 * hold(t), smile: 0.2 * hold(t) };
    },
  },
  // 뿌듯해요: 뛰지 않고 천천히 가슴을 펴며 크고 높아진 뒤, 고개를 한 번씩 으쓱 (느리고 당당한 움직임)
  proud: {
    duration: 3,
    at: (t) => {
      const puff = hold(t, 0.3);
      // 커진 뒤 왼쪽, 오른쪽으로 천천히 한 번씩 으쓱
      const shrug = t > 0.3 && t < 0.85 ? Math.sin(((t - 0.3) / 0.55) * Math.PI * 2) : 0;
      return {
        scale: 0.11 * puff,
        y: -0.04 * puff,
        rot: 0.06 * shrug,
        x: 0.01 * shrug,
        smile: 0.6 * puff,
        // 흐뭇하게 눈을 반쯤 감는다
        lid: 0.5 * puff,
      };
    },
  },
  // 차분해요: 눈을 감고 크게 숨 쉰다
  calm: {
    duration: 4.5,
    at: (t) => ({ scale: 0.07 * Math.sin(Math.PI * t), lid: 0.9 * hold(t, 0.12), smile: 0.2 * hold(t) }),
  },
  // 부끄러워요: 살짝 돌아서며 몸을 배배 꼰다
  shy: {
    duration: 3,
    at: (t, s) => ({
      x: -0.025 * hold(t),
      rot: (-0.07 + 0.03 * Math.sin(s * 4)) * hold(t),
      scale: -0.03 * hold(t),
      y: 0.012 * hold(t),
      lid: 0.3 * hold(t),
      smile: 0.5 * hold(t),
    }),
  },
  // 무서워요: 작아지며 오들오들 떤다
  scared: {
    duration: 2.8,
    at: (t, s) => ({ x: 0.008 * Math.sin(s * 45) * hold(t), scale: -0.06 * hold(t), y: 0.02 * hold(t), wide: 0.6 * hold(t), smile: -0.5 * hold(t) }),
  },
  // 좋아해요: 좌우로 살랑살랑 흔들며 웃는다
  love: {
    duration: 3,
    at: (t, s) => ({
      rot: 0.08 * Math.sin(s * 4) * hold(t),
      y: -0.02 * Math.abs(Math.sin(s * 4)) * hold(t),
      scale: 0.03 * hold(t),
      smile: hold(t),
      lid: 0.35 * hold(t),
    }),
  },

};

interface PuppetFaceProps {
  posterUrl: string | null;
  face: FaceMap;
  mode: BaseMode;
  /** 넣어 둔 감정 영상. 있으면 그림 움직임 대신 위에 겹쳐 한 번 재생한다 */
  videos?: Partial<Record<VideoSlot, string>>;
  /** 그림을 피해 놓을 위·아래 여백(CSS px) */
  insets?: { top: number; bottom: number };
  /** 입이 가려지지 않게 비워 둘 아래쪽 높이(CSS px). 말풍선·마이크 자리 */
  mouthGuard?: number;
}

const PLAY_INSETS = { top: 0, bottom: 0 };

/**
 * 사진에서 종이 여백을 뺀, 실제로 그린 부분의 범위(그림 픽셀).
 * 연필 선처럼 주변과 밝기·색이 확 달라지는 곳(윤곽)을 찾는다. 사진 조명 때문에 생긴
 * 부드러운 그림자나 얼룩은 윤곽이 아니라서 무시된다. 눈과 입은 항상 범위 안에 들어가게 한다.
 */
function contentBox(source: HTMLCanvasElement, map: FaceMap): { x0: number; y0: number; x1: number; y1: number } {
  const full = { x0: 0, y0: 0, x1: source.width, y1: source.height };
  const S = 200;
  const sw = Math.max(8, Math.round((S * source.width) / Math.max(source.width, source.height)));
  const sh = Math.max(8, Math.round((S * source.height) / Math.max(source.width, source.height)));
  const c = document.createElement('canvas');
  c.width = sw;
  c.height = sh;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return full;
  ctx.drawImage(source, 0, 0, sw, sh);
  const d = ctx.getImageData(0, 0, sw, sh).data;
  const lum = new Float32Array(sw * sh);
  const sat = new Float32Array(sw * sh);
  for (let i = 0; i < sw * sh; i += 1) {
    const r = d[i * 4];
    const g = d[i * 4 + 1];
    const b = d[i * 4 + 2];
    lum[i] = r * 0.3 + g * 0.59 + b * 0.11;
    sat[i] = Math.max(r, g, b) - Math.min(r, g, b);
  }
  // 사진 가장자리(종이 끝, 책상)는 빼고 본다
  const m = Math.max(1, Math.round(Math.min(sw, sh) * 0.03));
  const edge = new Float32Array(sw * sh);
  const values: number[] = [];
  for (let y = m; y < sh - m; y += 1) {
    for (let x = m; x < sw - m; x += 1) {
      const i = y * sw + x;
      const e =
        Math.abs(lum[i + 1] - lum[i - 1]) +
        Math.abs(lum[i + sw] - lum[i - sw]) +
        0.5 * (Math.abs(sat[i + 1] - sat[i - 1]) + Math.abs(sat[i + sw] - sat[i - sw]));
      edge[i] = e;
      values.push(e);
    }
  }
  if (!values.length) return full;
  values.sort((p, q) => p - q);
  const threshold = Math.max(8, values[Math.floor(values.length / 2)] * 3, values[Math.floor(values.length * 0.9)] * 0.8);
  const rows = new Array<number>(sh).fill(0);
  const cols = new Array<number>(sw).fill(0);
  let total = 0;
  for (let y = 0; y < sh; y += 1) {
    for (let x = 0; x < sw; x += 1) {
      if (edge[y * sw + x] > threshold) {
        rows[y] += 1;
        cols[x] += 1;
        total += 1;
      }
    }
  }
  if (total < 20) return full;
  // 양쪽 끝의 아주 적은 잡티(0.5%)는 버린다
  const range = (arr: number[]) => {
    const limit = total * 0.005;
    let a = 0;
    for (let acc = 0; a < arr.length - 1; a += 1) {
      acc += arr[a];
      if (acc > limit) break;
    }
    let b = arr.length - 1;
    for (let acc = 0; b > 0; b -= 1) {
      acc += arr[b];
      if (acc > limit) break;
    }
    return [a, b + 1];
  };
  const [cx0, cx1] = range(cols);
  const [cy0, cy1] = range(rows);
  const pad = Math.max(sw, sh) * 0.05;
  let x0 = Math.max(0, cx0 - pad) / sw;
  let x1 = Math.min(sw, cx1 + pad) / sw;
  let y0 = Math.max(0, cy0 - pad) / sh;
  let y1 = Math.min(sh, cy1 + pad) / sh;
  // 눈·입은 꼭 들어가게
  for (const p of [map.leftEye, map.rightEye, map.mouth]) {
    if (!p) continue;
    x0 = Math.min(x0, Math.max(0, p.x - 0.1));
    x1 = Math.max(x1, Math.min(1, p.x + 0.1));
    y0 = Math.min(y0, Math.max(0, p.y - 0.1));
    y1 = Math.max(y1, Math.min(1, p.y + 0.1));
  }
  // 너무 작게 잡히면(인식 실패) 사진 전체를 쓴다
  if ((x1 - x0) * (y1 - y0) < 0.08) return full;
  return { x0: x0 * source.width, y0: y0 * source.height, x1: x1 * source.width, y1: y1 * source.height };
}

const MAX_TEXTURE_SIDE = 1536;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader');
  return shader;
}

const PuppetFace = forwardRef<DualVideoHandle, PuppetFaceProps>(function PuppetFace({ posterUrl, face, mode, videos, insets = PLAY_INSETS, mouthGuard = 0 }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLVideoElement>(null);
  const videosRef = useRef(videos);
  videosRef.current = videos;
  const live = useRef({ mode, face, insets, emotion: null as EmotionMotion | null, emotionAt: 0, forceBlink: 0, nextBlink: 0 });
  live.current.mode = mode;
  live.current.face = face;
  live.current.insets = insets;
  const guardRef = useRef(mouthGuard);
  guardRef.current = mouthGuard;

  // 머리 옆 그림책 기호, 볼 터치, 눈물 (그림이 움직이면 같이 따라간다)
  const [sym, setSym] = useState<{ kind: SymbolKind; id: number } | null>(null);
  const symLive = useRef<SymbolKind | null>(null);
  const symTimer = useRef(0);
  const symRef = useRef<HTMLDivElement>(null);
  const blushRefs = useRef<Array<HTMLDivElement | null>>([]);
  const tearRefs = useRef<Array<HTMLDivElement | null>>([]);
  useEffect(() => () => window.clearTimeout(symTimer.current), []);

  useImperativeHandle(
    ref,
    () => ({
      playEmotion: (slot: EmotionVideoSlot) => {
        const url = videosRef.current?.[slot];
        const overlay = overlayRef.current;
        if (url && overlay) {
          overlay.src = url;
          overlay.style.opacity = '1';
          void overlay.play().catch(() => {
            overlay.style.opacity = '0';
          });
          return true;
        }
        const motion = MOTIONS[slot];
        if (!motion) return false;
        live.current.emotion = motion;
        live.current.emotionAt = performance.now();
        symLive.current = slot;
        setSym({ kind: slot, id: Date.now() });
        window.clearTimeout(symTimer.current);
        symTimer.current = window.setTimeout(() => {
          symLive.current = null;
          setSym(null);
        }, 2700);
        return true;
      },
    }),
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !posterUrl) return;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
    // WebGL을 쓸 수 없는 기기에서는 뒤에 깔린 그림만 보인다
    if (!gl) return;

    let raf = 0;
    let disposed = false;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const u = (name: string) => gl.getUniformLocation(program, name);
    const uni = {
      res: u('uRes'), img: u('uImg'), anchor: u('uAnchor'), focus: u('uFocus'), k: u('uK'), rot: u('uRot'),
      bg: u('uBg'), ink: u('uInk'),
      eyeA: u('uEyeA'), eyeB: u('uEyeB'), hasB: u('uHasB'), eyeR: u('uEyeR'), blink: u('uBlink'),
      mouth: u('uMouth'), mouthW: u('uMouthW'), open: u('uOpen'), hasMouth: u('uHasMouth'), smile: u('uSmile'), wide: u('uWide'), winkB: u('uWinkB'),
    };

    const image = new Image();
    image.onload = () => {
      if (disposed) return;
      // 사진 방향을 반영하고 큰 사진은 줄여서 올린다
      const fit = Math.min(1, MAX_TEXTURE_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
      const w = Math.max(1, Math.round(image.naturalWidth * fit));
      const h = Math.max(1, Math.round(image.naturalHeight * fit));
      const scratch = document.createElement('canvas');
      scratch.width = w;
      scratch.height = h;
      scratch.getContext('2d')?.drawImage(image, 0, 0, w, h);

      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, scratch);

      // 그림에서 종이 색(가장자리 중앙값)과 가장 진한 색을 뽑는다
      const sample = document.createElement('canvas');
      sample.width = 64;
      sample.height = 64;
      const sctx = sample.getContext('2d', { willReadFrequently: true });
      sctx?.drawImage(scratch, 0, 0, 64, 64);
      const px = sctx?.getImageData(0, 0, 64, 64).data;
      const lum = (i: number, d: Uint8ClampedArray) => d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
      let content = { x0: 0, y0: 0, x1: w, y1: h };
      if (px) {
        const border: number[][] = [];
        const all: Array<{ l: number; c: number[] }> = [];
        for (let y = 0; y < 64; y += 1) {
          for (let x = 0; x < 64; x += 1) {
            const i = (y * 64 + x) * 4;
            const c = [px[i], px[i + 1], px[i + 2]];
            all.push({ l: lum(i, px), c });
            if (x < 3 || y < 3 || x > 60 || y > 60) border.push(c);
          }
        }
        const median = (k: number) => border.map((c) => c[k]).sort((p, q) => p - q)[Math.floor(border.length / 2)] / 255;
        gl.uniform3f(uni.bg, median(0), median(1), median(2));
        content = contentBox(scratch, live.current.face);
        const dark = all.sort((p, q) => p.l - q.l).slice(0, Math.max(1, Math.floor(all.length * 0.02)));
        const mean = (k: number) => dark.reduce((s, d) => s + d.c[k], 0) / dark.length / 255;
        gl.uniform3f(uni.ink, mean(0) * 0.8, mean(1) * 0.8, mean(2) * 0.8);
      }

      const state = { open: 0, openTarget: 0, nextSyllable: 0, blinkStart: -10000, blinkTwice: false };
      const start = performance.now();

      const frame = (now: number) => {
        if (disposed) return;
        raf = requestAnimationFrame(frame);
        const l = live.current;
        const { face: map } = l;
        const sec = (now - start) / 1000;

        // 태블릿 성능을 위해 해상도를 제한한다
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const vw = Math.max(1, Math.round(canvas.clientWidth * dpr));
        const vh = Math.max(1, Math.round(canvas.clientHeight * dpr));
        if (canvas.width !== vw || canvas.height !== vh) {
          canvas.width = vw;
          canvas.height = vh;
          gl.viewport(0, 0, vw, vh);
        }

        // 눈 깜빡임
        if (now >= l.nextBlink) {
          state.blinkStart = now;
          state.blinkTwice = Math.random() < 0.2;
          l.nextBlink = now + 2400 + Math.random() * 3200;
        }
        const BLINK_MS = 170;
        const sinceBlink = now - state.blinkStart;
        let blink = 0;
        if (sinceBlink < BLINK_MS) blink = Math.sin((sinceBlink / BLINK_MS) * Math.PI);
        else if (state.blinkTwice && sinceBlink > BLINK_MS + 90 && sinceBlink < BLINK_MS * 2 + 90) {
          blink = Math.sin(((sinceBlink - BLINK_MS - 90) / BLINK_MS) * Math.PI);
        }

        // 말하기: 음절처럼 입을 여닫는다
        if (l.mode === 'talking') {
          if (now >= state.nextSyllable) {
            state.openTarget = Math.random() < 0.18 ? 0.08 : 0.4 + Math.random() * 0.6;
            state.nextSyllable = now + 85 + Math.random() * 80;
          }
        } else {
          state.openTarget = 0;
        }
        state.open += (state.openTarget - state.open) * 0.38;
        if (state.open < 0.005) state.open = 0;

        // 가만히 있어도 숨 쉬듯 움직인다
        let rot = Math.sin(sec * 0.7) * 0.012;
        let xShift = 0;
        let yShift = Math.sin(sec * 1.5) * 0.005;
        let scale = Math.sin(sec * 1.5) * 0.006;
        if (l.mode === 'talking') {
          rot += Math.sin(sec * 3.1) * 0.012;
          yShift += Math.sin(sec * 6.3) * 0.004;
          // 입이 없는 친구는 음절에 맞춰 머리를 끄덕이고 살짝 커졌다 작아진다
          if (!map.mouth) {
            yShift += state.open * 0.012;
            scale += state.open * 0.016;
          }
        }

        let lid = 0;
        let smile = 0;
        let wide = 0;
        let wink = 0;
        let forcedOpen = 0;
        if (l.emotion) {
          const t = (now - l.emotionAt) / 1000 / l.emotion.duration;
          if (t >= 1) {
            l.emotion = null;
          } else {
            const m = l.emotion.at(t, (now - l.emotionAt) / 1000);
            rot += m.rot ?? 0;
            xShift += m.x ?? 0;
            yShift += m.y ?? 0;
            scale += m.scale ?? 0;
            lid = m.lid ?? 0;
            smile = m.smile ?? 0;
            wide = m.wide ?? 0;
            wink = m.wink ?? 0;
            forcedOpen = m.open ?? 0;
          }
        }

        const side = Math.max(w, h);
        const a = { x: map.leftEye.x * w, y: map.leftEye.y * h };
        const b = map.rightEye ? { x: map.rightEye.x * w, y: map.rightEye.y * h } : null;
        const mouth = map.mouth ? { x: map.mouth.x * w, y: map.mouth.y * h } : null;
        const points = [a, ...(b ? [b] : []), ...(mouth ? [mouth] : [])];
        const fx = points.reduce((s, p) => s + p.x, 0) / points.length;
        const fy = points.reduce((s, p) => s + p.y, 0) / points.length;

        // 종이 여백을 뺀 그림 전체를 원래 비율 그대로 화면에 꽉 차게 놓는다
        const cssScale = vh / Math.max(1, canvas.clientHeight);
        const topSafe = Math.min(l.insets.top * cssScale, vh * 0.15);
        const bottomSafe = Math.min(l.insets.bottom * cssScale, vh * 0.3);
        const freeH = Math.max(1, vh - topSafe - bottomSafe);
        const cw = Math.max(1, content.x1 - content.x0);
        const ch = Math.max(1, content.y1 - content.y0);
        const k = Math.min(vw / cw, freeH / ch);
        const anchorX = vw * 0.5 + (fx - (content.x0 + content.x1) / 2) * k + xShift * Math.min(vw, vh);
        let anchorY = topSafe + freeH / 2 + (fy - (content.y0 + content.y1) / 2) * k;
        // 입이 말풍선·마이크에 가려지면 그만큼만 위로 올린다 (최대 화면의 15%)
        if (mouth && guardRef.current > 0) {
          const mouthBottom = anchorY + (mouth.y + map.mouthSize * side * 0.6 - fy) * k;
          const limit = vh - guardRef.current * cssScale;
          if (mouthBottom > limit) anchorY -= Math.min(mouthBottom - limit, vh * 0.15);
        }
        anchorY += yShift * Math.min(vw, vh);

        gl.uniform2f(uni.res, vw, vh);
        gl.uniform2f(uni.img, w, h);
        gl.uniform2f(uni.anchor, anchorX, anchorY);
        gl.uniform2f(uni.focus, fx, fy);
        gl.uniform1f(uni.k, k * (1 + scale));
        gl.uniform1f(uni.rot, rot);
        gl.uniform2f(uni.eyeA, a.x, a.y);
        gl.uniform2f(uni.eyeB, b?.x ?? 0, b?.y ?? 0);
        gl.uniform1f(uni.hasB, b ? 1 : 0);
        gl.uniform1f(uni.eyeR, map.eyeSize * side);
        gl.uniform1f(uni.blink, Math.max(blink, lid));
        gl.uniform2f(uni.mouth, mouth?.x ?? 0, mouth?.y ?? 0);
        gl.uniform1f(uni.hasMouth, mouth ? 1 : 0);
        gl.uniform1f(uni.mouthW, map.mouthSize * side);
        gl.uniform1f(uni.open, Math.max(state.open, forcedOpen));
        gl.uniform1f(uni.smile, smile);
        gl.uniform1f(uni.wide, wide);
        gl.uniform1f(uni.winkB, wink);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // 기호·볼 터치·눈물을 지금 그림 위치에 맞춘다 (그림 px → 화면 CSS px)
        const kind = symLive.current;
        const cssPer = canvas.clientWidth / vw;
        const K = k * (1 + scale);
        const cs = Math.cos(rot);
        const sn = Math.sin(rot);
        const toCss = (px: number, py: number) => {
          const dx = px - fx;
          const dy = py - fy;
          return { x: (anchorX + (cs * dx - sn * dy) * K) * cssPer, y: (anchorY + (sn * dx + cs * dy) * K) * cssPer };
        };
        const eyeR = map.eyeSize * side;
        const eyes = b ? [a, b] : [a];
        const place = (el: HTMLElement | null | undefined, show: boolean, x = 0, y = 0, width = 0, height = 0) => {
          if (!el) return;
          el.style.display = show ? 'block' : 'none';
          if (!show) return;
          el.style.left = `${x}px`;
          el.style.top = `${y}px`;
          el.style.width = `${width}px`;
          el.style.height = `${height}px`;
        };
        if (kind && hasSideSymbol(kind)) {
          const size = Math.min(170, Math.max(72, eyeR * K * cssPer * 5.5));
          const head = toCss(Math.max(...eyes.map((e) => e.x)) + eyeR * 3.4, Math.min(...eyes.map((e) => e.y)) - eyeR * 4.2);
          const cw2 = canvas.clientWidth;
          const ch2 = canvas.clientHeight;
          place(
            symRef.current,
            true,
            Math.min(cw2 - size / 2 - 8, Math.max(size / 2 + 8, head.x)),
            Math.min(ch2 - size / 2 - 8, Math.max(size / 2 + 72, head.y)),
            size,
            size,
          );
        } else {
          place(symRef.current, false);
        }
        for (let i = 0; i < 2; i += 1) {
          const e = eyes[i];
          const outward = e ? Math.sign(e.x - fx) || (i === 0 ? -1 : 1) : 0;
          const blushOn = Boolean(kind && e && BLUSH[kind]);
          if (blushOn && e) {
            const p = toCss(e.x + outward * eyeR * 0.6, e.y + eyeR * 1.9);
            const bw = eyeR * 3.2 * K * cssPer;
            place(blushRefs.current[i], true, p.x, p.y, bw, bw * 0.55);
          } else place(blushRefs.current[i], false);
          const tearOn = Boolean(kind && e && TEARS[kind]);
          if (tearOn && e) {
            const p = toCss(e.x + outward * eyeR * 0.35, e.y + eyeR * 1.15);
            const tw = Math.max(8, eyeR * 0.7 * K * cssPer);
            place(tearRefs.current[i], true, p.x, p.y, tw, tw * 1.35);
          } else place(tearRefs.current[i], false);
        }
      };
      live.current.nextBlink = performance.now() + 1200;
      raf = requestAnimationFrame(frame);
    };
    image.src = posterUrl;

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
    };
  }, [posterUrl]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-cream">
      {posterUrl && <img src={posterUrl} alt="" className="absolute inset-0 h-full w-full object-contain" draggable={false} />}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {[0, 1].map((i) => (
          <div
            key={`blush${i}`}
            ref={(el) => {
              blushRefs.current[i] = el;
            }}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ display: 'none', opacity: sym ? BLUSH[sym.kind] ?? 0 : 0 }}
          >
            {sym && BLUSH[sym.kind] && <div key={sym.id} className="emo-blush h-full w-full rounded-full" />}
          </div>
        ))}
        {[0, 1].map((i) => (
          <div
            key={`tear${i}`}
            ref={(el) => {
              tearRefs.current[i] = el;
            }}
            className="absolute -translate-x-1/2"
            style={{ display: 'none' }}
          >
            {sym && TEARS[sym.kind] && <div key={sym.id} className="emo-tear h-full w-full" />}
          </div>
        ))}
        <div ref={symRef} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ display: 'none' }}>
          {sym && hasSideSymbol(sym.kind) && (
            <svg key={sym.id} viewBox="0 0 100 100" className="emo-symbol h-full w-full overflow-visible drop-shadow">
              <SymbolArt kind={sym.kind} />
            </svg>
          )}
        </div>
      </div>
      <video
        ref={overlayRef}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
        style={{ opacity: 0 }}
        muted
        playsInline
        onEnded={(e) => {
          e.currentTarget.style.opacity = '0';
        }}
        onError={(e) => {
          e.currentTarget.style.opacity = '0';
        }}
      />
    </div>
  );
});

export default PuppetFace;
