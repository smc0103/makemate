import { useEffect, useState } from 'react';
import { ArrowLeft, CircleHelp, Dices, Lightbulb, Trash2 } from 'lucide-react';
import Modal from './Modal';
import { useConfirm } from './ConfirmDialog';
import { QUIZ_CARDS, QUIZ_GROUPS, QUIZ_QUESTION_LIMIT, type QuizGroup } from '../lib/quiz';
import { REVERSE_LIMIT } from '../lib/reverseQuiz';

interface QuizPanelProps {
  open: boolean;
  onClose: () => void;
  solved: Set<string>;
  /** 아이가 문제를 내고 친구가 맞힌다 */
  onStartReverse: () => void;
  /** 친구가 문제를 내고 아이가 맞힌다. null이면 모든 친구 중에서 고른다 */
  onStartQuiz: (group: QuizGroup | null) => void;
  onReset: () => void;
}

/** 문제 놀이 고르기: 내가 문제 내기 / 문제 맞히기 */
export default function QuizPanel({ open, onClose, solved, onStartReverse, onStartQuiz, onReset }: QuizPanelProps) {
  const { confirm, dialog } = useConfirm();
  const [choosingGroup, setChoosingGroup] = useState(false);

  useEffect(() => {
    if (open) setChoosingGroup(false);
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="문제 놀이" icon={<CircleHelp className="h-6 w-6" />}>
      {dialog}
      {choosingGroup ? (
        <div className="space-y-5 text-center">
          <button type="button" onClick={() => setChoosingGroup(false)} className="flex items-center gap-1 text-sm text-cocoa/60">
            <ArrowLeft className="h-4 w-4" /> 놀이 다시 고르기
          </button>
          <p className="leading-relaxed">
            친구가 동물 친구 하나를 몰래 떠올렸어요.
            <br />
            질문을 <b>{QUIZ_QUESTION_LIMIT}번</b> 해서 누구인지 맞혀 봐요!
          </p>
          <p className="font-cute text-xl">
            맞힌 친구 <b className="text-2xl text-blush">{QUIZ_CARDS.filter((c) => solved.has(c.id)).length}</b> / {QUIZ_CARDS.length}
          </p>

          <button type="button" onClick={() => onStartQuiz(null)} className="btn-storybook w-full bg-butter px-6 py-4 text-2xl">
            <Dices className="h-7 w-7" /> 바로 시작하기
          </button>

          <div className="grid grid-cols-2 gap-2">
            {QUIZ_GROUPS.map((g) => (
              <button key={g.id} type="button" onClick={() => onStartQuiz(g.id)} className="btn-storybook bg-white px-3 py-3 text-base">
                <span aria-hidden>{g.emoji}</span> {g.label}
              </button>
            ))}
          </div>

          {solved.size > 0 && (
            <button
              type="button"
              onClick={() => {
                void confirm('맞힌 기록을 지울까요? 다음 아이가 처음부터 시작할 때 사용해요.').then((ok) => {
                  if (ok) onReset();
                });
              }}
              className="inline-flex items-center gap-1 text-sm text-cocoa/60 underline underline-offset-2"
            >
              <Trash2 className="h-4 w-4" /> 맞힌 기록 지우기
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          <button type="button" onClick={onStartReverse} className="btn-storybook flex-col !gap-1 bg-mint px-5 py-5">
            <span className="flex items-center gap-2 text-2xl">
              <Lightbulb className="h-7 w-7" /> 내가 문제 내기
            </span>
            <span className="font-body text-sm text-cocoa/80">내가 마음속으로 떠올리면 친구가 {REVERSE_LIMIT}번 안에 맞혀요</span>
          </button>
          <button type="button" onClick={() => setChoosingGroup(true)} className="btn-storybook flex-col !gap-1 bg-sky px-5 py-5">
            <span className="flex items-center gap-2 text-2xl">
              <CircleHelp className="h-7 w-7" /> 문제 맞히기
            </span>
            <span className="font-body text-sm text-cocoa/80">친구가 떠올린 동물을 내가 질문해서 맞혀요</span>
          </button>
        </div>
      )}
    </Modal>
  );
}
