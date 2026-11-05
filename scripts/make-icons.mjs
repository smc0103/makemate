// 앱 아이콘(PNG)을 외부 라이브러리 없이 생성한다: node scripts/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** 단위 좌표(0~1)로 정의한 곰돌이 얼굴. scale<1이면 가장자리 여백(마스커블 안전 영역) */
function shapesFor(scale) {
  const s = (v) => 0.5 + (v - 0.5) * scale;
  const r = (v) => v * scale;
  const circle = (cx, cy, rad, color) => ({ cx: s(cx), cy: s(cy), rad: r(rad), color: hex(color) });
  return [
    circle(0.27, 0.3, 0.12, '#B9784C'), // 왼쪽 귀
    circle(0.73, 0.3, 0.12, '#B9784C'), // 오른쪽 귀
    circle(0.27, 0.3, 0.065, '#FFB5C5'),
    circle(0.73, 0.3, 0.065, '#FFB5C5'),
    circle(0.5, 0.55, 0.3, '#C98B5E'), // 얼굴
    circle(0.5, 0.65, 0.13, '#F3D9BE'), // 주둥이
    circle(0.39, 0.5, 0.035, '#5B4636'), // 눈
    circle(0.61, 0.5, 0.035, '#5B4636'),
    circle(0.4, 0.49, 0.012, '#FFFFFF'), // 눈 반짝
    circle(0.62, 0.49, 0.012, '#FFFFFF'),
    circle(0.5, 0.61, 0.04, '#5B4636'), // 코
    circle(0.31, 0.63, 0.045, '#FFB5C5'), // 볼
    circle(0.69, 0.63, 0.045, '#FFB5C5'),
  ];
}

function render(size, { scale, rounded }) {
  const rgba = Buffer.alloc(size * size * 4);
  const shapes = shapesFor(scale);
  const top = hex('#FFF8EC');
  const bottom = hex('#FFD6C2');
  const SS = 4; // 안티앨리어싱용 서브픽셀

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let acc = [0, 0, 0, 0];
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const u = (x + (sx + 0.5) / SS) / size;
          const v = (y + (sy + 0.5) / SS) / size;
          // 둥근 모서리 배경 (일반 아이콘만)
          if (rounded) {
            const R = 0.22;
            const qx = Math.max(Math.abs(u - 0.5) - (0.5 - R), 0);
            const qy = Math.max(Math.abs(v - 0.5) - (0.5 - R), 0);
            if (qx * qx + qy * qy > R * R) continue;
          }
          let color = top.map((c, i) => c + (bottom[i] - c) * v);
          for (const sh of shapes) {
            const dx = u - sh.cx;
            const dy = v - sh.cy;
            if (dx * dx + dy * dy <= sh.rad * sh.rad) color = sh.color;
          }
          acc = [acc[0] + color[0], acc[1] + color[1], acc[2] + color[2], acc[3] + 255];
        }
      }
      const n = SS * SS;
      const o = (y * size + x) * 4;
      const alpha = acc[3] / n;
      const cover = acc[3] / 255 || 1;
      rgba[o] = Math.round(acc[0] / cover);
      rgba[o + 1] = Math.round(acc[1] / cover);
      rgba[o + 2] = Math.round(acc[2] / cover);
      rgba[o + 3] = Math.round(alpha);
    }
  }
  return encodePNG(size, size, rgba);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', render(192, { scale: 1, rounded: true }));
writeFileSync('public/icons/icon-512.png', render(512, { scale: 1, rounded: true }));
// 마스커블: 안드로이드가 원/둥근 사각형으로 잘라도 얼굴이 남도록 안쪽 80%에 그림
writeFileSync('public/icons/icon-maskable-512.png', render(512, { scale: 0.78, rounded: false }));
console.log('icons written');
