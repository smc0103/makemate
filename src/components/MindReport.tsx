import { useMemo } from 'react';
import { HeartHandshake, MessageCircle, NotebookPen, Trash2 } from 'lucide-react';
import Modal from './Modal';
import type { ChatLog, EmotionCode, MissionFind } from '../types';
import { FindPhoto } from './MissionPanel';
import { useConfirm } from './ConfirmDialog';
import { EMOTION_CODES, EMOTION_META } from '../lib/emotions';

interface MindReportProps {
  open: boolean;
  onClose: () => void;
  logs: ChatLog[];
  finds: MissionFind[];
  characterName: string;
  onClear: () => void;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function formatDay(ts: number) {
  return new Date(ts).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
}

export default function MindReport({ open, onClose, logs, finds, characterName, onClear }: MindReportProps) {
  const { confirm, dialog } = useConfirm();
  const analysis = useMemo(() => {
    const childLogs = logs.filter((l) => l.speaker === 'child' && !l.game);
    const counts = EMOTION_CODES.reduce(
      (acc, code) => ({ ...acc, [code]: 0 }),
      {} as Record<EmotionCode, number>,
    );
    childLogs.forEach((l) => {
      counts[l.emotion] += 1;
    });
    const total = childLogs.length;
    const ranked = [...EMOTION_CODES].sort((a, b) => counts[b] - counts[a]);
    const meaningful = ranked.filter((c) => c !== 'idle' && counts[c] > 0);
    const dominant: EmotionCode = meaningful[0] ?? 'idle';
    const days = new Set(logs.map((l) => new Date(l.timestamp).toDateString())).size;
    const avgLength = total ? Math.round(childLogs.reduce((s, l) => s + l.text.length, 0) / total) : 0;
    return { counts, total, ranked, dominant, days, avgLength, meaningful };
  }, [logs]);

  const grouped = useMemo(() => {
    const map = new Map<string, ChatLog[]>();
    logs.forEach((log) => {
      const key = formatDay(log.timestamp);
      const list = map.get(key) ?? [];
      list.push(log);
      map.set(key, list);
    });
    return [...map.entries()];
  }, [logs]);

  const dominantMeta = EMOTION_META[analysis.dominant];

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={`${characterName} 친구와 나눈 마음 리포트`}
      icon={<NotebookPen className="h-6 w-6" />}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-cocoa/50">감정은 친구(AI)의 반응을 바탕으로 추정한 참고 자료예요.</p>
          <button
            type="button"
            disabled={logs.length === 0}
            onClick={() => {
              void confirm('대화 기록을 모두 지울까요?').then((ok) => {
                if (ok) onClear();
              });
            }}
            className="btn-storybook shrink-0 bg-white px-4 py-1.5 text-base"
          >
            <Trash2 className="h-4 w-4" /> 기록 지우기
          </button>
        </div>
      }
    >
      {dialog}
      {logs.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-6xl" aria-hidden>
            📭
          </p>
          <p className="mt-4 font-cute text-2xl">아직 나눈 이야기가 없어요</p>
          <p className="mt-1 text-cocoa/60">마이크 버튼을 눌러 친구에게 말을 걸어 보세요!</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 요약 카드 */}
          <section className="grid gap-3 sm:grid-cols-3">
            <Stat label="아이가 한 말" value={`${analysis.total}번`} />
            <Stat label="함께한 날" value={`${analysis.days}일`} />
            <Stat label="평균 말 길이" value={`${analysis.avgLength}글자`} />
          </section>

          {/* 정서 분석 */}
          <section className="card-storybook p-5">
            <h3 className="flex items-center gap-2 font-cute text-xl">
              <HeartHandshake className="h-5 w-5 text-blush" /> 마음 날씨
            </h3>
            {analysis.total === 0 ? (
              <p className="mt-3 text-cocoa/60">아이의 말이 쌓이면 마음 날씨를 보여드릴게요.</p>
            ) : (
              <>
                <div className="mt-4 space-y-2.5">
                  {analysis.ranked.map((code) => {
                    const meta = EMOTION_META[code];
                    const count = analysis.counts[code];
                    const pct = analysis.total ? Math.round((count / analysis.total) * 100) : 0;
                    return (
                      <div key={code} className="flex items-center gap-3">
                        <span className="w-24 shrink-0 text-sm">
                          {meta.emoji} {meta.childFeeling}
                        </span>
                        <div className="h-5 flex-1 overflow-hidden rounded-full bg-cream">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, backgroundColor: meta.color }}
                          />
                        </div>
                        <span className="w-14 shrink-0 text-right text-sm tabular-nums text-cocoa/70">
                          {count}회 · {pct}%
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-5 rounded-2xl bg-cream p-4">
                  <p className="font-cute text-lg">
                    {dominantMeta.emoji}{' '}
                    {analysis.meaningful.length === 0
                      ? '편안하고 잔잔한 대화가 많았어요.'
                      : `가장 많이 나눈 마음은 "${dominantMeta.childFeeling}"이에요.`}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-cocoa/80">
                    <b>보호자 코칭 팁 · </b>
                    {dominantMeta.tip}
                  </p>
                  {analysis.counts.calm + analysis.counts.comfort > analysis.total / 2 && (
                    <p className="mt-2 text-sm leading-relaxed text-rose-500">
                      속상하거나 화난 마음이 자주 보였어요. 오늘 저녁엔 아이와 꼭 안아주며 이야기를 나눠 보세요.
                    </p>
                  )}
                </div>
              </>
            )}
          </section>

          {/* 미션 놀이 */}
          {finds.length > 0 && (
            <section className="card-storybook p-5">
              <h3 className="font-cute text-xl">🔍 찾아온 자연물 {finds.length}개</h3>
              <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {finds.map((find) => (
                  <li key={find.id} className="text-center">
                    <FindPhoto photo={find.photo} alt={find.missionTitle} className="aspect-square w-full rounded-2xl object-cover" />
                    <p className="mt-1 text-xs leading-snug">
                      {find.emoji} {find.missionTitle}
                    </p>
                    <p className="text-[11px] text-cocoa/50">
                      {find.confirmedBy === 'ai' ? 'AI 확인' : '어른 확인'} · {formatTime(find.timestamp)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 대화 로그 */}
          <section>
            <h3 className="mb-3 flex items-center gap-2 font-cute text-xl">
              <MessageCircle className="h-5 w-5 text-blush" /> 대화 기록
            </h3>
            <div className="space-y-5">
              {grouped.map(([day, dayLogs]) => (
                <div key={day}>
                  <p className="mb-2 text-center text-xs font-semibold text-cocoa/50">{day}</p>
                  <ul className="space-y-2">
                    {dayLogs.map((log) => {
                      const isChild = log.speaker === 'child';
                      const meta = EMOTION_META[log.emotion];
                      return (
                        <li key={log.id} className={`flex ${isChild ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-[80%] rounded-3xl px-4 py-2.5 shadow-soft ${
                              isChild ? 'rounded-br-md bg-sky/70' : 'rounded-bl-md bg-white'
                            }`}
                          >
                            <p className="text-xs font-bold text-cocoa/60">
                              {isChild ? '🙋 아이' : `🎨 ${characterName}`} · {formatTime(log.timestamp)}
                            </p>
                            <p className="mt-0.5 leading-relaxed">{log.text}</p>
                            {log.emotion !== 'idle' && (
                              <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-xs ${meta.chip}`}>
                                {meta.emoji} {isChild ? meta.childFeeling : meta.friendLabel}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-storybook px-4 py-3 text-center">
      <p className="text-sm text-cocoa/60">{label}</p>
      <p className="font-cute text-3xl">{value}</p>
    </div>
  );
}
