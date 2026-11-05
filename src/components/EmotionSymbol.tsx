import type { EmotionCode } from '../types';

/**
 * 표정을 아이가 알아보기 쉽게 돕는 그림책 기호.
 * 사이트 버튼처럼 파스텔 색에 코코아색 테두리와 비스듬한 그림자를 둘러 스티커처럼 보이게 한다.
 * 머리 옆 기호는 놀라요(!)와 궁금해요(?)만 쓴다.
 */

export type SymbolKind = Exclude<EmotionCode, 'idle'>;

const COCOA = '#5B4636';
const SHADOW = 'rgba(91, 70, 54, 0.55)';
const ROUND = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** 굵은 선을 그림자 → 테두리 → 색 순서로 겹쳐 그린다 */
function ChunkyLine({ d, color, width }: { d: string; color: string; width: number }) {
  return (
    <>
      <path d={d} stroke={SHADOW} strokeWidth={width + 7} transform="translate(3 4)" {...ROUND} />
      <path d={d} stroke={COCOA} strokeWidth={width + 7} {...ROUND} />
      <path d={d} stroke={color} strokeWidth={width} {...ROUND} />
    </>
  );
}

function ChunkyDot({ cx, cy, r, color }: { cx: number; cy: number; r: number; color: string }) {
  return (
    <>
      <circle cx={cx + 3} cy={cy + 4} r={r} fill={SHADOW} />
      <circle cx={cx} cy={cy} r={r} fill={color} stroke={COCOA} strokeWidth="3.5" />
    </>
  );
}

/** 머리 옆에 기호가 붙는 표정 */
export function hasSideSymbol(kind: SymbolKind): boolean {
  return kind === 'surprised' || kind === 'curious';
}

/** 머리 옆에 붙는 기호 (100×100 기준) */
export function SymbolArt({ kind }: { kind: SymbolKind }) {
  if (kind === 'surprised') {
    return (
      <g className="emo-pop">
        {/* 손으로 그린 듯 살짝 휜 느낌표 */}
        <ChunkyLine d="M52 14 Q49 34 50 56" color="#FFD6C2" width={14} />
        <ChunkyDot cx={50} cy={80} r={8} color="#FFD6C2" />
        {/* 깜짝 놀란 선 */}
        <path d="M22 24 Q26 30 30 34 M78 24 Q74 30 70 34 M14 52 Q20 52 26 51 M86 52 Q80 52 74 51" stroke={COCOA} strokeWidth="4.5" {...ROUND} />
      </g>
    );
  }
  if (kind === 'curious') {
    return (
      <g className="emo-tilt">
        <ChunkyLine d="M33 34 Q32 15 51 14 Q70 14 70 31 Q70 44 55 50 Q50 53 50 62" color="#D9C8FF" width={12} />
        <ChunkyDot cx={50} cy={81} r={7.5} color="#D9C8FF" />
      </g>
    );
  }
  return null;
}

/** 볼이 발그레해지는 감정과 진하기 */
export const BLUSH: Partial<Record<SymbolKind, number>> = { shy: 0.95, love: 0.75 };

/** 눈물이 흐르는 감정 */
export const TEARS: Partial<Record<SymbolKind, boolean>> = { comfort: true };
