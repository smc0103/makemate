import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent } from 'react';
import { ArrowLeft, AudioLines, Camera, Check, CircleHelp, Dices, Keyboard, Leaf, MoreHorizontal, Loader2, Maximize, Mic, MicOff, Minimize, NotebookPen, Search, Send, X, Lightbulb } from 'lucide-react';
import type {
  Character,
  ChatLog,
  EmotionCode,
  EmotionVideoSlot,
  FriendVoice,
  GeminiReply,
  MissionFind,
  Speaker,
  VideoSlot,
} from '../types';
import DualVideoPlayer, { type DualVideoHandle } from './DualVideoPlayer';
import PuppetFace from './PuppetFace';
import { isEmotionSlot } from '../lib/emotions';
import { SymbolArt, hasSideSymbol, type SymbolKind } from './EmotionSymbol';
import StickerOverlay from './StickerOverlay';
import { useDecoratedPoster } from '../lib/decorate';
import MindReport from './MindReport';
import MissionPanel from './MissionPanel';
import QuizPanel from './QuizPanel';
import { MissionDock, QuizDock, ReverseDock, type MissionStatus, type ReverseStatus } from './GameDocks';
import { useObjectUrl } from '../hooks/useObjectUrl';
import { useWakeLock } from '../hooks/useWakeLock';
import { useFullscreen } from '../hooks/useFullscreen';
import {
  addChatLog,
  addMissionFind,
  clearChatLogs,
  clearMissionFinds,
  createId,
  getChatLogs,
  getMissionFinds,
  deleteMissionFind,
  saveCharacter,
} from '../lib/db';
import { GREETING_TRIGGER, setConversationContext, type ChatTurn, type VisionImage } from '../lib/gemini';
import {
  addCustomMission,
  getAiCheckEnabled,
  getMissions,
  missionContext,
  pickMission,
  removeCustomMission,
  setAiCheckEnabled,
  type Mission,
} from '../lib/missions';
import { checkFind, preparePhoto } from '../lib/vision';
import {
  QUIZ_QUESTION_LIMIT,
  answerOptions,
  answerQuestion,
  getSolved,
  nextPrompt,
  pickCard,
  quizContext,
  revealSpeech,
  saveSolved,
  type QuizCard,
  type QuizGroup,
  type TraitKey,
} from '../lib/quiz';
import { needsCare, offlineReply } from '../lib/offline';
import {
  REVERSE_LIMIT,
  applyLocalAnswer,
  interpretAnswer,
  isGuessSpeech,
  nextLocalMove,
  pickYesNoQuestion,
  removeCandidate,
  revealReaction,
  reverseContext,
  type ChildAnswer,
  type LocalReverse,
  REVERSE_MORE,
  REVERSE_RETRY_NOTE,
  wantsMoreQuestions,
  wantsToReveal,
  guessName,
  localFromFacts,
  questionKey,
  recallsEarlier,
  type ReverseQA,
} from '../lib/reverseQuiz';
import { getEngine, hasAnyCloudKey, think } from '../lib/brain';
import { cancelSpeech, createRecognizer, isSTTSupported, setVoiceProfile, speak, type Recognizer } from '../lib/speech';
import VoicePicker from './VoicePicker';
import Modal from './Modal';
import { playFanfare, playMicCue, playPop, playSoftChime, playSparkle, playTouchMelody, unlockAudio } from '../lib/sound';
import { ParticleEngine } from '../lib/particles';

/** 위쪽 아이용 동그라미 버튼 */
const roundBtn =
  'flex shrink-0 items-center justify-center rounded-full shadow-soft backdrop-blur-md transition active:scale-90 sm:!h-14 sm:!w-14';

interface PlaygroundScreenProps {
  character: Character;
  onBack: () => void;
  /** 자연물 꾸미기 화면으로 (미션 사진을 바로 오리려면 photo) */
  onDecorate: (character: Character, photo?: Blob) => void;
}

type Phase = 'thinking' | 'ready' | 'listening' | 'speaking';

// 최근 대화만 보내 응답 속도를 높인다 (아이 말 + 친구 대답 6쌍)
const MAX_HISTORY = 12;

/** 모델 입력 길이를 제한하되 항상 user 턴으로 시작하도록 자른다 */
function trimHistory(history: ChatTurn[], limit = MAX_HISTORY): ChatTurn[] {
  if (history.length <= limit) return history;
  let trimmed = history.slice(history.length - limit);
  while (trimmed.length && trimmed[0].role !== 'user') trimmed = trimmed.slice(1);
  return trimmed;
}

interface ActiveMission {
  mission: Mission;
  status: MissionStatus;
  photo: Blob | null;
  image: VisionImage | null;
  adultReason: string;
}

interface ActiveReverse {
  status: ReverseStatus;
  used: number;
  /** 쓸 수 있는 질문 수. 못 맞혔을 때 아이가 더 물어보라고 하면 늘어난다 */
  limit: number;
  /** 정답을 물었는데 이름을 못 알아들은 횟수 */
  revealTries: number;
  /** 지금까지 한 질문과 아이의 대답 (같은 질문을 다시 하지 않게 AI에게 알려 준다) */
  qa: ReverseQA[];
  /** 특징별로 알아낸 대답 (카드 질문으로 이어 갈 때 쓴다) */
  facts: Partial<Record<TraitKey, ChildAnswer>>;
  /** 아니라고 한 동물 이름 */
  rejected: string[];
  /** 방금 한 질문 */
  pendingQ: string | null;
  /** null이면 온라인 AI가 질문한다 */
  local: LocalReverse | null;
  localKey: TraitKey | null;
  guessId: string | null;
}

interface ActiveQuiz {
  card: QuizCard;
  group: QuizGroup | null;
  used: number;
  asked: string[];
  hintIndex: number;
  /** 정답 고르기 보기 (null이면 질문 단계) */
  options: QuizCard[] | null;
  finished: boolean;
}

export default function PlaygroundScreen({ character, onBack, onDecorate }: PlaygroundScreenProps) {
  const [phase, setPhase] = useState<Phase>('thinking');
  const [friendText, setFriendText] = useState('');
  const [childText, setChildText] = useState('');
  const [notice, setNotice] = useState('');
  const [logs, setLogs] = useState<ChatLog[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [adultMenuOpen, setAdultMenuOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voice, setVoice] = useState<FriendVoice | undefined>(character.voice);
  /** 말이 끝난 뒤 친구를 톡 누르면 방금 한 말을 잠깐 다시 보여 준다 */
  const [peek, setPeek] = useState(false);
  const peekTimer = useRef<number | null>(null);
  const [typing, setTyping] = useState(() => !isSTTSupported());
  const [draft, setDraft] = useState('');
  const { active: fullscreen, toggle: toggleScreen } = useFullscreen();
  const [videoUrls, setVideoUrls] = useState<Partial<Record<VideoSlot, string>>>({});

  const [missions, setMissions] = useState<Mission[]>(getMissions);
  const [finds, setFinds] = useState<MissionFind[]>([]);
  const [missionPanelOpen, setMissionPanelOpen] = useState(false);
  const [activeMission, setActiveMission] = useState<ActiveMission | null>(null);
  const [aiCheck, setAiCheck] = useState(getAiCheckEnabled);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [quizPanelOpen, setQuizPanelOpen] = useState(false);
  const [quiz, setQuiz] = useState<ActiveQuiz | null>(null);
  const [solved, setSolved] = useState<Set<string>>(() => getSolved(character.id));
  const [reverse, setReverse] = useState<ActiveReverse | null>(null);
  /** 놀이 중이면 아이의 말을 놀이로 받는다. 처리했으면 true */
  const gameInputRef = useRef<((text: string) => boolean) | null>(null);
  const doneIds = useMemo(() => new Set(finds.map((f) => f.missionId)), [finds]);

  const posterUrl = useObjectUrl(character.posterImage);
  const decoratedUrl = useDecoratedPoster(character);
  useWakeLock();
  const videoRef = useRef<DualVideoHandle>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<ParticleEngine | null>(null);
  const recognizerRef = useRef<Recognizer | null>(null);
  const historyRef = useRef<ChatTurn[]>([]);
  const mountedRef = useRef(true);
  const greetedRef = useRef(false);
  const noticeTimer = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /* ---------------- 리소스 준비 ---------------- */

  // 영상 Blob → object URL
  useEffect(() => {
    const created: Partial<Record<VideoSlot, string>> = {};
    (Object.keys(character.videos) as VideoSlot[]).forEach((slot) => {
      const blob = character.videos[slot];
      if (blob) created[slot] = URL.createObjectURL(blob);
    });
    setVideoUrls(created);
    return () => {
      Object.values(created).forEach((u) => u && URL.revokeObjectURL(u));
    };
  }, [character]);

  // 파티클 캔버스
  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new ParticleEngine(canvasRef.current);
    particlesRef.current = engine;
    return () => {
      engine.reset();
      particlesRef.current = null;
    };
  }, []);

  // 대화 기록 불러오기
  useEffect(() => {
    let cancelled = false;
    getChatLogs(character.id)
      .then((list) => {
        if (!cancelled) setLogs(list);
      })
      .catch((err: unknown) => console.error(err));
    getMissionFinds(character.id)
      .then((list) => {
        if (!cancelled) setFinds(list);
      })
      .catch((err: unknown) => console.error(err));
    return () => {
      cancelled = true;
    };
  }, [character.id]);

  /* ---------------- 공통 동작 ---------------- */

  const showNotice = useCallback((message: string, ms = 3200) => {
    if (!message) return;
    setNotice(message);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), ms);
  }, []);

  const pushLog = useCallback(
    (speaker: Speaker, text: string, emotion: EmotionCode, timestamp = Date.now(), game = false) => {
      const log: ChatLog = { id: createId(), characterId: character.id, speaker, text, emotion, timestamp, ...(game ? { game } : {}) };
      setLogs((prev) => [...prev, log]);
      addChatLog(log).catch((err: unknown) => console.error('[db] 기록 저장 실패', err));
    },
    [character.id],
  );

  // 영상 친구는 얼굴 위치를 몰라서 머리 옆 정해진 자리에 기호를 띄운다
  const [videoSym, setVideoSym] = useState<{ kind: SymbolKind; id: number } | null>(null);
  const videoSymTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(videoSymTimer.current), []);

  const triggerEmotion = useCallback(
    (emotion: EmotionCode) => {
      if (emotion === 'idle') return;
      if (!(!character.videos.idle && character.face) && isEmotionSlot(emotion) && hasSideSymbol(emotion)) {
        setVideoSym({ kind: emotion, id: Date.now() });
        window.clearTimeout(videoSymTimer.current);
        videoSymTimer.current = window.setTimeout(() => setVideoSym(null), 2700);
      }
      if (emotion === 'proud') playFanfare();
      else if (emotion === 'happy' || emotion === 'love') playSparkle();
      else if (emotion === 'comfort' || emotion === 'calm' || emotion === 'scared') playSoftChime();
      else playPop();

      const hasVideo = isEmotionSlot(emotion) && Boolean(character.videos[emotion]);
      if (hasVideo && videoRef.current?.playEmotion(emotion as EmotionVideoSlot)) return;
      // 그림이 직접 움직이는 친구는 감정에 맞는 몸짓을 함께 한다
      if (!character.videos.idle && character.face && isEmotionSlot(emotion)) videoRef.current?.playEmotion(emotion);
    },
    [character.videos, character.face],
  );

  const respond = useCallback(
    (reply: GeminiReply) => {
      if (!mountedRef.current) return;
      pushLog('friend', reply.speech, reply.emotion);
      setFriendText(reply.speech);
      triggerEmotion(reply.emotion);
      setPhase('speaking');
      void speak(reply.speech, {
        onEnd: () => {
          if (!mountedRef.current) return;
          setPhase((p) => (p === 'speaking' ? 'ready' : p));
        },
      });
    },
    [pushLog, triggerEmotion],
  );


  /* ---------------- 첫 인사 ---------------- */

  useEffect(() => {
    mountedRef.current = true;
    if (greetedRef.current) return;
    greetedRef.current = true;

    const greet = async () => {
      const trigger: ChatTurn = { role: 'user', text: GREETING_TRIGGER };
      let reply: GeminiReply;
      try {
        abortRef.current = new AbortController();
        const result = await think(character.name, [trigger], { signal: abortRef.current.signal, isGreeting: true });
        reply = result.reply;
        if (result.fallbackNotice) showNotice(result.fallbackNotice, 5000);
      } catch {
        return; // 화면을 떠나 취소됨
      }
      if (!mountedRef.current) return;
      historyRef.current = [trigger, { role: 'model', text: JSON.stringify(reply) }];
      respond(reply);
    };
    // 화면 전환 직후 영상이 자리 잡을 시간을 살짝 준다
    const t = window.setTimeout(() => void greet(), 500);
    return () => {
      window.clearTimeout(t);
      greetedRef.current = false;
    };
  }, [character.name, respond, showNotice]);

  /* ---------------- 아이의 말 처리 ---------------- */

  const handleChildUtterance = useCallback(
    async (text: string) => {
      const said = text.trim();
      if (!said || !mountedRef.current) return;
      if (gameInputRef.current?.(said)) return;
      const spokeAt = Date.now();
      setChildText(said);
      setPhase('thinking');

      const userTurn: ChatTurn = { role: 'user', text: said };
      const nextHistory = trimHistory([...historyRef.current, userTurn]);

      let reply: GeminiReply;
      try {
        abortRef.current = new AbortController();
        const result = await think(character.name, nextHistory, { signal: abortRef.current.signal });
        reply = result.reply;
        if (result.fallbackNotice) showNotice(result.fallbackNotice, 4500);
      } catch {
        return; // 화면을 떠나 취소됨
      }
      if (!mountedRef.current) return;

      // 아이의 발화에는 친구가 읽어낸 감정을 함께 기록
      pushLog('child', said, reply.emotion, spokeAt);
      historyRef.current = [...nextHistory, { role: 'model', text: JSON.stringify(reply) }];
      respond(reply);
    },
    [character.name, pushLog, respond, showNotice],
  );

  const handleChildRef = useRef(handleChildUtterance);
  useEffect(() => {
    handleChildRef.current = handleChildUtterance;
  }, [handleChildUtterance]);

  /* ---------------- 음성 인식 ---------------- */

  useEffect(() => {
    const recognizer = createRecognizer({
      onStart: () => {
        setChildText('');
        setPhase('listening');
      },
      onInterim: (t) => setChildText(t),
      onFinal: (t) => void handleChildRef.current(t),
      onError: (_code, message) => showNotice(message),
      onEnd: () => setPhase((p) => (p === 'listening' ? 'ready' : p)),
    });
    recognizerRef.current = recognizer;
    return () => {
      recognizer?.abort();
      recognizerRef.current = null;
    };
  }, [showNotice]);

  // 화면을 떠날 때 모든 소리/요청 정리
  useEffect(
    () => () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      cancelSpeech();
      setConversationContext('');
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    },
    [],
  );

  const toggleMic = () => {
    unlockAudio();
    const recognizer = recognizerRef.current;
    if (!recognizer) {
      setTyping(true);
      showNotice('이 브라우저는 음성 인식을 지원하지 않아요. 글자로 말해 주세요!');
      return;
    }
    if (phase === 'listening') {
      playMicCue(false);
      recognizer.stop();
      return;
    }
    if (phase === 'thinking') return;
    if (phase === 'speaking') cancelSpeech();
    playMicCue(true);
    recognizer.start();
  };

  const submitDraft = (e: FormEvent) => {
    e.preventDefault();
    if (phase === 'thinking' || !draft.trim()) return;
    unlockAudio();
    playPop();
    if (phase === 'speaking') cancelSpeech();
    const text = draft;
    setDraft('');
    void handleChildUtterance(text);
  };

  /* ---------------- 자연물 찾기 미션 ---------------- */

  /** 미리 정해진 말을 친구가 하고, 이어지는 대화가 자연스럽도록 기록에도 남긴다 */
  const sayInMission = useCallback(
    (situation: string, reply: GeminiReply) => {
      historyRef.current = trimHistory([
        ...historyRef.current,
        { role: 'user', text: `(${situation})` },
        { role: 'model', text: JSON.stringify(reply) },
      ]);
      respond(reply);
    },
    [respond],
  );

  const startMission = (chosen: Mission | null) => {
    unlockAudio();
    playPop();
    setMissionPanelOpen(false);
    setQuiz(null);
    setReverse(null);
    abortRef.current?.abort();
    recognizerRef.current?.abort();
    setChildText('');
    const mission = chosen ?? pickMission(missions, doneIds, activeMission?.mission.id);
    setActiveMission({ mission, status: 'searching', photo: null, image: null, adultReason: '' });
    setConversationContext(missionContext(mission, 'searching'));
    sayInMission(`아이가 새 미션을 받았어: ${mission.title}`, { emotion: 'curious', speech: mission.intro });
  };

  const openCamera = () => {
    unlockAudio();
    playPop();
    cancelSpeech();
    recognizerRef.current?.abort();
    cameraInput.current?.click();
  };

  const completeMission = (
    active: ActiveMission,
    photo: Blob,
    what: string,
    confirmedBy: MissionFind['confirmedBy'],
    speech: string,
  ) => {
    const { mission } = active;
    const find: MissionFind = {
      id: createId(),
      characterId: character.id,
      missionId: mission.id,
      missionTitle: mission.title,
      emoji: mission.emoji,
      photo,
      what,
      confirmedBy,
      timestamp: Date.now(),
    };
    setFinds((prev) => [...prev, find]);
    addMissionFind(find).catch((err: unknown) => console.error('[db] 자연물 저장 실패', err));
    setActiveMission({ ...active, status: 'done', photo });
    setConversationContext(missionContext(mission, 'found'));
    particlesRef.current?.celebrate();
    sayInMission(`아이가 미션을 해냈어: ${mission.title}${what ? ` (사진 속 물건: ${what})` : ''}`, {
      emotion: 'proud',
      speech,
    });
  };

  const askAdult = (active: ActiveMission, photo: Blob | null, image: VisionImage | null, reason: string) => {
    setActiveMission({ ...active, status: 'adult', photo, image, adultReason: reason });
    sayInMission('사진을 어른이 확인해 주기로 했어', {
      emotion: 'curious',
      speech: '사진을 어른에게 보여 주고 확인받아 볼까요? 찾는 동안 어떤 기분이 들었어요?',
    });
  };

  const handlePhoto = async (file: File | undefined) => {
    const active = activeMission;
    if (!file || !active) return;
    let blob: Blob;
    let image: VisionImage;
    try {
      ({ blob, image } = await preparePhoto(file));
    } catch (err) {
      console.error(err);
      showNotice('사진을 읽지 못했어요. 다시 찍어 주세요.');
      return;
    }
    if (!mountedRef.current) return;

    const checking: ActiveMission = { ...active, status: 'checking', photo: blob, image };
    setActiveMission(checking);
    setChildText('');
    setNotice(''); // 이전 사진의 경고가 남아 있지 않게
    if (!aiCheck) {
      askAdult(checking, blob, image, '');
      return;
    }

    setPhase('thinking');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const outcome = await checkFind(character.name, active.mission, image, controller.signal);
      if (!mountedRef.current) return;
      if (outcome.kind === 'unavailable') {
        askAdult(checking, blob, image, outcome.reason);
      } else if (outcome.found) {
        completeMission(checking, blob, outcome.what, 'ai', outcome.speech);
      } else {
        if (outcome.caution) showNotice('⚠️ 만지지 말고 어른을 불러 주세요', 7000);
        setActiveMission({ ...checking, status: 'retry' });
        sayInMission(`아이가 사진을 보여 줬지만 아직 미션과 달라: ${outcome.what}`, {
          emotion: 'curious',
          speech: outcome.speech,
        });
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        console.error(err);
        if (mountedRef.current) askAdult(checking, blob, image, 'AI가 사진을 확인하지 못했어요');
      }
    }
  };

  const adultConfirm = (ok: boolean) => {
    const active = activeMission;
    if (!active) return;
    playPop();
    if (ok && active.photo) {
      completeMission(
        active,
        active.photo,
        '',
        'adult',
        `와, 어른이 맞다고 확인해 줬어요! ${active.mission.title} 미션 성공이에요. 어디에서 찾았는지 들려줄래요?`,
      );
      return;
    }
    setActiveMission({ ...active, status: 'searching', photo: null, image: null, adultReason: '' });
    sayInMission('어른이 다시 찾아보자고 했어', {
      emotion: 'curious',
      speech: '괜찮아요, 천천히 다시 찾아봐요. 이번에는 어디를 살펴보면 좋을까요?',
    });
  };

  const quitMission = () => {
    playPop();
    setActiveMission(null);
    setConversationContext('');
  };

  /* ---------------- 박물관 열고개 ---------------- */

  const startQuiz = (group: QuizGroup | null, exceptId?: string) => {
    unlockAudio();
    playPop();
    setQuizPanelOpen(false);
    setActiveMission(null);
    setReverse(null);
    abortRef.current?.abort();
    recognizerRef.current?.abort();
    setChildText('');
    const card = pickCard(group, solved, exceptId);
    setQuiz({ card, group, used: 0, asked: [], hintIndex: 0, options: null, finished: false });
    setConversationContext(quizContext(card, 'playing'));
    sayInMission('아이와 열고개 놀이를 새로 시작했어', {
      emotion: 'idle',
      speech: `내가 박물관에서 만난 친구를 몰래 떠올렸어요! 하늘을 날 수 있는지, 어디에 사는지 물어보면서 누구인지 맞혀 볼까요?`,
    });
  };

  const finishQuiz = (current: ActiveQuiz, won: boolean) => {
    if (won) {
      const next = new Set(solved).add(current.card.id);
      setSolved(next);
      saveSolved(character.id, next);
      particlesRef.current?.celebrate();
    }
    setQuiz({ ...current, finished: true, options: null });
    setConversationContext(quizContext(current.card, 'done'));
    sayInMission(`열고개 정답은 ${current.card.name}였어`, {
      emotion: won ? 'proud' : 'idle',
      speech: revealSpeech(current.card, won),
    });
  };

  const giveHint = (current: ActiveQuiz) => {
    const hint = current.card.hints[current.hintIndex];
    if (!hint) {
      sayInMission('힌트를 다 썼어', { emotion: 'idle', speech: '힌트를 다 들었어요! 이제 누구일 것 같아요?' });
      return;
    }
    setQuiz({ ...current, hintIndex: current.hintIndex + 1 });
    sayInMission('아이가 힌트를 들었어', { emotion: 'idle', speech: `힌트를 줄게요. ${hint} 누구일 것 같아요?` });
  };

  /** 질문을 다 쓰면 실패 대신 보기 중에서 고르게 한다 */
  const openOptions = (current: ActiveQuiz, lead: string) => {
    const options = answerOptions(current.card);
    setQuiz({ ...current, options });
    sayInMission('아이가 보기에서 정답을 고르기로 했어', {
      emotion: 'idle',
      speech: `${lead}${options.map((o) => o.name).join(', ')} 중에서 누구일까요?`,
    });
  };

  const pickOption = (picked: QuizCard) => {
    if (!quiz?.options) return;
    playPop();
    if (picked.id === quiz.card.id) {
      finishQuiz(quiz, true);
      return;
    }
    const remaining = quiz.options.filter((o) => o.id !== picked.id);
    // 틀린 보기를 지우다 하나만 남으면 함께 정답을 확인한다
    if (remaining.length === 1) {
      finishQuiz(quiz, false);
      return;
    }
    setQuiz({ ...quiz, options: remaining });
    sayInMission('아이가 보기에서 다른 답을 골랐어', {
      emotion: 'idle',
      speech: `아쉽지만 ${picked.name} 친구는 아니에요. 다시 한번 골라 볼까요?`,
    });
  };

  /** 카드로 답할 수 없는 말: 온라인 AI에게 카드 사실만으로 답하게 하거나, 다시 물어본다 */
  const answerUnclear = async (current: ActiveQuiz, said: string) => {
    if (needsCare(said) && getEngine() !== 'cloud') {
      const reply = offlineReply(said, character.name);
      historyRef.current = trimHistory([
        ...historyRef.current,
        { role: 'user', text: said },
        { role: 'model', text: JSON.stringify(reply) },
      ]);
      respond(reply);
      return;
    }
    const fallback: GeminiReply = {
      emotion: 'idle',
      speech: '음, 그 말은 잘 못 알아들었어요. 어디에 사는지, 무엇을 먹는지 물어볼까요?',
    };
    if (getEngine() !== 'cloud' || !hasAnyCloudKey()) {
      sayInMission('아이의 말을 잘 알아듣지 못했어', fallback);
      return;
    }
    setPhase('thinking');
    const userTurn: ChatTurn = { role: 'user', text: said };
    const nextHistory = trimHistory([...historyRef.current, userTurn]);
    try {
      abortRef.current = new AbortController();
      const result = await think(character.name, nextHistory, { signal: abortRef.current.signal });
      if (!mountedRef.current) return;
      const compactSpeech = result.reply.speech.replace(/\s/g, '');
      const leaked = [current.card.name, ...current.card.aliases].some((n) => compactSpeech.includes(n.replace(/\s/g, '')));
      // 오프라인 친구의 일반 대답이나 정답을 말해 버린 대답은 쓰지 않는다
      const reply = result.usedEngine !== 'cloud' || leaked ? fallback : result.reply;
      historyRef.current = [...nextHistory, { role: 'model', text: JSON.stringify(reply) }];
      respond(reply);
    } catch {
      /* 화면을 떠나 취소됨 */
    }
  };

  const handleQuizInput = (said: string): boolean => {
    const current = quiz;
    if (!current || current.finished) return false;
    setChildText(said);
    pushLog('child', said, 'curious', Date.now() - 1, true); // 친구의 대답보다 먼저 기록되게

    const answer = answerQuestion(current.card, said);
    switch (answer.kind) {
      case 'win':
        finishQuiz(current, true);
        break;
      case 'giveup':
        finishQuiz(current, false);
        break;
      case 'hint':
        giveHint(current);
        break;
      case 'unclear':
        void answerUnclear(current, said);
        break;
      case 'unknown':
        // 친구가 모르는 것은 아이의 질문 기회를 쓰지 않는다
        setQuiz({ ...current, asked: answer.key ? [...current.asked, answer.key] : current.asked });
        sayInMission(`아이의 질문: ${said}`, { emotion: 'idle', speech: `${answer.speech} 다른 걸 물어볼까요?` });
        break;
      default: {
        const used = current.used + 1;
        const updated: ActiveQuiz = { ...current, used, asked: answer.key ? [...current.asked, answer.key] : current.asked };
        if (used >= QUIZ_QUESTION_LIMIT) {
          openOptions(updated, `${answer.speech} 질문을 다 했어요! `);
        } else {
          setQuiz(updated);
          sayInMission(`아이의 질문: ${said}`, { emotion: 'idle', speech: `${answer.speech} ${nextPrompt(used)}` });
        }
      }
    }
    return true;
  };

  const quitQuiz = () => {
    playPop();
    abortRef.current?.abort();
    setPhase((p) => (p === 'thinking' ? 'ready' : p));
    setQuiz(null);
    setConversationContext('');
  };

  /* ---------------- 내가 문제 내기 ---------------- */

  const startReverse = () => {
    unlockAudio();
    playPop();
    setQuizPanelOpen(false);
    setQuiz(null);
    setActiveMission(null);
    abortRef.current?.abort();
    recognizerRef.current?.abort();
    setChildText('');
    setReverse({
      status: 'prepare',
      used: 0,
      limit: REVERSE_LIMIT,
      revealTries: 0,
      qa: [],
      facts: {},
      rejected: [],
      pendingQ: null,
      local: null,
      localKey: null,
      guessId: null,
    });
    historyRef.current = [];
    setConversationContext(reverseContext(REVERSE_LIMIT));
    sayInMission('아이가 문제를 내기로 했어', {
      emotion: 'idle',
      speech: '이번에는 네가 문제를 내요! 박물관에서 본 친구나 좋아하는 동물을 마음속으로 하나 떠올려요. 말하면 안 돼요, 다 떠올렸어요?',
    });
    historyRef.current = [];
  };

  /** 질문을 다 썼을 때: 더 물어볼지, 정답을 알려 줄지 아이가 고른다 */
  const askMoreOrReveal = (current: ActiveReverse) => {
    setReverse({ ...current, status: 'choice' });
    sayInMission('친구가 정해진 질문 안에 맞히지 못했어', {
      emotion: 'curious',
      speech: '와, 아직 못 맞혔어요! 질문을 더 해 볼까요, 정답을 알려 줄래요?',
    });
  };

  /** 정답을 물어본다 (아이가 알려 주기로 했거나, 친구가 아는 동물이 더 없을 때) */
  const askForReveal = (current: ActiveReverse, speech = '좋아요! 누구였는지 알려 줄래요?') => {
    setReverse({ ...current, status: 'reveal' });
    sayInMission('친구가 정답을 물어봤어', { emotion: 'proud', speech });
  };

  /** 아이가 더 물어보라고 했을 때: 질문을 다섯 번 더 한다 */
  const continueAsking = (current: ActiveReverse) => {
    const next: ActiveReverse = { ...current, status: 'asking', limit: Math.max(current.limit, current.used) + REVERSE_MORE };
    // 박물관 카드에서 후보가 다 떨어졌으면 더 물어볼 수 없다
    if (next.local && next.local.candidates.length === 0) {
      askForReveal(next, '내가 아는 친구 중에는 없나 봐요! 누구였는지 알려 줄래요?');
      return;
    }
    void friendTurn(next, '(아이가 정답을 알려 주지 않고 질문을 더 해 달라고 했어. 다음 질문을 해 줘.)', '좋아요, 더 물어볼게요! ');
  };

  const finishReverse = (current: ActiveReverse, speech: string, emotion: EmotionCode) => {
    setReverse({ ...current, status: 'done' });
    setConversationContext('아이가 낸 문제 놀이가 막 끝났어. 아이가 왜 그 친구를 떠올렸는지 다정하게 이야기를 나눠.');
    particlesRef.current?.celebrate();
    sayInMission('아이가 낸 문제 놀이가 끝났어', { emotion, speech });
  };

  /** 박물관 카드로 후보를 좁히며 다음 말을 한다 (AI를 쓸 수 없을 때) */
  const localTurn = (current: ActiveReverse, lead = '') => {
    const state = current.local ?? localFromFacts(current.facts, current.rejected);
    const move = nextLocalMove(state, current.limit - current.used);
    if (move.kind === 'giveup') {
      askForReveal({ ...current, local: state }, '와, 내가 아는 친구 중에는 없나 봐요! 누구였는지 알려 줄래요?');
      return;
    }
    setReverse({
      ...current,
      status: move.kind === 'guess' ? 'guessing' : 'asking',
      used: current.used + 1,
      local: state,
      localKey: move.kind === 'ask' ? move.key : null,
      guessId: move.kind === 'guess' ? move.card.id : null,
      pendingQ: move.speech,
    });
    respond({ emotion: 'idle', speech: lead + move.speech });
  };

  /** 친구의 다음 질문이나 맞히기 */
  const friendTurn = async (current: ActiveReverse, childSaid: string, lead = '') => {
    const remaining = current.limit - current.used;
    if (remaining <= 0) {
      askMoreOrReveal(current);
      return;
    }
    if (current.local || getEngine() !== 'cloud' || !hasAnyCloudKey()) {
      localTurn(current, lead);
      return;
    }
    setConversationContext(reverseContext(remaining, current.qa), { skipTurnTaking: true });
    setPhase('thinking');
    let nextHistory = trimHistory([...historyRef.current, { role: 'user', text: childSaid }], 20);
    const isRepeat = (q: string) => {
      const name = guessName(q);
      if (name) return current.rejected.some((r) => r === name);
      const key = questionKey(q);
      const norm = (t: string) => t.replace(/[\s?？]/g, '');
      return (key !== null && current.facts[key] !== undefined) || current.qa.some((x) => norm(x.q) === norm(q));
    };
    try {
      abortRef.current = new AbortController();
      let question: string | null = null;
      let emotion: EmotionCode = 'curious';
      // 놀이와 상관없는 말을 섞으면 한 번만 다시 부탁한다
      for (let attempt = 0; attempt < 2 && !question; attempt += 1) {
        const result = await think(character.name, nextHistory, { signal: abortRef.current.signal });
        if (!mountedRef.current) return;
        if (result.usedEngine !== 'cloud') {
          // AI가 막히면 박물관 카드로 이어 간다
          localTurn(current, lead);
          return;
        }
        const caring = result.reply.emotion === 'comfort' || result.reply.emotion === 'calm' || result.reply.emotion === 'scared';
        if (caring) {
          historyRef.current = [...nextHistory, { role: 'model', text: JSON.stringify(result.reply) }];
          setReverse(current);
          respond(result.reply);
          return;
        }
        question = pickYesNoQuestion(result.reply.speech);
        if (question && isRepeat(question)) question = null;
        emotion = result.reply.emotion;
        if (question) {
          // 기록에는 실제로 말한 질문만 남겨 다음 질문이 흐트러지지 않게 한다
          historyRef.current = [...nextHistory, { role: 'model', text: JSON.stringify({ emotion, speech: question }) }];
        } else {
          nextHistory = [...nextHistory, { role: 'model', text: JSON.stringify(result.reply) }, { role: 'user', text: REVERSE_RETRY_NOTE }];
        }
      }
      if (!question) {
        // 두 번 다 놀이에 맞지 않으면 박물관 카드로 이어 간다
        localTurn(current, lead);
        return;
      }
      const guessing = isGuessSpeech(question, emotion);
      setReverse({ ...current, status: guessing ? 'guessing' : 'asking', used: current.used + 1, pendingQ: question });
      respond({ emotion: 'idle', speech: lead + question });
    } catch {
      /* 화면을 떠나거나 놀이를 그만둠 */
    }
  };

  const handleReverseAnswer = (current: ActiveReverse, answer: ChildAnswer, said: string, lead = '') => {
    if (current.status === 'guessing' && answer === 'yes') {
      finishReverse(current, '맞혔다! 정말 재미있는 문제였어요. 왜 그 친구를 떠올렸어요?', 'proud');
      return;
    }
    const label = answer === 'yes' ? '네' : answer === 'no' ? '아니요' : '잘 모르겠어요';
    const q = current.pendingQ;
    const key = q ? questionKey(q) : null;
    const name = q && current.status === 'guessing' ? guessName(q) : null;
    let next: ActiveReverse = {
      ...current,
      qa: q ? [...current.qa, { q, a: said.trim() === label ? label : `${label} (${said.trim()})` }] : current.qa,
      facts: key && answer !== 'unknown' ? { ...current.facts, [key]: answer } : current.facts,
      rejected: name ? [...current.rejected, name] : current.rejected,
      pendingQ: null,
    };
    if (current.local) {
      if (current.status === 'guessing' && current.guessId) next = { ...next, local: removeCandidate(current.local, current.guessId), guessId: null };
      else if (current.localKey) next = { ...next, local: applyLocalAnswer(current.local, current.localKey, answer), localKey: null };
    }
    void friendTurn(next, said, lead);
  };

  const handleReverseInput = (said: string): boolean => {
    const current = reverse;
    if (!current || current.status === 'done') return false;
    setChildText(said);
    pushLog('child', said, 'curious', Date.now() - 1, true);

    if (current.status === 'prepare') {
      // 정답을 말해 버리지 않고 준비가 됐다고 하면 시작한다
      if (/생각|했어|했어요|떠올|됐어|다했|응|네|좋아|시작/.test(said.replace(/\s/g, ''))) {
        void friendTurn(current, '(다 떠올렸어요. 첫 질문을 해 주세요.)');
      } else {
        respond({ emotion: 'idle', speech: '쉿, 정답은 마음속에만 숨겨 둬요! 다 떠올렸으면 생각했어요 버튼을 눌러 줄래요?' });
      }
      return true;
    }
    if (current.status === 'choice') {
      const named = wantsToReveal(said) || wantsMoreQuestions(said) ? null : revealReaction(said);
      if (named) finishReverse(current, named, 'surprised');
      else if (wantsMoreQuestions(said)) continueAsking(current);
      else if (wantsToReveal(said)) askForReveal(current);
      else respond({ emotion: 'curious', speech: '질문을 더 해 볼까요, 정답을 알려 줄래요?' });
      return true;
    }
    if (current.status === 'reveal') {
      const named = revealReaction(said);
      if (named) {
        finishReverse(current, named, 'surprised');
      } else if (wantsMoreQuestions(said)) {
        continueAsking(current);
      } else if (current.revealTries < 1) {
        setReverse({ ...current, revealTries: current.revealTries + 1 });
        respond({ emotion: 'curious', speech: '음, 그 친구 이름을 말해 줄래요? 더 물어봐도 돼요.' });
      } else {
        finishReverse(current, '와, 정말 어려운 문제였어요! 다음에 또 내 줄래요?', 'surprised');
      }
      return true;
    }

    const answer = interpretAnswer(said, current.pendingQ ?? '');
    if (answer) {
      handleReverseAnswer(current, answer, said);
      return true;
    }
    // "아까 말했잖아요": 기억해 둔 대답으로 넘어간다
    if (recallsEarlier(said)) {
      const key = current.pendingQ ? questionKey(current.pendingQ) : null;
      const prior = key ? current.facts[key] : undefined;
      handleReverseAnswer(current, prior ?? 'unknown', said, '아, 맞다! 아까 말해 줬지요. ');
      return true;
    }
    // 네/아니요로 알아듣기 어려운 말
    if (needsCare(said) && (current.local || getEngine() !== 'cloud')) {
      respond(offlineReply(said, character.name));
    } else if (current.local || getEngine() !== 'cloud' || !hasAnyCloudKey()) {
      respond({ emotion: 'curious', speech: '아하! 그럼 네에 가까워요, 아니요에 가까워요?' });
    } else {
      // 온라인 AI는 자세한 대답을 그대로 듣고 다음 질문을 한다
      const q = current.pendingQ;
      void friendTurn({ ...current, qa: q ? [...current.qa, { q, a: said.trim() }] : current.qa, pendingQ: null }, said);
    }
    return true;
  };

  const quitReverse = () => {
    playPop();
    abortRef.current?.abort();
    setPhase((p) => (p === 'thinking' ? 'ready' : p));
    setReverse(null);
    setConversationContext('');
  };

  /** 버튼으로 대답 */
  const pressAnswer = (text: string) => {
    unlockAudio();
    playPop();
    if (phase === 'speaking') cancelSpeech();
    void handleChildUtterance(text);
  };

  useEffect(() => {
    gameInputRef.current = (said) => handleReverseInput(said) || handleQuizInput(said);
  });

  /* ---------------- 터치 상호작용 ---------------- */

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, textarea, a, form, [data-no-touch]')) return;
    unlockAudio();
    playTouchMelody(e.clientX / window.innerWidth);
    if (phase === 'ready' && friendText) {
      setPeek(true);
      if (peekTimer.current) window.clearTimeout(peekTimer.current);
      peekTimer.current = window.setTimeout(() => setPeek(false), 4000);
    }
  };

  const toggleFullscreen = async () => {
    playPop();
    if (!(await toggleScreen())) showNotice('이 기기에서는 전체 화면을 쓸 수 없어요.');
  };

  // 전체 화면은 갤러리로 돌아가도 그대로 둔다 (로비에서 켜고 끌 수 있다)
  const handleBack = () => {
    playPop();
    onBack();
  };

  const goDecorate = (photo?: Blob) => {
    unlockAudio();
    playPop();
    cancelSpeech();
    onDecorate({ ...character, ...(voice ? { voice } : {}) }, photo);
  };

  // 이 친구의 목소리로 말한다 (첫인사보다 먼저 정해 둔다)
  setVoiceProfile(voice ?? null);
  useEffect(() => () => setVoiceProfile(null), []);

  // 목소리를 바꾸면 조금 뒤에 저장한다
  const voiceSaved = useRef(character.voice);
  useEffect(() => {
    if (!voice || voice === voiceSaved.current) return;
    const timer = window.setTimeout(() => {
      voiceSaved.current = voice;
      saveCharacter({ ...character, voice }).catch((err: unknown) => console.error(err));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [voice, character]);

  const handleClearLogs = async () => {
    await clearChatLogs(character.id);
    setLogs([]);
  };


  const inGame = quiz !== null || reverse !== null || activeMission !== null;
  const mode = phase === 'speaking' ? 'talking' : 'idle';
  const statusLabel =
    phase === 'listening'
      ? '듣고 있어요... 🎧'
      : phase === 'thinking'
        ? activeMission?.status === 'checking'
          ? '사진을 보고 있어요 🔍'
          : '생각 중이에요 💭'
        : '';

  return (
    <div
      className="relative h-[100dvh] w-screen touch-manipulation overflow-hidden bg-cream"
      onPointerDown={handlePointerDown}
    >
      {!character.videos.idle && character.face ? (
        <PuppetFace ref={videoRef} posterUrl={decoratedUrl} face={character.face} mode={mode} videos={videoUrls} mouthGuard={inGame ? 150 : 190} />
      ) : (
        <>
          <DualVideoPlayer ref={videoRef} urls={videoUrls} mode={mode} posterUrl={decoratedUrl} />
          {character.decorations?.length ? <StickerOverlay posterUrl={posterUrl} decorations={character.decorations} /> : null}
        </>
      )}

      {videoSym && (
        <div className="pointer-events-none absolute right-[16%] top-[14%] z-[6] h-28 w-28 sm:h-36 sm:w-36" aria-hidden>
          <svg key={videoSym.id} viewBox="0 0 100 100" className="emo-symbol h-full w-full overflow-visible drop-shadow">
            <SymbolArt kind={videoSym.kind} />
          </svg>
        </div>
      )}

      {/* 가장자리 비네트 → 오버레이 가독성 */}
      <div className="pointer-events-none absolute inset-0 z-[5] bg-gradient-to-b from-black/20 via-transparent to-black/30" />


      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-30 h-full w-full" />

      {/* 상단 오버레이 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-start justify-between gap-3 p-3 sm:p-4">
        <button type="button" onClick={handleBack} className={`pointer-events-auto ${roundBtn} h-12 w-12 bg-white/80 text-cocoa`} aria-label="갤러리로" title="갤러리로">
          <ArrowLeft className="h-6 w-6" />
        </button>
        <div className="pointer-events-auto flex items-start gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => {
              unlockAudio();
              playPop();
              setMissionPanelOpen(true);
            }}
            className="glass-btn h-12 !bg-butter/90 sm:h-14 sm:!px-5 sm:!text-lg"
            title="미션 놀이"
          >
            <Search className="h-5 w-5" /> 미션
          </button>
          <button
            type="button"
            onClick={() => {
              unlockAudio();
              playPop();
              setQuizPanelOpen(true);
            }}
            className="glass-btn h-12 !bg-sky/90 sm:h-14 sm:!px-5 sm:!text-lg"
            title="문제 놀이"
          >
            <CircleHelp className="h-5 w-5" /> 문제
          </button>
          <button type="button" onClick={() => goDecorate()} className="glass-btn h-12 !bg-mint/90 sm:h-14 sm:!px-5 sm:!text-lg" title="자연물로 꾸미기">
            <Leaf className="h-5 w-5" /> 꾸미기
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                playPop();
                setAdultMenuOpen((v) => !v);
              }}
              className={`${roundBtn} h-12 w-12 bg-white/80 text-cocoa`}
              aria-label="어른 메뉴"
              aria-expanded={adultMenuOpen}
              title="어른 메뉴"
            >
              <MoreHorizontal className="h-6 w-6" />
            </button>
            {adultMenuOpen && (
              <>
                <div className="fixed inset-0 z-0" data-no-touch onPointerDown={() => setAdultMenuOpen(false)} />
                <div className="absolute right-0 top-14 z-10 flex w-48 animate-pop-in flex-col gap-1 rounded-3xl bg-white/95 p-2 shadow-soft" data-no-touch>
                  <button
                    type="button"
                    onClick={() => {
                      playPop();
                      setAdultMenuOpen(false);
                      setReportOpen(true);
                    }}
                    className="flex items-center gap-2 rounded-2xl px-3 py-2.5 text-left font-cute text-lg hover:bg-cream"
                  >
                    <NotebookPen className="h-5 w-5" /> 마음 리포트
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      playPop();
                      setAdultMenuOpen(false);
                      cancelSpeech();
                      setVoiceOpen(true);
                    }}
                    className="flex items-center gap-2 rounded-2xl px-3 py-2.5 text-left font-cute text-lg hover:bg-cream"
                  >
                    <AudioLines className="h-5 w-5" /> 친구 목소리
                  </button>
                  {document.fullscreenEnabled && (
                    <button
                      type="button"
                      onClick={() => {
                        setAdultMenuOpen(false);
                        void toggleFullscreen();
                      }}
                      className="flex items-center gap-2 rounded-2xl px-3 py-2.5 text-left font-cute text-lg hover:bg-cream"
                    >
                      {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                      {fullscreen ? '전체 화면 끝내기' : '전체 화면'}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {notice && (
        <div className="absolute inset-x-0 top-20 z-40 flex justify-center px-4 sm:top-24" data-no-touch>
          <p className="animate-pop-in rounded-full bg-white/90 px-5 py-2.5 text-center font-cute text-lg text-cocoa shadow-soft backdrop-blur">
            {notice}
          </p>
        </div>
      )}

      {/* 하단 오버레이: 말풍선 + 마이크 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex flex-col items-center gap-3 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {(phase === 'listening' || phase === 'thinking') && childText && (
          <p className={`animate-pop-in rounded-3xl rounded-br-md bg-sky/90 px-5 py-2.5 text-center text-lg shadow-soft backdrop-blur ${inGame ? 'max-w-xl sm:max-w-[calc(100%-23rem)] lg:max-w-xl' : 'max-w-xl'}`}>
            {childText}
          </p>
        )}
        {(phase === 'speaking' || phase === 'ready') && friendText && (
          <p
            key={friendText}
            className={`animate-pop-in bg-white/75 text-center font-cute leading-snug text-cocoa shadow-soft backdrop-blur transition-opacity duration-700 ${
              phase === 'speaking' || peek ? 'opacity-100' : 'opacity-0'
            } ${
              inGame ? 'max-w-xl rounded-3xl px-4 py-1.5 text-base sm:max-w-[calc(100%-23rem)] sm:text-lg lg:max-w-xl' : 'max-w-xl rounded-3xl px-5 py-2 text-lg sm:text-xl'
            }`}
          >
            {friendText}
          </p>
        )}
        {statusLabel && (
          <p className="flex items-center gap-2 rounded-full bg-black/30 px-4 py-1.5 font-cute text-white backdrop-blur">
            {phase === 'thinking' && <Loader2 className="h-4 w-4 animate-spin" />}
            {statusLabel}
          </p>
        )}

        {typing && (
          <form onSubmit={submitDraft} className="pointer-events-auto flex w-full max-w-md gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="친구에게 하고 싶은 말"
              className="input-storybook flex-1 border-white/80 bg-white/90 py-2.5 backdrop-blur"
              maxLength={200}
            />
            <button
              type="submit"
              disabled={phase === 'thinking' || !draft.trim()}
              className="btn-storybook bg-mint px-4"
              aria-label="보내기"
            >
              <Send className="h-5 w-5" />
            </button>
          </form>
        )}

        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3">
          {/* 내가 문제 내기: 대답 버튼은 마이크 양옆에 둬서 얼굴을 가리지 않는다 */}
          <div className="pointer-events-auto flex justify-end">
            {activeMission?.status === 'searching' && (
              <button type="button" onClick={openCamera} className="btn-storybook bg-mint px-4 py-3 text-lg lg:px-6 lg:text-2xl">
                <Camera className="h-6 w-6" /> 찾았어요!
              </button>
            )}
            {activeMission?.status === 'retry' && (
              <button type="button" onClick={openCamera} className="btn-storybook bg-mint px-4 py-3 text-lg lg:px-6 lg:text-2xl">
                <Camera className="h-6 w-6" /> 다시 찍기
              </button>
            )}
            {activeMission?.status === 'adult' && (
              <button type="button" onClick={() => adultConfirm(true)} className="btn-storybook bg-mint px-5 py-3 text-lg lg:px-6 lg:text-2xl">
                <Check className="h-6 w-6" /> 맞아요
              </button>
            )}
            {activeMission?.status === 'done' && (
              <button type="button" onClick={() => startMission(null)} className="btn-storybook bg-butter px-4 py-3 text-lg lg:px-6 lg:text-2xl">
                <Dices className="h-6 w-6" /> 다음 미션
              </button>
            )}
            {reverse?.status === 'prepare' && (
              <button type="button" disabled={phase === 'thinking'} onClick={() => pressAnswer('생각했어요')} className="btn-storybook bg-butter px-4 py-3 text-lg lg:text-xl">
                <Check className="h-6 w-6" /> 생각했어요!
              </button>
            )}
            {reverse?.status === 'choice' && (
              <button type="button" disabled={phase === 'thinking'} onClick={() => pressAnswer('더 물어봐')} className="btn-storybook bg-mint px-4 py-3 text-lg lg:px-6 lg:text-2xl">
                <CircleHelp className="h-6 w-6" /> 더 물어봐요
              </button>
            )}
            {(reverse?.status === 'asking' || reverse?.status === 'guessing') && (
              <button type="button" disabled={phase === 'thinking'} onClick={() => pressAnswer('네')} className="btn-storybook bg-mint px-6 py-3 text-xl lg:px-8 lg:text-2xl">
                <Check className="h-6 w-6" /> 네
              </button>
            )}
          </div>
          <div className="pointer-events-auto relative">
            {phase === 'listening' && (
              <>
                <span className="absolute inset-0 animate-pulse-ring rounded-full bg-blush" />
                <span
                  className="absolute inset-0 animate-pulse-ring rounded-full bg-blush"
                  style={{ animationDelay: '0.7s' }}
                />
              </>
            )}
            <button
              type="button"
              onClick={toggleMic}
              disabled={phase === 'thinking'}
              aria-label={phase === 'listening' ? '그만 듣기' : '말하기'}
              className={`relative flex items-center justify-center rounded-full border-[6px] border-white shadow-storybook transition-all duration-200 active:scale-90 disabled:opacity-60 ${
                inGame ? 'h-20 w-20' : 'h-24 w-24 sm:h-28 sm:w-28'
              } ${
                phase === 'listening' ? 'scale-110 bg-blush' : 'bg-butter hover:scale-105'
              }`}
            >
              {phase === 'thinking' ? (
                <Loader2 className="h-11 w-11 animate-spin text-cocoa" />
              ) : phase === 'listening' ? (
                <MicOff className="h-11 w-11 text-white" />
              ) : (
                <Mic className="h-11 w-11 text-cocoa" />
              )}
            </button>
          </div>
          <div className="pointer-events-auto flex items-center gap-3">
            {activeMission?.status === 'adult' && (
              <button type="button" onClick={() => adultConfirm(false)} className="btn-storybook bg-white px-4 py-3 text-base lg:text-xl">
                <Search className="h-5 w-5" /> 다시 찾아봐요
              </button>
            )}
            {reverse?.status === 'choice' && (
              <button type="button" disabled={phase === 'thinking'} onClick={() => pressAnswer('정답 알려 줄게')} className="btn-storybook bg-white px-4 py-3 text-base lg:text-xl">
                <Lightbulb className="h-5 w-5" /> 알려 줄게요
              </button>
            )}
            {(reverse?.status === 'asking' || reverse?.status === 'guessing') && (
              <button type="button" disabled={phase === 'thinking'} onClick={() => pressAnswer('아니요')} className="btn-storybook bg-blush px-4 py-3 text-xl lg:px-6 lg:text-2xl">
                <X className="h-6 w-6" /> 아니요
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                playPop();
                setTyping((v) => !v);
              }}
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-soft backdrop-blur transition active:scale-90 ${
                typing ? 'bg-white text-blush' : 'bg-white/60 text-cocoa'
              }`}
              aria-label="글자로 말하기"
            >
              <Keyboard className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {activeMission && (
        <MissionDock
          mission={activeMission.mission}
          status={activeMission.status}
          photo={activeMission.photo}
          adultReason={activeMission.adultReason}
          onNext={() => startMission(null)}
          onAskAdult={() => askAdult(activeMission, activeMission.photo, activeMission.image, '')}
          onQuit={quitMission}
        />
      )}

      {quiz && (
        <QuizDock
          card={quiz.card}
          finished={quiz.finished}
          used={quiz.used}
          asked={quiz.asked}
          options={quiz.options}
          hintsLeft={quiz.hintIndex < quiz.card.hints.length}
          disabled={phase === 'thinking'}
          onAsk={pressAnswer}
          onHint={() => {
            playPop();
            giveHint(quiz);
          }}
          onOpenOptions={() => {
            playPop();
            openOptions(quiz, '좋아요, 골라 볼까요? ');
          }}
          onPick={pickOption}
          onNext={() => startQuiz(quiz.group, quiz.card.id)}
          onQuit={quitQuiz}
        />
      )}

      {reverse && (
        <ReverseDock
          status={reverse.status}
          used={reverse.used}
          limit={reverse.limit}
          disabled={phase === 'thinking'}
          onUnknown={() => pressAnswer('잘 모르겠어요')}
          onAgain={startReverse}
          onQuit={quitReverse}
        />
      )}

      {/* 태블릿 뒷면 카메라를 바로 연다 */}
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void handlePhoto(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      <QuizPanel
        open={quizPanelOpen}
        onClose={() => setQuizPanelOpen(false)}
        solved={solved}
        onStartReverse={startReverse}
        onStartQuiz={(group) => startQuiz(group)}
        onReset={() => {
          const empty = new Set<string>();
          setSolved(empty);
          saveSolved(character.id, empty);
        }}
      />

      <MissionPanel
        open={missionPanelOpen}
        onClose={() => setMissionPanelOpen(false)}
        missions={missions}
        finds={finds}
        aiCheck={aiCheck}
        onToggleAiCheck={(on) => {
          setAiCheck(on);
          setAiCheckEnabled(on);
        }}
        onStart={startMission}
        onAddCustom={(title, hint) => setMissions(addCustomMission(title, hint, createId()))}
        onRemoveCustom={(id) => setMissions(removeCustomMission(id))}
        onDeleteFind={(id) => {
          setFinds((prev) => prev.filter((f) => f.id !== id));
          deleteMissionFind(id).catch((err: unknown) => console.error(err));
        }}
        onDecorateWith={(photo) => {
          setMissionPanelOpen(false);
          goDecorate(photo);
        }}
        onReset={() => {
          setFinds([]);
          clearMissionFinds(character.id).catch((err: unknown) => console.error(err));
        }}
      />

      <Modal open={voiceOpen} onClose={() => setVoiceOpen(false)} wide title={`${character.name}의 목소리`} icon={<AudioLines className="h-6 w-6" />}>
        <VoicePicker value={voice} onChange={setVoice} friendName={character.name} />
      </Modal>

      <MindReport
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        finds={finds}
        logs={logs}
        characterName={character.name}
        onClear={() => void handleClearLogs()}
      />
    </div>
  );
}
