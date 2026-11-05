import { useState, type ReactNode } from 'react';
import { CircleHelp, Dices, Lightbulb, Loader2, MessageCircleQuestion, Trophy, UserCheck, X } from 'lucide-react';
import { QUESTION_CHIPS, QUIZ_QUESTION_LIMIT, type QuizCard } from '../lib/quiz';
import type { Mission } from '../lib/missions';
import { useObjectUrl } from '../hooks/useObjectUrl';

/**
 * 놀이 조작판. 친구의 얼굴을 가리지 않도록 왼쪽 아래 구석에 모아 둔다.
 * 질문 예시와 보기는 눌렀을 때만 펼친다.
 */
function Dock({ children }: { children: ReactNode }) {
  return (
    <div
      data-no-touch
      className="absolute bottom-[9rem] left-3 z-40 flex w-44 flex-col items-stretch gap-1.5 sm:bottom-[max(1.5rem,env(safe-area-inset-bottom))] sm:left-4 lg:w-52"
    >
      {children}
    </div>
  );
}

/** 남은 횟수를 글자 없이 점으로 보여주는 상태 표시 */
function StatusPill({ icon, label, left, total, onQuit }: { icon: ReactNode; label: string; left: number | null; total: number; onQuit: () => void }) {
  return (
    <div className="rounded-2xl bg-white/85 px-2.5 py-1.5 shadow-soft backdrop-blur">
      <div className="flex items-center gap-1.5">
        {icon}
        <p className="min-w-0 flex-1 truncate font-cute text-sm">{label}</p>
        <button type="button" onClick={onQuit} className="rounded-full p-1 text-cocoa/50" aria-label="놀이 그만하기">
          <X className="h-4 w-4" />
        </button>
      </div>
      {left !== null && (
        <div className="mt-1 flex gap-0.5" aria-label={`남은 횟수 ${left}번`}>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i < left ? 'bg-blush' : 'bg-cocoa/15'}`} />
          ))}
        </div>
      )}
    </div>
  );
}

const dockBtn =
  'flex items-center justify-center gap-1 rounded-2xl bg-white/85 px-2 py-2 font-cute text-sm text-cocoa shadow-soft backdrop-blur transition active:scale-95 disabled:opacity-50';

interface QuizDockProps {
  card: QuizCard;
  finished: boolean;
  used: number;
  asked: string[];
  options: QuizCard[] | null;
  hintsLeft: boolean;
  disabled: boolean;
  onAsk: (question: string) => void;
  onHint: () => void;
  onOpenOptions: () => void;
  onPick: (card: QuizCard) => void;
  onNext: () => void;
  onQuit: () => void;
}

/** 박물관 열고개 조작판 */
export function QuizDock({
  card,
  finished,
  used,
  asked,
  options,
  hintsLeft,
  disabled,
  onAsk,
  onHint,
  onOpenOptions,
  onPick,
  onNext,
  onQuit,
}: QuizDockProps) {
  const [showChips, setShowChips] = useState(false);
  const chips = QUESTION_CHIPS.filter((c) => !asked.includes(c.key)).slice(0, 5);

  if (finished) {
    return (
      <Dock>
        <button type="button" onClick={onNext} className={`${dockBtn} !bg-butter py-3 text-base`}>
          <Dices className="h-5 w-5" /> 다음 문제
        </button>
        <StatusPill icon={<Trophy className="h-4 w-4 shrink-0 text-amber-500" />} label={card.name} left={null} total={0} onQuit={onQuit} />
      </Dock>
    );
  }

  return (
    <Dock>
      {options &&
        options.map((o) => (
          <button key={o.id} type="button" disabled={disabled} onClick={() => onPick(o)} className={`${dockBtn} !justify-start text-left`}>
            <span className="text-xl" aria-hidden>
              {o.emoji}
            </span>
            <span className="min-w-0 break-keep text-xs leading-tight sm:text-sm">{o.name}</span>
          </button>
        ))}
      {!options && showChips &&
        chips.map((c) => (
          <button
            key={c.key}
            type="button"
            disabled={disabled}
            onClick={() => {
              setShowChips(false);
              onAsk(c.label);
            }}
            className={`${dockBtn} !bg-sky/90 text-xs sm:text-sm`}
          >
            {c.label}
          </button>
        ))}
      {!options && (
        <div className="grid grid-cols-3 gap-1">
          <button type="button" disabled={disabled} onClick={() => setShowChips((v) => !v)} className={`${dockBtn} flex-col !gap-0 text-xs ${showChips ? '!bg-sky' : ''}`}>
            <MessageCircleQuestion className="h-5 w-5" /> 질문
          </button>
          <button type="button" disabled={disabled || !hintsLeft} onClick={onHint} className={`${dockBtn} flex-col !gap-0 text-xs`}>
            <Lightbulb className="h-5 w-5" /> 힌트
          </button>
          <button type="button" disabled={disabled} onClick={onOpenOptions} className={`${dockBtn} flex-col !gap-0 !bg-mint/90 text-xs`}>
            <CircleHelp className="h-5 w-5" /> 정답
          </button>
        </div>
      )}
      <StatusPill
        icon={<CircleHelp className="h-4 w-4 shrink-0 text-blush" />}
        label="누구일까요?"
        left={QUIZ_QUESTION_LIMIT - used}
        total={QUIZ_QUESTION_LIMIT}
        onQuit={onQuit}
      />
    </Dock>
  );
}

export type MissionStatus = 'searching' | 'checking' | 'retry' | 'adult' | 'done';

interface MissionDockProps {
  mission: Mission;
  status: MissionStatus;
  photo: Blob | null;
  /** 어른 확인으로 넘어온 이유 */
  adultReason: string;
  onNext: () => void;
  onAskAdult: () => void;
  onQuit: () => void;
}

/** 자연물 찾기 미션 조작판. 힌트는 눌렀을 때만 펼친다. */
export function MissionDock({ mission, status, photo, adultReason, onNext, onAskAdult, onQuit }: MissionDockProps) {
  const [showHint, setShowHint] = useState(false);
  const photoUrl = useObjectUrl(status === 'searching' ? null : photo);

  return (
    <Dock>
      {status === 'searching' && showHint && (
        <div className="rounded-2xl bg-white/90 px-2.5 py-2 text-xs leading-snug shadow-soft backdrop-blur">
          {mission.hint}
          {mission.exhibit && <span className="mt-1 block text-[11px] text-cocoa/60">🏛️ {mission.exhibit}</span>}
        </div>
      )}
      {status === 'done' && mission.fact && (
        <p className="rounded-2xl bg-white/90 px-2.5 py-2 text-xs leading-snug shadow-soft backdrop-blur">🏛️ {mission.fact}</p>
      )}
      {status === 'adult' && (
        <p className="rounded-2xl bg-white/90 px-2.5 py-2 text-xs font-semibold leading-snug shadow-soft backdrop-blur">
          🧑‍🏫 어른이 사진을 보고 눌러 주세요{adultReason ? ` (${adultReason})` : ''}
        </p>
      )}
      {status === 'checking' && (
        <p className="flex items-center justify-center gap-1 rounded-2xl bg-white/90 px-2 py-1.5 text-xs shadow-soft backdrop-blur">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> 사진을 살펴보고 있어요
        </p>
      )}
      {photoUrl && status !== 'checking' && (
        // 어른이 확인할 때만 사진을 크게 보여준다
        <img
          src={photoUrl}
          alt="찍은 사진"
          className={`w-full rounded-2xl object-cover shadow-soft ${status === 'adult' ? 'aspect-[4/3]' : 'aspect-[3/1]'}`}
        />
      )}

      {status === 'searching' && (
        <div className="grid grid-cols-2 gap-1">
          <button type="button" onClick={() => setShowHint((v) => !v)} className={`${dockBtn} text-xs ${showHint ? '!bg-sky' : ''}`}>
            <Lightbulb className="h-4 w-4" /> 힌트
          </button>
          <button type="button" onClick={onNext} className={`${dockBtn} text-xs`}>
            <Dices className="h-4 w-4" /> 다른 미션
          </button>
        </div>
      )}
      {status === 'retry' && (
        <button type="button" onClick={onAskAdult} className={`${dockBtn} text-xs`}>
          <UserCheck className="h-4 w-4" /> 어른에게 확인받기
        </button>
      )}

      <div className="rounded-2xl bg-white/85 px-2.5 py-1.5 shadow-soft backdrop-blur">
        <div className="flex items-center gap-1.5">
          <span className="text-lg leading-none" aria-hidden>
            {status === 'done' ? '🏅' : mission.emoji}
          </span>
          <p className="min-w-0 flex-1 break-keep font-cute text-xs leading-tight sm:text-sm">{mission.title}</p>
          <button
            type="button"
            onClick={onQuit}
            disabled={status === 'checking'}
            className="shrink-0 rounded-full p-1 text-cocoa/50 disabled:opacity-40"
            aria-label="미션 그만하기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Dock>
  );
}

export type ReverseStatus = 'prepare' | 'asking' | 'guessing' | 'choice' | 'reveal' | 'done';

interface ReverseDockProps {
  status: ReverseStatus;
  used: number;
  /** 지금까지 쓸 수 있는 질문 수 (더 물어보면 늘어난다) */
  limit: number;
  disabled: boolean;
  onUnknown: () => void;
  onAgain: () => void;
  onQuit: () => void;
}

/** 내가 문제 내기 조작판 */
export function ReverseDock({ status, used, limit, disabled, onUnknown, onAgain, onQuit }: ReverseDockProps) {
  const label =
    status === 'prepare'
      ? '마음속으로 떠올려요'
      : status === 'choice'
        ? '더 물어볼까요?'
        : status === 'reveal'
          ? '정답을 알려 줘요'
          : status === 'done'
            ? '내가 낸 문제'
            : '친구가 맞히는 중';
  return (
    <Dock>
      {(status === 'asking' || status === 'guessing') && (
        <button type="button" disabled={disabled} onClick={onUnknown} className={dockBtn}>
          🤔 잘 모르겠어요
        </button>
      )}
      {status === 'done' && (
        <button type="button" onClick={onAgain} className={`${dockBtn} !bg-butter py-3 text-base`}>
          <Dices className="h-5 w-5" /> 한 번 더
        </button>
      )}
      <StatusPill
        icon={<Lightbulb className="h-4 w-4 shrink-0 text-amber-500" />}
        label={label}
        left={status === 'asking' || status === 'guessing' ? Math.max(0, limit - used) : null}
        total={limit}
        onQuit={onQuit}
      />
    </Dock>
  );
}
