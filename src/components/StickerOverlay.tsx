import { useEffect, useRef, useState } from 'react';
import type { Decoration } from '../types';
import { blobUrl } from '../lib/decorate';

interface StickerOverlayProps {
  /** 스티커 위치의 기준이 되는 원래 그림 */
  posterUrl: string | null;
  decorations: Decoration[];
}

/**
 * 영상으로 움직이는 친구 위에 자연물 스티커를 겹쳐 붙인다.
 * 영상은 화면을 가득 채우므로(object-cover) 같은 방식으로 그림 위치를 맞춘다.
 */
export default function StickerOverlay({ posterUrl, decorations }: StickerOverlayProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!posterUrl) return;
    const img = new Image();
    img.onload = () => setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = posterUrl;
  }, [posterUrl]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const k = natural ? Math.max(size.w / natural.w, size.h / natural.h) : 0;
  const w = natural ? natural.w * k : 0;
  const h = natural ? natural.h * k : 0;

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0 z-[4] overflow-hidden" aria-hidden>
      {natural && (
        <div className="absolute" style={{ width: w, height: h, left: (size.w - w) / 2, top: (size.h - h) / 2 }}>
          {decorations.map((d) => (
            <img
              key={d.id}
              src={blobUrl(d.image)}
              alt=""
              className="absolute"
              style={{
                left: `${d.x * 100}%`,
                top: `${d.y * 100}%`,
                width: `${d.w * 100}%`,
                transform: `translate(-50%, -50%) rotate(${d.rot}rad)${d.flip ? ' scaleX(-1)' : ''}`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
