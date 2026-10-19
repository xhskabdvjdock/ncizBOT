import { db } from "@/server/db";
import { parseEventConfig } from "./engine/engine";
import { computeTeamScores, type StandingRow } from "@/core/scoring";

/**
 * لقطة حالة فعالية للوحة التحكم الحي — بيانات فعلية من قاعدة البيانات فقط.
 * لا تُكشف الإجابة الصحيحة في السؤال الجاري.
 */

export type AnswerFeedItem = {
  username: string;
  round: number;
  outcome: string;
  points: number;
  bonus: number;
  content?: string;
  at: string;
};

export type OutboxItem = {
  id: string;
  kind: string;
  content: string;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
};

export type LeaderboardRow = {
  rank: number;
  username: string;
  team: string | null;
  score: number;
  correct: number;
};

export type ActivityItem = { ts: string; source: "BOT" | "SYSTEM"; text: string };

export type EventSnapshot = {
  event: {
    id: string;
    name: string;
    type: string;
    status: string;
    simulation: boolean;
    commands: Record<string, string>;
    startedAt: string | null;
    endedAt: string | null;
    registrationOpenedAt: string | null;
    registrationClosesAt: string | null;
    scheduledStartAt: string | null;
    currentRoundIndex: number;
    currentRoundEndsAt: string | null;
    currentRoundRemainingMs: number | null;
    roundTotal: number;
    paused: boolean;
    winnerParticipantId: string | null;
    winnerUsername: string | null;
    winnerTeamName: string | null;
    resultOutcome: string | null;
  };
  serverNow: string;
  counts: { active: number; answers: number };
  leaderboard: LeaderboardRow[];
  teams: { key: string; label: string; score: number; members: number }[] | null;
  currentQuestion: {
    index: number;
    prompt: string;
    options: string[];
    points: number;
    speedBonus: number;
    timeLimitSec: number;
  } | null;
  recentAnswers: AnswerFeedItem[];
  outbox: OutboxItem[];
  activity: ActivityItem[];
};

export async function buildEventSnapshot(eventId: string): Promise<EventSnapshot | null> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: { channel: true },
  });
  if (!event) return null;
  const config = parseEventConfig(event);
  const serverNow = new Date();

  const [
    activeCount,
    answersCount,
    roundTotal,
    participants,
    recent,
    outbox,
    auditRows,
  ] = await Promise.all([
    db.participant.count({ where: { eventId, status: "ACTIVE" } }),
    db.answer.count({ where: { eventId, outcome: { in: ["CORRECT", "WRONG"] } } }),
    db.question.count({ where: { eventId } }),
    db.participant.findMany({ where: { eventId, status: "ACTIVE" }, orderBy: { score: "desc" } }),
    db.answer.findMany({
      where: { eventId, outcome: { in: ["CORRECT", "WRONG"] } },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: { participant: true },
    }),
    db.outboxMessage.findMany({
      where: { eventId },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    db.auditLog.findMany({
      where: { eventId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const rankedNames = new Map(participants.map((p) => [p.id, p.kickUsername]));

  // ترتيب هادئ: نقاط تنازلي ثم زمان الانضمام ثم الاسم (ثابت العرض)
  const sorted = [...participants].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.joinedAt.getTime() !== b.joinedAt.getTime()) return a.joinedAt.getTime() - b.joinedAt.getTime();
    return a.kickUsername.localeCompare(b.kickUsername, "ar");
  });

  const leaderboard: LeaderboardRow[] = sorted.map((p, i) => ({
    rank: i + 1,
    username: p.kickUsername,
    team: p.teamName,
    score: p.score,
    correct: p.correctCount,
  }));

  let teams: { key: string; label: string; score: number; members: number }[] | null = null;
  if (event.type === "TEAM_BATTLE") {
    const rows: StandingRow[] = sorted.map((p) => ({
      participantId: p.id,
      username: p.kickUsername,
      team: p.teamName,
      score: p.score,
      correctCount: p.correctCount,
      attempts: p.totalAttempts,
      joinedAt: p.joinedAt.toISOString(),
      roundWins: 0,
    }));
    teams = computeTeamScores(
      rows,
      config.team.teams.map((t) => ({ key: t.key, label: t.label })),
    );
  }

  let currentQuestion: EventSnapshot["currentQuestion"] = null;
  if (
    event.status === "RUNNING" &&
    event.currentRoundIndex >= 0 &&
    (event.currentRoundEndsAt != null || event.currentRoundRemainingMs != null)
  ) {
    const q = await db.question.findUnique({
      where: { eventId_index: { eventId, index: event.currentRoundIndex } },
    });
    if (q) {
      currentQuestion = {
        index: q.index,
        prompt: q.prompt,
        options: q.options ? (JSON.parse(q.options) as string[]) : [],
        points: q.points,
        speedBonus: q.speedBonus,
        timeLimitSec: q.timeLimitSec,
      };
    }
  }

  const recentAnswers: AnswerFeedItem[] = recent.map((a) => ({
    username: a.participant.kickUsername,
    round: a.roundIndex + 1,
    outcome: a.outcome,
    points: a.pointsAwarded,
    bonus: a.speedBonus,
    content: a.outcome === "CORRECT" || a.outcome === "WRONG" ? a.content : undefined,
    at: a.createdAt.toISOString(),
  }));

  const outboxItems: OutboxItem[] = outbox.map((m) => ({
    id: m.id,
    kind: m.kind,
    content: m.content,
    status: m.status,
    attempts: m.attempts,
    lastError: m.lastError,
    createdAt: m.createdAt.toISOString(),
    sentAt: m.sentAt ? m.sentAt.toISOString() : null,
  }));

  const activity: ActivityItem[] = [
    ...outboxItems.map((m) => ({
      ts: m.createdAt,
      source: "BOT" as const,
      text: `${outboxKindLabel(m.kind)} ${m.status === "SENT" ? "— أُرسلت" : m.status === "BLOCKED" ? "— محفوظة (لا اتصال)" : m.status === "FAILED" ? "— فشل الإرسال" : ""}`,
    })),
    ...auditRows.map((a) => ({
      ts: a.createdAt.toISOString(),
      source: "SYSTEM" as const,
      text: auditActionLabel(a.action),
    })),
  ].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, 15);

  return {
    event: {
      id: event.id,
      name: event.name,
      type: event.type,
      status: event.status,
      simulation: event.simulation,
      commands: {
        join: event.registrationCommand,
        leave: event.leaveCommand,
        answer: event.answerCommand,
        team: event.teamCommand,
        score: event.scoreCommand,
        help: event.helpCommand,
        info: event.eventCommand,
      },
      startedAt: event.startedAt?.toISOString() ?? null,
      endedAt: event.endedAt?.toISOString() ?? null,
      registrationOpenedAt: event.registrationOpenedAt?.toISOString() ?? null,
      registrationClosesAt: event.registrationClosesAt?.toISOString() ?? null,
      scheduledStartAt: event.scheduledStartAt?.toISOString() ?? null,
      currentRoundIndex: event.currentRoundIndex,
      currentRoundEndsAt: event.currentRoundEndsAt?.toISOString() ?? null,
      currentRoundRemainingMs: event.currentRoundRemainingMs,
      roundTotal,
      paused: event.currentRoundEndsAt == null && event.currentRoundRemainingMs != null && event.status === "RUNNING",
      winnerParticipantId: event.winnerParticipantId,
      winnerUsername: event.winnerParticipantId ? rankedNames.get(event.winnerParticipantId) ?? null : null,
      winnerTeamName: event.winnerTeamName,
      resultOutcome: event.resultOutcome,
    },
    serverNow: serverNow.toISOString(),
    counts: { active: activeCount, answers: answersCount },
    leaderboard,
    teams,
    currentQuestion,
    recentAnswers,
    outbox: outboxItems,
    activity,
  };
}

export function outboxKindLabel(kind: string): string {
  const map: Record<string, string> = {
    REG_OPEN: "إعلان التسجيل:",
    EVENT_START: "بداية الفعالية:",
    QUESTION: "سؤال:",
    ROUND_RESULT: "نتيجة جولة:",
    WINNER: "إعلان النتيجة:",
    CANCELLED: "إلغاء:",
    PAUSED: "توقف مؤقت:",
    INFO_REPLY: "رد معلومات:",
  };
  return map[kind] ?? "رسالة:";
}

export function auditActionLabel(action: string): string {
  const map: Record<string, string> = {
    EVENT_CREATE: "أُنشئت الفعالية",
    EVENT_DRAFT_UPDATE: "عُدّلت المسودة",
    EVENT_DELETE_DRAFT: "حُذفت مسودة",
    EVENT_CANCEL: "أُلغيت الفعالية",
    EVENT_FINISH: "أُنهيت الفعالية",
    EVENT_PAUSE: "توقف مؤقت",
    EVENT_RESUME: "استئناف",
    EVENT_ROUND_ADVANCE: "تقدّمت الجولة يدويًا",
    PARTICIPANT_REMOVE: "أُزيل مشارك يدويًا",
    KICK_CONNECT: "اتصال Kick",
    KICK_DISCONNECT: "فصل Kick",
    KICK_HEALTH_CHECK: "فحص اتصال",
    KICK_SUBSCRIBE: "إنشاء اشتراك مزامنة",
    SETTINGS_UPDATE: "تحديث إعدادات",
  };
  return map[action] ?? action;
}
