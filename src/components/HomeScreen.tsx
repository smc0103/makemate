import { useState } from 'react';
import { Settings } from 'lucide-react';
import SettingsModal from './SettingsModal';
import {
  CloudDoodle,
  CrayonDoodle,
  CrayonFilter,
  DinoDoodle,
  FootprintDoodle,
  LeafDoodle,
  Squiggle,
  StarDoodle,
  SunDoodle,
} from './Doodles';
import { ENGINE_LABEL, getEngine, hasAnyCloudKey } from '../lib/brain';
import { playPop, unlockAudio } from '../lib/sound';

interface HomeScreenProps {
  onCreate: () => void;
  onGallery: () => void;
}

// 글자마다 다른 크레파스 색
const TITLE = [
  { ch: '내', color: '#E4572E', tilt: '-4deg' },
  { ch: '가', color: '#F18F01', tilt: '3deg' },
  { ch: ' ', color: '', tilt: '0deg' },
  { ch: '그', color: '#3F9B4F', tilt: '-2deg' },
  { ch: '린', color: '#2E86C1', tilt: '4deg' },
  { ch: ' ', color: '', tilt: '0deg' },
  { ch: '친', color: '#8E5BC2', tilt: '-3deg' },
  { ch: '구', color: '#E0568A', tilt: '3deg' },
];

export default function HomeScreen({ onCreate, onGallery }: HomeScreenProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [engine, setEngineState] = useState(getEngine);
  const [hasKey, setHasKey] = useState(hasAnyCloudKey);
  const needsKey = engine === 'cloud' && !hasKey;

  const go = (fn: () => void) => () => {
    unlockAudio();
    playPop();
    fn();
  };

  return (
    <main className="sketchbook-bg flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden px-4 pb-10 pt-16">
      <CrayonFilter />

      {/* 스케치북 여백에 그린 낙서 */}
      <SunDoodle className="pointer-events-none absolute left-[5%] top-[9%] w-16 sm:w-24" />
      <CloudDoodle className="pointer-events-none absolute right-[9%] top-[15%] w-20 sm:w-32" />
      <StarDoodle className="pointer-events-none absolute left-[4%] top-[32%] hidden w-10 sm:block" />
      <LeafDoodle className="pointer-events-none absolute bottom-[5%] left-[3%] w-12 sm:w-16" />
      <StarDoodle className="pointer-events-none absolute right-[4%] top-[40%] w-8 sm:w-12" />
      <FootprintDoodle className="pointer-events-none absolute bottom-[20%] right-[12%] w-9 -rotate-12 sm:w-12" />
      <FootprintDoodle className="pointer-events-none absolute bottom-[8%] right-[6%] w-9 rotate-12 sm:w-12" />
      <CrayonDoodle color="#8ED081" className="pointer-events-none absolute bottom-[3%] left-[26%] hidden w-24 -rotate-6 [@media(min-height:760px)]:block" />
      <CrayonDoodle color="#FF9DB0" className="pointer-events-none absolute bottom-[4%] right-[26%] hidden w-20 rotate-12 [@media(min-height:760px)]:block" />

      <button
        type="button"
        onClick={go(() => setSettingsOpen(true))}
        className="glass-btn absolute right-4 top-11 z-10 sm:right-6"
        aria-label="설정"
      >
        <Settings className="h-5 w-5" />
        <span>설정</span>
        {needsKey && <span className="h-2.5 w-2.5 rounded-full bg-rose-400" aria-label="API 키 필요" />}
      </button>

      <div className="relative z-10 flex flex-col items-center text-center">
        <DinoDoodle className="mb-1 w-36 animate-wiggle sm:w-48" />
        <h1 aria-label="내가 그린 친구" className="font-crayon text-6xl font-bold leading-none sm:text-8xl">
          {TITLE.map((t, i) =>
            t.ch === ' ' ? (
              <span key={i} className="inline-block w-3 sm:w-6" />
            ) : (
              <span key={i} aria-hidden className="inline-block" style={{ color: t.color, transform: `rotate(${t.tilt})` }}>
                {t.ch}
              </span>
            ),
          )}
        </h1>
        <Squiggle className="mt-1 w-64 sm:w-96" />
        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-cocoa/80 sm:text-xl">
          박물관에서 본 동물과 공룡, 내가 상상한 친구를 그려요.
          <br />
          내 그림이 친구가 되어 함께 이야기하고 놀아요.
        </p>

        <div className="mt-8 flex w-full max-w-sm flex-col gap-5 sm:max-w-none sm:flex-row">
          <button type="button" onClick={go(onCreate)} className="btn-storybook bg-blush px-8 py-5 text-2xl sm:text-3xl">
            <span aria-hidden>🖍️</span> 새 친구 만들기
          </button>
          <button type="button" onClick={go(onGallery)} className="btn-storybook bg-sky px-8 py-5 text-2xl sm:text-3xl">
            <span aria-hidden>🖼️</span> 친구들 보러가기
          </button>
        </div>

        <p className="mt-7 rounded-full bg-white/80 px-5 py-2 text-sm text-cocoa/70">
          {needsKey ? (
            <>
              보호자님, <b>설정</b>에서 API 키를 넣거나 <b>키 없는 두뇌</b>를 골라 주세요 🔑
            </>
          ) : (
            <>
              🧠 친구의 두뇌: <b>{ENGINE_LABEL[engine]}</b> · 설정에서 바꿀 수 있어요
            </>
          )}
        </p>
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          setHasKey(hasAnyCloudKey());
          setEngineState(getEngine());
        }}
      />
    </main>
  );
}
