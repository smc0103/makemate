import { useEffect, useState } from 'react';
import type { Character, Decoration } from '../types';
import { useObjectUrl } from '../hooks/useObjectUrl';

/** 스티커 그림 주소. 같은 Blob이면 같은 주소를 다시 쓴다 */
const urlCache = new WeakMap<Blob, string>();
export function blobUrl(blob: Blob): string {
  let url = urlCache.get(blob);
  if (!url) {
    url = URL.createObjectURL(blob);
    urlCache.set(blob, url);
  }
  return url;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image'));
    img.src = src;
  });
}

/** 그림에 스티커를 붙여 한 장으로 만든다 (그림이 움직일 때 스티커도 함께 움직이도록) */
export async function composeDecorated(posterSrc: string, decorations: Decoration[], maxSide = 1536): Promise<Blob | null> {
  const poster = await loadImage(posterSrc);
  const fit = Math.min(1, maxSide / Math.max(poster.naturalWidth, poster.naturalHeight));
  const W = Math.max(1, Math.round(poster.naturalWidth * fit));
  const H = Math.max(1, Math.round(poster.naturalHeight * fit));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(poster, 0, 0, W, H);
  const images = await Promise.all(decorations.map((d) => loadImage(blobUrl(d.image)).catch(() => null)));
  decorations.forEach((d, i) => {
    const img = images[i];
    if (!img) return;
    const w = d.w * W;
    const h = w * d.aspect;
    ctx.save();
    ctx.translate(d.x * W, d.y * H);
    ctx.rotate(d.rot);
    ctx.scale(d.flip ? -1 : 1, 1);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  });
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/** 꾸민 스티커까지 붙은 대표 그림 주소. 꾸미지 않았으면 원래 그림을 쓴다 */
export function useDecoratedPoster(character: Pick<Character, 'posterImage' | 'decorations'>): string | null {
  const base = useObjectUrl(character.posterImage);
  const decorations = character.decorations;
  const [composed, setComposed] = useState<{ base: string; url: string } | null>(null);

  useEffect(() => {
    if (!base || !decorations?.length) {
      setComposed(null);
      return;
    }
    let cancelled = false;
    let made: string | null = null;
    composeDecorated(base, decorations)
      .then((blob) => {
        if (cancelled || !blob) return;
        made = URL.createObjectURL(blob);
        setComposed({ base, url: made });
      })
      .catch((err: unknown) => console.warn('[decorate] 스티커를 붙이지 못했어요', err));
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [base, decorations]);

  if (!decorations?.length) return base;
  // 합친 그림이 준비될 때까지는 원래 그림을 보여 준다
  return composed && composed.base === base ? composed.url : base;
}
