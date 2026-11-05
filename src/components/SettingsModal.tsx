import { useEffect, useState } from 'react';
import { BookHeart, Brain, CheckCircle2, Globe, Settings, Volume2 } from 'lucide-react';
import Modal from './Modal';
import ApiKeyField from './ApiKeyField';
import { getApiKey, setApiKey, testApiKey } from '../lib/gemini';
import { getGroqKey, setGroqKey, testGroqKey } from '../lib/groq';
import {
  PROVIDER_LABEL,
  getEngine,
  getFirstProvider,
  setEngine,
  setFirstProvider,
  type CloudProvider,
  type EngineKind,
} from '../lib/brain';
import { VOICE_STORAGE_KEY, getKoreanVoices, isTTSSupported, loadVoices, pickKoreanVoice, speak } from '../lib/speech';
import { playPop } from '../lib/sound';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const ENGINE_OPTIONS: Array<{
  kind: EngineKind;
  icon: typeof Globe;
  title: string;
  badge: string;
  description: string;
}> = [
  {
    kind: 'offline',
    icon: BookHeart,
    title: '오프라인 친구',
    badge: '키 필요 없음',
    description: '인터넷·API 키 없이 바로 대답해요. 정해진 감정 코칭 문장으로 안전하게 이야기해요.',
  },
  {
    kind: 'cloud',
    icon: Globe,
    title: '온라인 AI (Groq · Gemini)',
    badge: 'API 키 필요',
    description: '가장 자연스럽게 대화해요. 키를 둘 다 넣으면 하나가 막혀도 다른 AI가 이어서 대답해요.',
  },
];

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [engine, setEngineState] = useState<EngineKind>('offline');
  const [geminiKey, setGeminiKey] = useState('');
  const [groqKey, setGroqKeyState] = useState('');
  const [firstProvider, setFirstProviderState] = useState<CloudProvider>('groq');
  const [saved, setSaved] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState('');

  useEffect(() => {
    if (!open) return;
    setEngineState(getEngine());
    setGeminiKey(getApiKey());
    setGroqKeyState(getGroqKey());
    setFirstProviderState(getFirstProvider());
    setSaved(false);
    let cancelled = false;
    void loadVoices().then((all) => {
      if (cancelled) return;
      setVoices(getKoreanVoices(all));
      setVoiceName(pickKoreanVoice(all)?.name ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const chooseEngine = (kind: EngineKind) => {
    playPop();
    setEngineState(kind);
    setSaved(false);
  };

  const handleSave = () => {
    playPop();
    setEngine(engine);
    setApiKey(geminiKey);
    setGroqKey(groqKey);
    setFirstProvider(firstProvider);
    try {
      if (voiceName) localStorage.setItem(VOICE_STORAGE_KEY, voiceName);
    } catch {
      /* noop */
    }
    setSaved(true);
    window.setTimeout(onClose, 700);
  };

  const previewVoice = (name: string) => {
    setVoiceName(name);
    try {
      localStorage.setItem(VOICE_STORAGE_KEY, name);
    } catch {
      /* noop */
    }
    void speak('안녕! 나는 네가 그린 친구야. 오늘 기분은 어때요?');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="설정"
      icon={<Settings className="h-6 w-6" />}
      footer={
        <div className="flex items-center justify-end gap-3">
          {saved && (
            <span className="flex items-center gap-1 font-cute text-emerald-600">
              <CheckCircle2 className="h-5 w-5" /> 저장했어요!
            </span>
          )}
          <button type="button" onClick={handleSave} className="btn-storybook bg-mint px-6 py-2.5 text-lg">
            저장하기
          </button>
        </div>
      }
    >
      {/* 두뇌 선택 */}
      <section className="space-y-3">
        <p className="flex items-center gap-2 font-cute text-lg">
          <Brain className="h-5 w-5 text-blush" /> 친구의 두뇌
        </p>
        <div className="grid gap-2" role="radiogroup" aria-label="친구의 두뇌">
          {ENGINE_OPTIONS.map(({ kind, icon: Icon, title, badge, description }) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={engine === kind}
              onClick={() => chooseEngine(kind)}
              className={`flex gap-3 rounded-2xl border-4 px-4 py-3 text-left transition ${
                engine === kind ? 'border-blush bg-white' : 'border-white bg-white/60 hover:bg-white'
              }`}
            >
              <Icon className={`mt-0.5 h-6 w-6 shrink-0 ${engine === kind ? 'text-blush' : 'text-cocoa/40'}`} />
              <span className="flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-cute text-lg">{title}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      kind === 'cloud' ? 'bg-sky/70' : 'bg-mint'
                    }`}
                  >
                    {badge}
                  </span>
                </span>
                <span className="mt-0.5 block text-sm leading-snug text-cocoa/70">{description}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="text-xs text-cocoa/60">
          어떤 두뇌든 오류나 사용량 제한이 생기면 오프라인 친구가 대신 대답해서 대화가 끊기지 않아요.
        </p>
      </section>

      {/* 온라인 AI 키 */}
      {engine === 'cloud' && (
        <section className="mt-5 space-y-5 rounded-2xl bg-white/70 p-4">
          <p className="text-xs leading-relaxed text-cocoa/60">
            키는 이 기기 브라우저(localStorage)에만 저장되고 각 AI 회사 서버로만 전송돼요.
          </p>

          <ApiKeyField
            id="groq-key"
            label="Groq API 키"
            badge="빠름"
            placeholder="gsk_..."
            helpUrl="https://console.groq.com/keys"
            helpText="무료로 받을 수 있고 대답이 아주 빨라요."
            value={groqKey}
            onChange={(v) => {
              setGroqKeyState(v);
              setSaved(false);
            }}
            onTest={testGroqKey}
          />

          <ApiKeyField
            id="gemini-key"
            label="Google Gemini API 키"
            badge="한국어 자연스러움"
            placeholder="AIza..."
            helpUrl="https://aistudio.google.com/app/apikey"
            helpText="무료 버전은 사용량 제한이 작아요."
            value={geminiKey}
            onChange={(v) => {
              setGeminiKey(v);
              setSaved(false);
            }}
            onTest={testApiKey}
          />

          <div>
            <p className="font-cute text-lg">먼저 물어볼 AI</p>
            <p className="text-xs text-cocoa/60">막히면 다른 AI가 바로 이어서 대답해요.</p>
            <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="먼저 물어볼 AI">
              {(['groq', 'gemini'] as CloudProvider[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={firstProvider === p}
                  onClick={() => {
                    playPop();
                    setFirstProviderState(p);
                    setSaved(false);
                  }}
                  className={`rounded-2xl border-4 px-3 py-2 font-cute transition ${
                    firstProvider === p ? 'border-blush bg-white' : 'border-white bg-white/60 hover:bg-white'
                  }`}
                >
                  {PROVIDER_LABEL[p]}
                  <span className="block text-xs font-body text-cocoa/60">
                    {p === 'groq' ? '더 빠르게' : '더 자연스럽게'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {!groqKey.trim() && !geminiKey.trim() && (
            <p className="text-sm font-semibold text-rose-500">키를 하나 이상 넣어 주세요. 없으면 오프라인 친구가 대답해요.</p>
          )}
        </section>
      )}

      {/* 목소리 */}
      <section className="mt-6 space-y-3">
        <p className="flex items-center gap-2 font-cute text-lg">
          <Volume2 className="h-5 w-5 text-blush" /> 친구 목소리
        </p>
        {!isTTSSupported() ? (
          <p className="text-sm text-cocoa/70">이 브라우저는 음성 합성을 지원하지 않아요.</p>
        ) : voices.length === 0 ? (
          <p className="text-sm text-cocoa/70">
            한국어 목소리를 찾지 못했어요. 기기 설정에서 한국어 음성을 설치하면 더 자연스러워요.
          </p>
        ) : (
          <div className="grid gap-2">
            {voices.map((v) => (
              <button
                key={v.name}
                type="button"
                onClick={() => previewVoice(v.name)}
                className={`flex items-center justify-between rounded-2xl border-4 px-4 py-2 text-left transition ${
                  voiceName === v.name ? 'border-blush bg-white' : 'border-white bg-white/60 hover:bg-white'
                }`}
              >
                <span className="truncate text-sm">{v.name}</span>
                <Volume2 className="h-4 w-4 shrink-0 text-cocoa/50" />
              </button>
            ))}
          </div>
        )}
      </section>
    </Modal>
  );
}
