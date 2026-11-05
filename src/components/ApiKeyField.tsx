import { useEffect, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Trash2, XCircle } from 'lucide-react';
import { GeminiError } from '../lib/gemini';
import { playPop } from '../lib/sound';

interface ApiKeyFieldProps {
  id: string;
  label: string;
  badge?: string;
  placeholder: string;
  helpUrl: string;
  helpText: string;
  value: string;
  onChange: (value: string) => void;
  /** 연결 확인. 성공 시 연결된 모델 이름을 돌려준다 */
  onTest: (key: string) => Promise<string>;
}

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok'; model: string }
  | { status: 'fail'; message: string };

export default function ApiKeyField({
  id,
  label,
  badge,
  placeholder,
  helpUrl,
  helpText,
  value,
  onChange,
  onTest,
}: ApiKeyFieldProps) {
  const [reveal, setReveal] = useState(false);
  const [test, setTest] = useState<TestState>({ status: 'idle' });

  useEffect(() => {
    setTest({ status: 'idle' });
  }, [value]);

  const handleTest = async () => {
    if (!value.trim()) return;
    setTest({ status: 'testing' });
    try {
      const model = await onTest(value.trim());
      setTest({ status: 'ok', model });
    } catch (err) {
      setTest({ status: 'fail', message: err instanceof GeminiError ? err.message : '연결에 실패했어요.' });
    }
  };

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="flex items-center gap-2 font-cute text-lg">
        <KeyRound className="h-5 w-5 text-blush" /> {label}
        {badge && <span className="rounded-full bg-mint px-2 py-0.5 text-[11px] font-bold">{badge}</span>}
      </label>
      <p className="text-xs leading-relaxed text-cocoa/60">
        {helpText}{' '}
        <a href={helpUrl} target="_blank" rel="noreferrer" className="font-semibold text-blush underline underline-offset-2">
          키 발급받기
        </a>
      </p>
      <div className="relative">
        <input
          id={id}
          type={reveal ? 'text' : 'password'}
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="input-storybook pr-12 font-mono text-base"
        />
        <button
          type="button"
          onClick={() => setReveal((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-cocoa/60 hover:bg-peach/40"
          aria-label={reveal ? '키 숨기기' : '키 보기'}
        >
          {reveal ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            playPop();
            void handleTest();
          }}
          disabled={!value.trim() || test.status === 'testing'}
          className="btn-storybook bg-sky px-4 py-1.5 text-base"
        >
          {test.status === 'testing' && <Loader2 className="h-4 w-4 animate-spin" />}
          연결 확인
        </button>
        {value && (
          <button
            type="button"
            onClick={() => {
              playPop();
              onChange('');
            }}
            className="btn-storybook bg-white px-4 py-1.5 text-base"
          >
            <Trash2 className="h-4 w-4" /> 지우기
          </button>
        )}
        {test.status === 'ok' && (
          <span className="flex items-center gap-1 text-sm font-semibold text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> 연결됐어요! {test.model && `(${test.model})`}
          </span>
        )}
        {test.status === 'fail' && (
          <span className="flex w-full items-start gap-1 break-all text-sm font-semibold text-rose-500">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> {test.message}
          </span>
        )}
      </div>
    </div>
  );
}
