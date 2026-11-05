/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        crayon: ['"Gamja Flower"', '"Jua"', 'system-ui', 'sans-serif'],
        cute: ['"Jua"', '"Gowun Dodum"', 'system-ui', 'sans-serif'],
        body: ['"Gowun Dodum"', 'system-ui', 'sans-serif'],
      },
      colors: {
        cream: '#FFF8EC',
        peach: '#FFD6C2',
        blush: '#FFB5C5',
        mint: '#BDEBD7',
        sky: '#BFE3FF',
        lilac: '#D9C8FF',
        butter: '#FFEFA8',
        cocoa: '#5B4636',
      },
      boxShadow: {
        storybook: '0 6px 0 0 rgba(91, 70, 54, 0.18), 0 12px 24px -6px rgba(91, 70, 54, 0.25)',
        soft: '0 10px 30px -10px rgba(91, 70, 54, 0.35)',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        wiggle: {
          '0%, 100%': { transform: 'rotate(-3deg)' },
          '50%': { transform: 'rotate(3deg)' },
        },
        pulseRing: {
          '0%': { transform: 'scale(1)', opacity: '0.7' },
          '100%': { transform: 'scale(1.8)', opacity: '0' },
        },
        breathe: {
          '0%, 100%': { transform: 'scale(0.6)', opacity: '0.55' },
          '50%': { transform: 'scale(1.15)', opacity: '0.9' },
        },
        popIn: {
          '0%': { transform: 'scale(0.85)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        float: 'float 4s ease-in-out infinite',
        wiggle: 'wiggle 2.4s ease-in-out infinite',
        'pulse-ring': 'pulseRing 1.4s ease-out infinite',
        breathe: 'breathe 8s ease-in-out infinite',
        'pop-in': 'popIn 0.25s ease-out',
      },
    },
  },
  plugins: [],
};
