import { db } from "@/server/db";
import { publish } from "@/server/realtime";
import { audit } from "@/server/audit";
import { DomainError, type EventStatus, type EventAction, EVENT_TYPES } from "@/core/states";
import { eventConfigSchema, type EventConfig, type EventDraftInput, type QuestionInput } from "@/core/config";
import { DEFAULT_MESSAGES, KICK_MAX_CHARS, graphemeLength, renderTemplate, optionsLine } from "@/core/messages";
import { rankStandings, computeResult, computeTeamScores, type StandingRow } from "@/core/scoring";
import { answerDisplay } from "@/core/grading";
import type { Event, OutboxMessage } from "@prisma/client";

/** أنواع الرسائل الصادرة (سجل صندوق الرسائل) */
export type OutboxKind =
  | "REG_OPEN"
  | "EVENT_START"
  | "QUESTION"
  | "ROUND_RESULT"
  | "WINNER"
  | "CANCELLED"
  | "PAUSED"
  | "INFO_REPLY";

type ParsedEvent = {
  parsed: EventConfig;
};

export type EventWithConfig = Event & ParsedEvent;

export function parseEventConfig(event: Event): EventConfig {
  let raw: unknown = {};
  try {
    raw = JSON.parse(event.config || "{}");
  } catch {
    raw = {};
  }
  const parsed = eventConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : eventConfigSchema.parse({});
}

export function withParsedConfig(event: Event): EventWithConfig {
  return Object.assign(event, { parsed: parseEventConfig(event) });
}

export async function loadEventFull(eventId: string): Promise<Event> {
  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event) throw new DomainError("الفعالية غير موجودة", "NOT_FOUND", 404);
  return event;
}

function publishEvent(eventId: string, channelId: string): void {
  publish(channelId, eventId, { kind: "refresh" });
}

/**
 * إدراج إعلان في صندوق الرسائل مع التنقية والحدود.
 * القوالب بأكملها من إعداد الفعالية مع بدائل افتراضية عربية.
 */
export async function announce(
  event: EventWithConfig,
  kind: OutboxKind,
  templateKey: keyof EventConfig["messages"] | null,
  vars: Record<string, string | number | null | undefined>,
  extra: { contentOverride?: string } = {},
): Promise<OutboxMessage | null> {
  const fallback = templateKey ? DEFAULT_MESSAGES[templateKey] : "";
  let content: string;
  if (extra.contentOverride !== undefined) {
    content = extra.contentOverride;
  } else {
    content = renderTemplate(
      templateKey ? event.parsed.messages[templateKey] ?? null : null,
      fallback,
      vars,
    );
  }
  if (!content.trim()) return null;
  if (graphemeLength(content) > KICK_MAX_CHARS) return null; // دفاعية (renderTemplate مصغّرة أصلاً)
  return db.outboxMessage.create({
    data: {
      channelId: event.channelId,
      eventId: event.id,
      kind,
      content,
    },
  });
}

/* ─────────────────────────────────────────────
   قفل الانتقالات — يمنع الأفعال المتزامنة بفضل الحساسية للحالة
   ───────────────────────────────────────────── */

export async function transitionEvent(
  eventId: string,
  from: EventStatus,
  patch: { status: EventStatus } & Record<string, unknown>,
): Promise<boolean> {
  const res = await db.event.updateMany({
    where: { id: eventId, status: from },
    data: { version: { increment: 1 }, ...patch },
  });
  return res.count === 1;
}

/** قيود تخص اثنتين من الفعاليات النشطة لقناة واحدة (حالة توضيحية). */
async function assertNoOtherActiveEvent(channelId: string, excludeEventId?: string) {
  const count = await db.event.count({
    where: {
      channelId,
      id: excludeEventId ? { not: excludeEventId } : undefined,
      status: { in: ["REG_OPEN", "RUNNING"] },
    },
  });
  if (count > 0) {
    throw new DomainError(
      "توجد فعالية نشطة في القناة بالفعل (تسجيل أو بث مباشر)",
      "CONFLICT",
      409,
    );
  }
}

/* ─────────────────────────────────────────────
   إنشاء / تعديل مسودة
   ───────────────────────────────────────────── */

function questionsValidation(qs: QuestionInput[], type: EventDraftInput["type"]): string[] {
  const issues: string[] = [];
  if (!EVENT_TYPES.includes(type)) issues.push("نوع الفعالية غير معروف");
  if (qs.length === 0) issues.push("أضف سؤالًا واحدًا على الأقل");
  qs.forEach((q, i) => {
    if (!q.prompt.trim()) issues.push(`السؤال ${i + 1}: النص فارغ`);
    if (q.options && q.options.length < 2) {
      issues.push(`السؤال ${i + 1}: الخيارات أقل من اثنين`);
    }
    if (q.correctAnswers.length === 0) {
      issues.push(`السؤال ${i + 1}: لا توجد إجابة صحيحة محددة`);
    }
    if (q.timeLimitSec < 5) issues.push(`السؤال ${i + 1}: حد الزمن قصير جدًا (5 ثوانٍ أصغر حد)`);
  });
  return issues;
}

export async function createEvent(input: {
  channelId: string;
  userId: string;
  draft: EventDraftInput;
  action: "SAVE_DRAFT" | "PREPARE" | "START";
}): Promise<Event> {
  const draft = input.draft;
  const channel = await db.channel.findUnique({ where: { id: input.channelId } });
  if (!channel) throw new DomainError("القناة غير موجودة", "NOT_FOUND", 404);
  if (channel.kind === "KICK") {
    const state = await db.connectionState.findUnique({ where: { channelId: input.channelId } });
    if (!state || state.status === "NOT_CONNECTED") {
      // ليست منعًا: يمكن إعداد الفعالية للقناة المتصلة لاحقًا؛ لكن البدء الحقيقي يتطلب اتصالًا
      if (input.action === "START") {
        throw new DomainError(
          "لا يمكن البدء الآن: قناة Kick غير متصلة. أصل الاتصال من صفحة ربط Kick أو احفظ الفعالية من دون بدء.",
          "INVALID_STATE",
          409,
        );
      }
    }
  }

  const issues = questionsValidation(draft.questions, draft.type);
  if (input.action !== "SAVE_DRAFT" && issues.length > 0) {
    throw new DomainError(
      `الإعداد ناقص: ${issues.join("؛ ")}`,
      "VALIDATION",
      422,
    );
  }

  if (input.action === "START" || input.action === "PREPARE") {
    await assertNoOtherActiveEvent(input.channelId);
  }

  const event = await db.event.create({
    data: {
      channelId: input.channelId,
      name: draft.name,
      description: draft.description,
      type: draft.type,
      status: "DRAFT",
      registrationCommand: draft.commands.registration,
      leaveCommand: draft.commands.leave,
      answerCommand: draft.commands.answer,
      teamCommand: draft.commands.team,
      scoreCommand: draft.commands.score,
      helpCommand: draft.commands.help,
      eventCommand: draft.commands.eventInfo,
      config: JSON.stringify(draft.config),
      simulation: draft.simulation,
      questions: {
        create: draft.questions.map((q, i) => ({
          index: i,
          prompt: q.prompt,
          options: q.options ? JSON.stringify(q.options) : null,
          correctAnswers: JSON.stringify(q.correctAnswers),
          timeLimitSec: q.timeLimitSec,
          points: q.points,
          speedBonus: q.speedBonus,
          explanation: q.explanation,
        })),
      },
    },
    include: { questions: true },
  });

  if (input.action === "PREPARE" || input.action === "START") {
    await db.event.update({ where: { id: event.id }, data: { status: "READY" } });
  }
  if (input.action === "START") {
    const full = withParsedConfig({ ...event, status: "READY" });
    await startRegisteredFlow(full);
  }
  await audit({
    channelId: input.channelId,
    userId: input.userId,
    eventId: event.id,
    action: "EVENT_CREATE",
    detail: { name: draft.name, type: draft.type, action: input.action },
  });
  publishEvent(event.id, input.channelId);
  return event;
}

export async function updateDraft(eventId: string, draft: EventDraftInput, userId: string): Promise<Event> {
  const event = await loadEventFull(eventId);
  if (event.status !== "DRAFT") {
    throw new DomainError("تعديل مسموح في المسودة فقط", "INVALID_STATE");
  }
  await db.question.deleteMany({ where: { eventId } });
  const updated = await db.event.update({
    where: { id: eventId },
    data: {
      name: draft.name,
      description: draft.description,
      type: draft.type,
      registrationCommand: draft.commands.registration,
      leaveCommand: draft.commands.leave,
      answerCommand: draft.commands.answer,
      teamCommand: draft.commands.team,
      scoreCommand: draft.commands.score,
      helpCommand: draft.commands.help,
      eventCommand: draft.commands.eventInfo,
      config: JSON.stringify(draft.config),
      simulation: draft.simulation,
      questions: {
        create: draft.questions.map((q, i) => ({
          index: i,
          prompt: q.prompt,
          options: q.options ? JSON.stringify(q.options) : null,
          correctAnswers: JSON.stringify(q.correctAnswers),
          timeLimitSec: q.timeLimitSec,
          points: q.points,
          speedBonus: q.speedBonus,
          explanation: q.explanation,
        })),
      },
    },
    include: { questions: true },
  });
  await audit({
    channelId: event.channelId,
    userId,
    eventId,
    action: "EVENT_DRAFT_UPDATE",
    detail: { name: draft.name },
  });
  publishEvent(eventId, event.channelId);
  return updated;
}

export async function deleteDraft(eventId: string, userId: string): Promise<void> {
  const event = await loadEventFull(eventId);
  if (event.status !== "DRAFT") {
    throw new DomainError("الحذف مسموح في المسودة فقط", "INVALID_STATE");
  }
  await db.event.delete({ where: { id: eventId } });
  await audit({
    channelId: event.channelId,
    userId,
    eventId,
    action: "EVENT_DELETE_DRAFT",
    detail: { name: event.name },
  });
  publishEvent(eventId, event.channelId);
}

/* ─────────────────────────────────────────────
   أفعال دورة الحياة
   ───────────────────────────────────────────── */

/** شروط بدء فعالية منتظمًا. */
async function assertStartEligibility(
  event: EventWithConfig,
  activeCount: number,
): Promise<string[]> {
  const issues: string[] = [];
  const min = event.parsed.participation.minParticipants;
  if (min != null && activeCount < min) {
    issues.push(`الحد الأدنى للمشاركين ${min} لم يتحقق (النشط الحالي ${activeCount})`);
  }
  if (event.type === "TEAM_BATTLE" && event.parsed.team.teams.length < 2) {
    issues.push("مواجهة الفرق تحتاج تعريف فريقين");
  }
  const total = await questionsTotal(event.id);
  if (total < 1) issues.push("لا توجد أسئلة محفوظة");
  return issues;
}

async function questionsTotal(eventId: string): Promise<number> {
  return db.question.count({ where: { eventId } });
}

/** مسار البدء المعياري: فتح التسجيل → ثم البداية بعد استقرار التسجيل أو فعل صريح. */
async function startRegisteredFlow(event: EventWithConfig): Promise<void> {
  await transitionEvent(event.id, "READY" as EventStatus, {
    status: "REG_OPEN" as EventStatus,
    registrationOpenedAt: new Date(),
    registrationClosesAt: null,
  });
  const fresh = await loadEventFull(event.id);
  const full = withParsedConfig(fresh);
  const count = await db.participant.count({ where: { eventId: event.id, status: "ACTIVE" } });
  await announce(full, "REG_OPEN", "regOpen", {
    event: full.name,
    type: typeLabel(full.type),
    join: full.registrationCommand,
    slots: slotsFor(full.parsed, count),
  });
  publishEvent(event.id, full.channelId);
}

export function typeLabel(type: string): string {
  switch (type) {
    case "QUIZ": return "أسئلة مباشرة";
    case "SPEED": return "تحدي سرعة";
    case "TEAM_BATTLE": return "مواجهة فرق";
    default: return type;
  }
}

function slotsFor(config: EventConfig, count: number): string {
  const max = config.participation.maxParticipants;
  if (max == null) return "";
  const left = Math.max(0, max - count);
  return left > 0 ? `تبقّى ${left} مكانًا.` : "";
}

export async function performAction(
  eventId: string,
  userId: string | null,
  action: EventAction,
): Promise<Event> {
  const before = await loadEventFull(eventId);
  const event = withParsedConfig(before);

  switch (action) {
    case "PREPARE": {
      const questions = await db.question.findMany({
        where: { eventId },
        orderBy: { index: "asc" },
      });
      const inputs: QuestionInput[] = questions.map((q) => ({
        prompt: q.prompt,
        options: q.options ? (JSON.parse(q.options) as string[]) : null,
        correctAnswers: JSON.parse(q.correctAnswers) as string[],
        timeLimitSec: q.timeLimitSec,
        points: q.points,
        speedBonus: q.speedBonus,
        explanation: q.explanation,
      }));
      const issues = questionsValidation(inputs, event.type as EventDraftInput["type"]);
      if (issues.length > 0) {
        throw new DomainError(`الإعداد ناقص: ${issues.join("؛ ")}`, "VALIDATION", 422);
      }
      await assertNoOtherActiveEvent(event.channelId, event.id);
      const moved = await transitionEvent(eventId, "DRAFT", { status: "READY" });
      if (!moved) throw conflict(eventId);
      break;
    }
    case "PREPARE_EDIT": {
      const moved = await transitionEvent(eventId, "READY", { status: "DRAFT" });
      if (!moved) throw conflict(eventId);
      break;
    }
    case "OPEN_REGISTRATION": {
      await assertNoOtherActiveEvent(event.channelId, event.id);
      const from = event.status as EventStatus;
      const moved = await transitionEvent(eventId, from, {
        status: "REG_OPEN",
        registrationOpenedAt: new Date(),
        registrationClosesAt: event.parsed.autoCloseRegistrationSec
          ? new Date(Date.now() + event.parsed.autoCloseRegistrationSec * 1000)
          : null,
      } as never);
      if (!moved) throw conflict(eventId);
      const fresh = withParsedConfig(await loadEventFull(eventId));
      const count = await db.participant.count({ where: { eventId, status: "ACTIVE" } });
      await announce(fresh, "REG_OPEN", "regOpen", {
        event: fresh.name,
        type: typeLabel(fresh.type),
        join: fresh.registrationCommand,
        slots: slotsFor(fresh.parsed, count),
      });
      break;
    }
    case "CLOSE_REGISTRATION": {
      const moved = await transitionEvent(eventId, "REG_OPEN", {
        status: "REG_CLOSED",
        registrationClosesAt: new Date(),
      });
      if (!moved) throw conflict(eventId);
      const fresh = withParsedConfig(await loadEventFull(eventId));
      const count = await db.participant.count({ where: { eventId, status: "ACTIVE" } });
      await announce(fresh, "EVENT_START", "registrationClosed", {
        event: fresh.name,
        count,
      });
      break;
    }
    case "START": {
      await assertNoOtherActiveEvent(event.channelId, event.id);
      const activeCount = await db.participant.count({
        where: { eventId, status: "ACTIVE" },
      });
      const issues = await assertStartEligibility(event, activeCount);
      if (issues.length > 0) {
        throw new DomainError(issues.join("؛ "), "VALIDATION", 422);
      }
      // إغلاق التسجيل ضمنيًا عند البدء من فتح/مغلق
      const fromStatus =
        event.status === "READY" ? "READY" : event.status === "REG_OPEN" ? "REG_OPEN" : "REG_CLOSED";
      const moved = await transitionEvent(eventId, fromStatus as EventStatus, {
        status: "RUNNING",
        registrationClosesAt: event.status === "REG_OPEN" ? new Date() : event.registrationClosesAt,
        startedAt: new Date(),
        currentRoundIndex: -1,
      });
      if (!moved) throw conflict(eventId);
      const fresh = withParsedConfig(await loadEventFull(eventId));
      await announce(fresh, "EVENT_START", "eventStart", {
        event: fresh.name,
        participants: activeCount,
        rounds: await db.question.count({ where: { eventId } }),
      });
      await startRoundInternal(fresh, 0);
      break;
    }
    case "FINISH": {
      await finalizeEvent(eventId, userId, "finished_early");
      break;
    }
    case "CANCEL": {
      const moved = await transitionEvent(eventId, event.status as EventStatus, {
        status: "CANCELLED",
        cancelledAt: new Date(),
        currentRoundEndsAt: null,
      });
      if (!moved) throw conflict(eventId);
      const fresh = withParsedConfig(await loadEventFull(eventId));
      await announce(fresh, "CANCELLED", "cancelled", { event: fresh.name });
      await audit({
        channelId: event.channelId,
        userId,
        eventId,
        action: "EVENT_CANCEL",
        detail: { name: event.name },
      });
      break;
    }
  }
  publishEvent(eventId, event.channelId);
  return loadEventFull(eventId);
}

function conflict(eventId: string): DomainError {
  return new DomainError(
    `تعارض في الحالة عند تنفيذ الفعل (الفعالية ${eventId} تغيّرت حالتها في الوقت نفسه)`,
    "CONFLICT",
    409,
  );
}

/* ─────────────────────────────────────────────
   المشاركون — إزالة يدوية
   ───────────────────────────────────────────── */

export async function removeParticipant(
  eventId: string,
  participantId: string,
  userId: string | null,
): Promise<void> {
  const event = withParsedConfig(await loadEventFull(eventId));
  if (!event.parsed.participation.allowManualRemoval) {
    throw new DomainError(
      "الإعداد الحالي لا يسمح بالإزالة اليدوية للمشاركين",
      "INVALID_STATE",
    );
  }
  if (event.status === "COMPLETED" || event.status === "CANCELLED") {
    throw new DomainError("لا يمكن تعديل المشاركين في فعالية منتهية", "INVALID_STATE");
  }
  const p = await db.participant.findUnique({ where: { id: participantId } });
  if (!p || p.eventId !== eventId) {
    throw new DomainError("المشارك غير موجود", "NOT_FOUND", 404);
  }
  if (p.status !== "ACTIVE") {
    throw new DomainError("المشارك غير نشط بالفعل", "INVALID_STATE");
  }
  await db.participant.update({
    where: { id: p.id },
    data: { status: "REMOVED" },
  });
  await announce(event, "INFO_REPLY", "removed", {
    event: event.name,
    username: p.kickUsername,
  });
  await audit({
    channelId: event.channelId,
    userId,
    eventId,
    action: "PARTICIPANT_REMOVE",
    detail: { participantId, username: p.kickUsername },
  });
  publishEvent(eventId, event.channelId);
}

/* ─────────────────────────────────────────────
   الجولات
   ───────────────────────────────────────────── */

export async function startRoundInternal(event: EventWithConfig, index: number): Promise<void> {
  const question = await db.question.findUnique({
    where: { eventId_index: { eventId: event.id, index } },
  });
  if (!question) throw new DomainError("سؤال غير موجود", "NOT_FOUND", 404);
  const roundsTotal = await db.question.count({ where: { eventId: event.id } });
  const deadline = new Date(Date.now() + question.timeLimitSec * 1000);

  const ok = await db.event.updateMany({
    where: { id: event.id, status: "RUNNING", currentRoundIndex: index - 1 },
    data: {
      currentRoundIndex: index,
      currentRoundEndsAt: deadline,
      currentRoundRemainingMs: null,
      version: { increment: 1 },
    },
  });
  if (ok.count !== 1) throw conflict(event.id);

  await db.participant.updateMany({
    where: { eventId: event.id },
    data: { attempts: 0 },
  });

  const options = question.options ? (JSON.parse(question.options) as string[]) : null;
  await announce(event, "QUESTION", "question", {
    event: event.name,
    round: index + 1,
    rounds: roundsTotal,
    question: question.prompt,
    options: options ? optionsLine(options) : "",
    answerCmd: event.answerCommand,
    time: question.timeLimitSec,
  });
  publishEvent(event.id, event.channelId);
}

/** الفعل اليدوي «التالي»: يجمّد الجولة (نفس منطق الموعد) ثم يقدّم للجولة التالية. */
export async function advanceRound(eventId: string, userId: string): Promise<Event> {
  const event = withParsedConfig(await loadEventFull(eventId));
  if (event.status !== "RUNNING" || event.currentRoundIndex < 0) {
    throw new DomainError("لا توجد جولة جارية للتقدم", "INVALID_STATE");
  }
  const current = event.currentRoundIndex;
  const advanced = await transitionEvent(eventId, "RUNNING", {
    status: "RUNNING",
    currentRoundEndsAt: null, // تشير إلى أن الجولة الحالية أُغلقت يدويًا ولحظيًا
    currentRoundRemainingMs: null,
  });
  if (!advanced) throw conflict(eventId);
  await audit({
    channelId: event.channelId,
    userId,
    eventId,
    action: "EVENT_ROUND_ADVANCE",
    detail: { round: current },
  });
  await resolveRoundInternal(eventId, current, { early: true });
  return loadEventFull(eventId);
}

/**
 * إغلاق جولة: يمنح المكافأة الأولى ويكشف الإجابة حسب الإعداد، ثم يقدّم أو يُنهي.
 * حتمي ومتحمل إعادة التنفيذ (unique constraints).
 */
export async function resolveRoundInternal(
  eventId: string,
  roundIndex: number,
  opts: { early: boolean },
): Promise<void> {
  const eventBase = await loadEventFull(eventId);
  if (eventBase.status !== "RUNNING" || eventBase.currentRoundIndex !== roundIndex) {
    return; // قُصير/تنفيذ مكرر بعد تنافس آخر
  }
  const event = withParsedConfig(eventBase);
  const question = await db.question.findUnique({
    where: { eventId_index: { eventId, index: roundIndex } },
  });
  if (!question) throw new DomainError("سؤال غير موجود", "NOT_FOUND", 404);

  const correctAnswers = await db.answer.findMany({
    where: { eventId, roundIndex, outcome: "CORRECT" },
    orderBy: { createdAt: "asc" },
  });

  const first = correctAnswers[0] ?? null;
  if (first) {
    if (question.speedBonus > 0) {
      await db.$transaction(async (tx) => {
        await tx.scoreAward.create({
          data: {
            eventId,
            roundIndex,
            participantId: first.participantId,
            points: question.speedBonus,
            reason: "SPEED_BONUS",
          },
        });
        await tx.answer.update({
          where: { id: first.id },
          data: { speedBonus: question.speedBonus },
        });
        await tx.participant.update({
          where: { id: first.participantId },
          data: { score: { increment: question.speedBonus } },
        });
      }).catch(async (e) => {
        // مكرر — يمكن أن يحدث فقط عند إعادة التنفيذ؛ في هذه الحالة يُحتسب متناغمًا
        const isUnique = e instanceof Error && "code" in e && (e as { code?: string }).code === "P2002";
        if (!isUnique) throw e;
      });
    }
  }

  if (event.parsed.rules.revealAnswer) {
    const display = answerDisplay({
      options: question.options ? (JSON.parse(question.options) as string[]) : null,
      correctAnswers: JSON.parse(question.correctAnswers) as string[],
    });
    await announce(event, "ROUND_RESULT", "roundResult", {
      round: roundIndex + 1,
      answer: display,
      answerExplanation: question.explanation ? ` — ${question.explanation}` : "",
    });
  }

  publishEvent(eventId, event.channelId);

  // التقدم للجولة التالية أو الإنهاء
  const nextIndex = roundIndex + 1;
  const existsNext = await db.question.count({
    where: { eventId, index: nextIndex },
  });
  if (existsNext > 0) {
    await startRoundInternal(event, nextIndex);
  } else {
    await finalizeEvent(eventId, null, "rounds_complete");
  }
}

export async function pauseEvent(eventId: string, userId: string): Promise<Event> {
  const event = await loadEventFull(eventId);
  if (event.status !== "RUNNING") {
    throw new DomainError("إيقاف مؤقت متاح في فعالية جارية", "INVALID_STATE");
  }
  if (event.currentRoundEndsAt == null || event.currentRoundRemainingMs != null) {
    throw new DomainError("لا توجد جولة قيد العد لإيقافها", "INVALID_STATE");
  }
  const remaining = Math.max(0, event.currentRoundEndsAt.getTime() - Date.now());
  const moved = await transitionEvent(eventId, "RUNNING", {
    status: "RUNNING",
    currentRoundRemainingMs: remaining,
    currentRoundEndsAt: null,
  });
  if (!moved) throw conflict(eventId);
  const fresh = withParsedConfig(await loadEventFull(eventId));
  await announce(fresh, "PAUSED", "paused", { event: fresh.name });
  await audit({
    channelId: event.channelId,
    userId,
    eventId,
    action: "EVENT_PAUSE",
    detail: { remainingMs: remaining },
  });
  publishEvent(eventId, event.channelId);
  return loadEventFull(eventId);
}

export async function resumeEvent(eventId: string, userId: string): Promise<Event> {
  const event = await loadEventFull(eventId);
  if (event.status !== "RUNNING" || event.currentRoundRemainingMs == null) {
    throw new DomainError("لا توجد إيقاف مؤقت لاستئنافه", "INVALID_STATE");
  }
  const remaining = event.currentRoundRemainingMs;
  const moved = await transitionEvent(eventId, "RUNNING", {
    status: "RUNNING",
    currentRoundRemainingMs: null,
    currentRoundEndsAt: new Date(Date.now() + remaining),
  });
  if (!moved) throw conflict(eventId);
  await audit({
    channelId: event.channelId,
    userId,
    eventId,
    action: "EVENT_RESUME",
    detail: { remainingMs: remaining },
  });
  publishEvent(eventId, event.channelId);
  return loadEventFull(eventId);
}

/* ─────────────────────────────────────────────
   الحساب النهائي
   ───────────────────────────────────────────── */

export type StandingResult = {
  outcome: "WINNER" | "DRAW" | "NO_PARTICIPANTS";
  winnerParticipantId: string | null;
  winnerTeamName: string | null;
  standings: StandingRow[];
  teams: ReturnType<typeof computeTeamScores> | null;
};

export async function computeStandings(eventId: string): Promise<StandingResult> {
  const event = withParsedConfig(await loadEventFull(eventId));
  const participants = await db.participant.findMany({
    where: { eventId, status: "ACTIVE" },
  });
  const questions = await db.question.findMany({ where: { eventId }, orderBy: { index: "asc" } });
  const answers = await db.answer.findMany({
    where: { eventId, outcome: "CORRECT" },
    orderBy: { createdAt: "asc" },
  });

  // جوائز الجولات لقاعدة فك التعادل MOST_ROUND_WINS
  const roundWins = new Map<string, number>();
  for (let i = 0; i < questions.length; i++) {
    const roundAnswers = answers.filter((a) => a.roundIndex === i);
    const first = roundAnswers[0];
    if (first) {
      roundWins.set(first.participantId, (roundWins.get(first.participantId) ?? 0) + 1);
    }
  }

  const rows: StandingRow[] = participants.map((p) => ({
    participantId: p.id,
    username: p.kickUsername,
    team: p.teamName,
    score: p.score,
    correctCount: p.correctCount,
    attempts: p.totalAttempts,
    joinedAt: p.joinedAt.toISOString(),
    roundWins: roundWins.get(p.id) ?? 0,
  }));

  const ranked = rankStandings(rows, event.parsed.rules.tieBreak);
  const result = computeResult(rows, event.parsed.rules.tieBreak);

  let winnerTeamName: string | null = null;
  let teams: ReturnType<typeof computeTeamScores> | null = null;
  if (event.type === "TEAM_BATTLE") {
    const teamDefs = event.parsed.team.teams.map((t) => ({ key: t.key, label: t.label }));
    teams = computeTeamScores(rows, teamDefs);
    const sorted = [...teams].sort((a, b) => b.score - a.score);
    if (sorted.length >= 2 && sorted[0]!.score > sorted[1]!.score && sorted[0]!.score > 0) {
      winnerTeamName = sorted[0]!.key;
    } else if (sorted.length === 1 && sorted[0]!.score > 0) {
      winnerTeamName = sorted[0]!.key;
    }
  }

  return {
    outcome: result.outcome,
    winnerParticipantId: result.winnerParticipantId,
    winnerTeamName,
    standings: ranked,
    teams,
  };
}

export async function finalizeEvent(
  eventId: string,
  userId: string | null,
  reason: "rounds_complete" | "finished_early",
): Promise<Event> {
  const event = await loadEventFull(eventId);
  if (event.status !== "RUNNING") {
    throw new DomainError("الإنهاء متاح في فعالية جارية فقط", "INVALID_STATE");
  }
  const standing = await computeStandings(eventId);

  const moved = await transitionEvent(eventId, "RUNNING", {
    status: "COMPLETED",
    endedAt: new Date(),
    currentRoundEndsAt: null,
    winnerParticipantId: standing.winnerParticipantId,
    winnerTeamName: standing.winnerTeamName,
    resultOutcome: standing.outcome,
    resultComputedAt: new Date(),
  });
  if (!moved) throw conflict(eventId);

  const winner = standing.winnerParticipantId
    ? await db.participant.findUnique({ where: { id: standing.winnerParticipantId } })
    : null;
  const team = standing.winnerTeamName
    ? standing.teams?.find((t) => t.key === standing.winnerTeamName)
    : null;

  await db.eventResult.upsert({
    where: { eventId },
    create: {
      eventId,
      outcome: standing.outcome,
      winnerParticipantId: standing.winnerParticipantId,
      winnerTeamName: standing.winnerTeamName,
      standings: JSON.stringify(standing.standings),
    },
    update: {
      outcome: standing.outcome,
      winnerParticipantId: standing.winnerParticipantId,
      winnerTeamName: standing.winnerTeamName,
      standings: JSON.stringify(standing.standings),
    },
  });

  const fresh = withParsedConfig(await loadEventFull(eventId));
  if (standing.outcome === "WINNER") {
    await announce(fresh, "WINNER", "winner", {
      event: fresh.name,
      winner: winner?.kickUsername ?? team?.label ?? "—",
      score: winner?.score ?? team?.score ?? 0,
    });
  } else {
    // تعادل أو بلا مشاركين — لا يُعلن فائز فردي أبدًا في هذه الحالات
    const suffix = standing.outcome === "DRAW" ? "انتهت بتعادل — لا يوجد فائز مفرد" : "بدون مشاركين";
    await announce(fresh, "WINNER", "winner", {}, {
      contentOverride: `انتهت «${fresh.name}». ${suffix}.`,
    });
  }

  await audit({
    channelId: fresh.channelId,
    userId,
    eventId,
    action: "EVENT_FINISH",
    detail: { reason, outcome: standing.outcome },
  });
  publishEvent(eventId, fresh.channelId);
  return fresh;
}
