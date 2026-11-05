import { useCallback, useEffect, useState } from 'react';
import { Play, RefreshCw } from 'lucide-react';
import type { FriendVoice } from '../types';
import { getKoreanVoices, isTTSSupported, loadVoices, speak } from '../lib/speech';
import { playPop } from '../lib/sound';

/** 높이·빠르기만 바꿔 만든 목소리 느낌 */
export const VOICE_PRESETS: Array<{ id: string; emoji: string; label: string; pitch: number; rate: number }> = [
  { id: 'basic', emoji: '🙂', label: '기본', pitch: 1, rate: 0.95 },
  { id: 'kid', emoji: '🧒', label: '꼬마 친구', pitch: 1.35, rate: 1 },
  { id: 'baby', emoji: '🐣', label: '아기 동물', pitch: 1.65, rate: 1.05 },
  { id: 'brave', emoji: '💪', label: '씩씩한 친구', pitch: 1.15, rate: 1.12 },
  { id: 'calm', emoji: '🌙', label: '차분한 친구', pitch: 0.9, rate: 0.85 },
  { id: 'dino', emoji: '🦕', label: '느릿느릿 공룡', pitch: 0.7, rate: 0.8 },
];

export const DEFAULT_VOICE: FriendVoice = { pitch: 1, rate: 0.95, preset: 'basic' };

function sampleLine(name: string): string {
  const last = name.trim().slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  const hasBatchim = code >= 0 && code <= 11171 && code % 28 !== 0;
  const who = name.trim() ? `나는 ${name.trim()}${hasBatchim ? '이에요' : '예요'}.` : '나는 네가 그린 친구예요.';
  return `안녕하세요! ${who} 우리 같이 놀아요!`;
}

interface VoicePickerProps {
  value: FriendVoice | undefined;
  onChange: (voice: FriendVoice) => void;
  friendName: string;
}

/** 친구 목소리 고르기: 목소리 느낌, 태블릿 음성, 높이·빠르기 */
export default function VoicePicker({ value, onChange, friendName }: VoicePickerProps) {
  const voice = value ?? DEFAULT_VOICE;
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    loadVoices()
      .then((all) => setVoices(getKoreanVoices(all)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(refresh, [refresh]);

  const preview = (next: FriendVoice) => {
    void speak(sampleLine(friendName), { voiceName: next.voiceName, pitch: next.pitch, rate: next.rate });
  };

  const apply = (patch: Partial<FriendVoice>, listen = true) => {
    const next = { ...voice, ...patch };
    onChange(next);
    if (listen) preview(next);
  };

  if (!isTTSSupported()) {
    return <p className="rounded-2xl bg-peach/50 px-4 py-3 text-center">이 브라우저는 소리 내어 읽기를 지원하지 않아요.</p>;
  }

  return (
    <div className="space-y-5">
      <section>
        <p className="mb-2 font-cute text-lg">어떤 목소리로 말할까요?</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {VOICE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                playPop();
                apply({ pitch: p.pitch, rate: p.rate, preset: p.id });
              }}
              className={`flex items-center gap-2 rounded-2xl border-4 px-3 py-2.5 text-left font-cute text-lg transition active:scale-95 ${
                voice.preset === p.id ? 'border-blush bg-blush/20' : 'border-white bg-white/80'
              }`}
            >
              <span className="text-2xl" aria-hidden>
                {p.emoji}
              </span>
              {p.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="font-cute text-lg">태블릿에 있는 목소리</p>
          <button type="button" onClick={refresh} className="glass-btn !px-3 !py-1.5 text-sm">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> 새로고침
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => apply({ voiceName: undefined })}
            className={`rounded-full border-4 px-4 py-1.5 font-cute transition active:scale-95 ${!voice.voiceName ? 'border-blush bg-blush/20' : 'border-white bg-white/80'}`}
          >
            자동
          </button>
          {voices.map((v, i) => (
            <button
              key={v.name}
              type="button"
              onClick={() => apply({ voiceName: v.name })}
              title={v.name}
              className={`rounded-full border-4 px-4 py-1.5 text-left transition active:scale-95 ${
                voice.voiceName === v.name ? 'border-blush bg-blush/20' : 'border-white bg-white/80'
              }`}
            >
              <span className="font-cute">목소리 {i + 1}</span>
              <span className="ml-1.5 text-xs text-cocoa/50">
                {v.name.length > 24 ? `${v.name.slice(0, 24)}…` : v.name}
                {v.localService ? '' : ' · 인터넷'}
              </span>
            </button>
          ))}
        </div>
        {!loading && voices.length <= 1 && (
          <p className="mt-2 text-sm text-cocoa/60">이 기기에는 한국어 목소리가 {voices.length ? '하나뿐이에요' : '없어요'}. 높이와 빠르기로 친구마다 다르게 만들어 보세요.</p>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="flex justify-between font-cute">
            <span>목소리 높이</span>
            <span className="text-cocoa/50">{voice.pitch.toFixed(2)}</span>
          </span>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={voice.pitch}
            onChange={(e) => apply({ pitch: Number(e.target.value), preset: undefined }, false)}
            onPointerUp={() => preview(voice)}
            className="w-full accent-blush"
          />
          <span className="flex justify-between text-xs text-cocoa/50">
            <span>낮게</span>
            <span>높게 (아이처럼)</span>
          </span>
        </label>
        <label className="block">
          <span className="flex justify-between font-cute">
            <span>말 빠르기</span>
            <span className="text-cocoa/50">{voice.rate.toFixed(2)}</span>
          </span>
          <input
            type="range"
            min={0.3}
            max={2}
            step={0.05}
            value={voice.rate}
            onChange={(e) => apply({ rate: Number(e.target.value), preset: undefined }, false)}
            onPointerUp={() => preview(voice)}
            className="w-full accent-blush"
          />
          <span className="flex justify-between text-xs text-cocoa/50">
            <span>느리게</span>
            <span>빠르게</span>
          </span>
        </label>
      </section>

      <button type="button" onClick={() => preview(voice)} className="btn-storybook w-full bg-sky px-5 py-3 text-xl">
        <Play className="h-5 w-5" /> 미리 듣기
      </button>

    </div>
  );
}
