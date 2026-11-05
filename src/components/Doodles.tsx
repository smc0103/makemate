import type { CSSProperties, ReactNode } from 'react';

/** 크레파스로 그린 듯 선을 살짝 흔드는 SVG 필터. 화면에 한 번만 넣는다. */
export function CrayonFilter() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <defs>
        <filter id="crayon">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.5" />
        </filter>
      </defs>
    </svg>
  );
}

interface DoodleProps {
  className?: string;
  style?: CSSProperties;
}

const INK = '#5B4636';

function Doodle({ viewBox, className, style, children }: DoodleProps & { viewBox: string; children: ReactNode }) {
  return (
    <svg
      viewBox={viewBox}
      className={className}
      style={{ filter: 'url(#crayon)', ...style }}
      fill="none"
      stroke={INK}
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function DinoDoodle(props: DoodleProps) {
  return (
    <Doodle viewBox="0 0 210 165" {...props}>
      <path fill="#F6A04D" d="M62 76 72 54 86 72 96 48 108 66 112 42 124 58 Z" />
      <path
        fill="#8ED081"
        d="M30 122C22 92 50 72 88 73 100 42 116 20 143 20 170 20 188 38 183 60 179 76 160 80 145 78 146 98 140 122 124 132L126 152 106 152 104 137 72 137 72 152 52 152 50 133C40 133 16 143 5 130 16 130 25 128 30 122Z"
      />
      <path fill="#FFE27A" stroke="none" d="M72 128C70 110 92 96 120 100 128 104 124 124 112 130 100 134 84 134 72 128Z" />
      <circle cx="156" cy="42" r="5" fill={INK} />
      <path d="M163 63Q174 62 179 54" />
      <circle cx="146" cy="58" r="5" fill="#FF9DB0" stroke="none" />
      <circle cx="62" cy="108" r="4" fill="#5FAF57" stroke="none" />
      <circle cx="48" cy="118" r="3" fill="#5FAF57" stroke="none" />
    </Doodle>
  );
}

export function StarDoodle(props: DoodleProps) {
  return (
    <Doodle viewBox="0 0 60 60" {...props}>
      <path fill="#FFD84D" d="M30 6 37 22 54 24 41 36 45 53 30 44 15 53 19 36 6 24 23 22Z" />
    </Doodle>
  );
}

export function LeafDoodle(props: DoodleProps) {
  return (
    <Doodle viewBox="0 0 70 70" {...props}>
      <path fill="#F08A5D" d="M10 60C8 30 28 10 62 8 62 40 42 62 10 60Z" />
      <path d="M10 60 44 28M26 44 25 30M36 35 48 37" />
    </Doodle>
  );
}

export function SunDoodle(props: DoodleProps) {
  return (
    <Doodle viewBox="0 0 90 90" {...props}>
      <circle cx="45" cy="45" r="19" fill="#FFD84D" />
      <path d="M45 8V18M45 72V82M8 45H18M72 45H82M19 19 26 26M64 64 71 71M71 19 64 26M26 64 19 71" stroke="#F6A04D" />
    </Doodle>
  );
}

export function CloudDoodle(props: DoodleProps) {
  return (
    <Doodle viewBox="0 0 110 65" {...props}>
      <path fill="#D6ECFF" d="M24 56C8 56 4 36 20 32 20 14 44 8 54 22 66 8 90 16 86 34 104 36 102 56 86 56Z" />
    </Doodle>
  );
}

export function FootprintDoodle(props: DoodleProps) {
  return (
    <Doodle viewBox="0 0 60 60" {...props}>
      <g fill="#C9A98A" stroke="none">
        <ellipse cx="30" cy="40" rx="13" ry="11" />
        <path d="M18 30 8 12 24 24ZM26 26 30 4 36 26ZM42 30 52 12 37 24Z" />
      </g>
    </Doodle>
  );
}

export function CrayonDoodle({ color, ...props }: DoodleProps & { color: string }) {
  return (
    <Doodle viewBox="0 0 120 40" {...props}>
      <path fill={color} d="M28 8H108V32H28L6 20Z" />
      <path d="M42 8V32M94 8V32" />
    </Doodle>
  );
}

/** 크레파스로 쓱 그은 밑줄 */
export function Squiggle({ className }: { className?: string }) {
  return (
    <Doodle viewBox="0 0 320 24" className={className}>
      <path
        stroke="#F6A04D"
        strokeWidth="6"
        d="M6 14C30 4 46 22 70 13S112 5 136 14 178 22 202 13 244 5 268 14 300 18 314 10"
      />
    </Doodle>
  );
}
