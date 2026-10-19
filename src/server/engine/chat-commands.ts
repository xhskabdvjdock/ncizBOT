import { db } from "@/server/db";
import {
  cleanChatContent,
  parseCommand,
  commandMatches,
  COMMAND_RATE_LIMIT,
} from "@/core/command";
import { gradeAnswer, normalizeAnswerText } from "@/core/grading";
import { rankStandings, balancedTeamFor } from "@/core/scoring";
import { allow } from "@/server/rate-limit";
import {
  withParsedConfig,
  announce,
  loadEventFull,
  type EventWithConfig,
} from "./engine";

/**
 * معالجة أوامر المحادثة — مسار واحد لرسائل Kick الحقيقية ورسائل وضع الاختبار.
 * كل التحقق من الصلاحية والحدود والمواعيد هنا، على الخادم فقط.
 * الرسائل الواردة تُعامَل كنص بلا تقييم لأي شيفرة.
 */

export type IngestSource = "KICK_WEBHOOK" | "SIMULATION";

export type IngestMessage = {
  kickUserId: number;
  kickUsername: string;
  text: string;
  receivedAt: Date;
  source: IngestSource;
};

export type Outcome =
  | { handled: false; reason: string }
  | { handled: true; intent: string; replyKey?: string };

export type CommandHandler = {
  join: string;
  leave: string;
  answer: string;
  team: string;
  score: string;
  help: string;
  eventInfo: string;
};

export function eventCommands(event: EventWithConfig): CommandHandler {
  return {
    join: event.registrationCommand,
    leave: event.leaveCommand,
    answer: event.answerCommand,
    team: event.teamCommand,
    score: event.scoreCommand,
    help: event.helpCommand,
    eventInfo: event.eventCommand,
  };
}

/** الفعالية النشطة الوحيدة للقناة. */
export async function activeEventForChannel(
  channelId: string,
): Promise<EventWithConfig | null> {
  const event = await db.event.findFirst({
    where: { channelId, status: { in: ["REG_OPEN", "REG_CLOSED", "RUNNING"] } },
    orderBy: { createdAt: "desc" },
  });
  return event ? withParsedConfig(event) : null;
}

/** نقطة الدخول لكل رسالة (كلا المصدرين يعبران هنا). */
export async function processChatMessage(input: {
  event: EventWithConfig | null;
  msg: IngestMessage;
}): Promise<Outcome> {
  const { msg, event } = input;
  const text = cleanChatContent(msg.text);
  if (!text.startsWith("!")) {
    return { handled: false, reason: "ليس أمرًا" };
  }
  const parsed = parseCommand(text, "!");
  if (parsed.kind !== "command") return { handled: false, reason: "بلا تسمية" };

  if (!event) {
    // لا فعالية نشطة: تجاهل بهدوء لتجنب الرد على كل رسالة
    return { handled: false, reason: "لا فعالية نشطة" };
  }

  // حد أداء قبل أي فعل
  const rl = allow(
    `cmd:${event.channelId}:${msg.kickUserId}`,
    COMMAND_RATE_LIMIT.windowMs,
    COMMAND_RATE_LIMIT.maxActions,
    msg.receivedAt.getTime(),
  );
  if (!rl.allowed) {
    return { handled: false, reason: "تجاوز حد الأداء" };
  }

  const commands = eventCommands(event);
  const name = parsed.command;
  const args = parsed.args;

  if (commandMatches(name, commands.join)) return joinCommand(event, msg);
  if (commandMatches(name, commands.leave)) return leaveCommand(event, msg);
  if (commandMatches(name, commands.answer)) return answerCommand(event, msg, args);
  if (commandMatches(name, commands.team)) return teamCommand(event, msg, args);
  if (commandMatches(name, commands.score)) return scoreCommand(event, msg);
  if (commandMatches(name, commands.eventInfo)) return eventInfoCommand(event, msg);
  if (commandMatches(name, commands.help)) return helpCommand(event, msg);
  return { handled: false, reason: "أمر غير معروف" };
}

/* ─── أدوات ─────────────────────────────────── */

function countActive(eventId: string): Promise<number> {
  return db.participant.count({ where: { eventId, status: "ACTIVE" } });
}

function getParticipant(eventId: string, kickUserId: number) {
  return db.participant.findUnique({
    where: { eventId_kickUserId: { eventId, kickUserId } },
  });
}

/* ─── تسجيل ─────────────────────────────────── */

async function joinCommand(
  event: EventWithConfig,
  msg: IngestMessage,
): Promise<Outcome> {
  const status = event.status;
  if (status !== "REG_OPEN" && !(status === "RUNNING" && event.parsed.participation.lateRegistration)) {
    const key = status === "REG_CLOSED" || status === "RUNNING" ? "lateJoinDenied" : "registrationNotOpen";
    await announce(event, "INFO_REPLY", key, { event: event.name });
    return { handled: true, intent: "join_denied", replyKey: key };
  }

  const existing = await getParticipant(event.id, msg.kickUserId);
  if (existing) {
    if (existing.status === "ACTIVE") {
      await announce(event, "INFO_REPLY", "alreadyRegistered", {
        event: event.name,
        username: msg.kickUsername,
      });
      return { handled: true, intent: "join_duplicate" };
    }
    if (existing.status === "REMOVED" || event.parsed.participation.joinOnce) {
      // مُزال يدويًا أو تسجيل مرة واحدة: لا عودة
      await announce(event, "INFO_REPLY", "registrationNotOpen", { event: event.name });
      return { handled: true, intent: "join_blocked_once" };
    }
    // عودة بعد انسحاب سابق (مسموح إذا joinOnce=false)
    await db.participant.update({
      where: { id: existing.id },
      data: { status: "ACTIVE", joinedAt: new Date(), teamName: null },
    });
  } else {
    const max = event.parsed.participation.maxParticipants;
    if (max != null && (await countActive(event.id)) >= max) {
      await announce(event, "INFO_REPLY", "maxReached", {
        event: event.name,
        max,
      });
      return { handled: true, intent: "join_full" };
    }

    let teamName: string | null = null;
    if (event.type === "TEAM_BATTLE") {
      if (event.parsed.team.selection === "BALANCED") {
        const counts: Record<string, number> = {};
        for (const t of event.parsed.team.teams) {
          counts[t.key] = await db.participant.count({
            where: { eventId: event.id, teamName: t.key, status: "ACTIVE" },
          });
        }
        teamName = balancedTeamFor(counts, event.parsed.team.teams);
      }
    }

    try {
      await db.participant.create({
        data: {
          eventId: event.id,
          kickUserId: msg.kickUserId,
          kickUsername: msg.kickUsername,
          teamName,
        },
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "P2002") {
        // تسجيل مزدوج ضمن نفس اللحظة — القيد الوحيد يمنع الازدواجية
        await announce(event, "INFO_REPLY", "alreadyRegistered", {
          event: event.name,
          username: msg.kickUsername,
        });
        return { handled: true, intent: "join_duplicate" };
      }
      throw e;
    }
  }

  const newCount = await countActive(event.id);
  await announce(event, "INFO_REPLY", "registered", {
    event: event.name,
    username: msg.kickUsername,
    count: `${newCount} مشارك.`,
    slots: slotsText(newCount, event.parsed.participation.maxParticipants),
  });
  return { handled: true, intent: "joined" };
}

function slotsText(count: number, max: number | null | undefined): string {
  if (max == null) return "";
  const left = Math.max(0, max - count);
  return left > 0 ? `تبقّى ${left} مكانًا.` : "";
}

async function leaveCommand(
  event: EventWithConfig,
  msg: IngestMessage,
): Promise<Outcome> {
  if (event.status !== "REG_OPEN" && event.status !== "RUNNING" && event.status !== "REG_CLOSED") {
    await announce(event, "INFO_REPLY", "eventClosed", { event: event.name });
    return { handled: true, intent: "leave_denied" };
  }
  const p = await getParticipant(event.id, msg.kickUserId);
  if (!p || p.status !== "ACTIVE") {
    await announce(event, "INFO_REPLY", "notRegistered", {
      event: event.name,
      username: msg.kickUsername,
      join: event.registrationCommand,
    });
    return { handled: true, intent: "leave_not_registered" };
  }
  await db.participant.update({
    where: { id: p.id },
    data: { status: "LEFT" },
  });
  await announce(event, "INFO_REPLY", "left", {
    event: event.name,
    username: msg.kickUsername,
  });
  return { handled: true, intent: "left" };
}

/* ─── الإجابات ──────────────────────────────── */

async function answerCommand(
  event: EventWithConfig,
  msg: IngestMessage,
  args: string[],
): Promise<Outcome> {
  if (event.status !== "RUNNING") {
    return { handled: false, reason: "ليست في حالة بث" };
  }
  if (event.currentRoundIndex < 0) {
    return { handled: false, reason: "لا سؤال حالي" };
  }
  const paused = event.currentRoundEndsAt == null && event.currentRoundRemainingMs != null;
  if (paused) {
    await announce(event, "INFO_REPLY", "paused", { event: event.name });
    return { handled: true, intent: "answer_paused" };
  }
  const now = msg.receivedAt.getTime();
  const deadline = event.currentRoundEndsAt?.getTime() ?? 0;
  if (!deadline || now > deadline) {
    // تجاهل صامت بعد انتهاء الجولة (لا يُنشئ ضوضاء) — التوقيع الخادم حكم
    return { handled: false, reason: "بعد الموعد" };
  }

  const p = await getParticipant(event.id, msg.kickUserId);
  if (!p || p.status !== "ACTIVE") {
    await announce(event, "INFO_REPLY", "notRegistered", {
      event: event.name,
      username: msg.kickUsername,
      join: event.registrationCommand,
    });
    return { handled: true, intent: "answer_not_registered" };
  }

  const question = await db.question.findUnique({
    where: { eventId_index: { eventId: event.id, index: event.currentRoundIndex } },
  });
  if (!question) return { handled: false, reason: "سؤال مفقود" };

  const conso = args.join(" ").trim();
  if (!conso) return { handled: false, reason: "إجابة فارغة" };

  const maxAttempts = event.parsed.rules.maxAttemptsPerRound;
  const attempts = await db.answer.count({
    where: { eventId: event.id, roundIndex: event.currentRoundIndex, participantId: p.id, outcome: { in: ["CORRECT", "WRONG"] } },
  });
  if (attempts >= maxAttempts) {
    await announce(event, "INFO_REPLY", "attemptLimitReached", {
      event: event.name,
      username: msg.kickUsername,
      max: maxAttempts,
    });
    await db.answer.create({
      data: {
        eventId: event.id,
        roundIndex: event.currentRoundIndex,
        participantId: p.id,
        content: conso,
        outcome: "REJECTED",
        rejectedReason: "ATTEMPT_LIMIT",
      },
    });
    return { handled: true, intent: "answer_limit" };
  }

  const already = await db.answer.findFirst({
    where: { eventId: event.id, roundIndex: event.currentRoundIndex, participantId: p.id, outcome: "CORRECT" },
  });
  if (already) {
    await announce(event, "INFO_REPLY", "alreadyAnswered", {
      event: event.name,
      username: msg.kickUsername,
    });
    return { handled: true, intent: "answer_already_correct" };
  }

  const options = question.options ? (JSON.parse(question.options) as string[]) : null;
  const correctAnswers = JSON.parse(question.correctAnswers) as string[];
  const gradingOptions = {
    caseSensitive: event.parsed.rules.caseSensitive,
    normalizeArabic: event.parsed.rules.normalizeArabic,
  };
  const isCorrect = gradeAnswer(conso, { options, correctAnswers }, gradingOptions);

  const isFirstCorrectAnswer =
    isCorrect &&
    (await db.answer.count({
      where: { eventId: event.id, roundIndex: event.currentRoundIndex, outcome: "CORRECT" },
    })) === 0;

  // نقاط قاعدة: الكل الصحيح ينالها إن فُعّل المنح للجميع؛ الأولى فقط تعني التفرد
  const pointsBase = isCorrect
    ? event.parsed.rules.awardAllCorrect || isFirstCorrectAnswer
      ? question.points
      : 0
    : 0;
  const speedBonusPts = isCorrect && isFirstCorrectAnswer ? question.speedBonus : 0;

  await db.$transaction(async (tx) => {
    await tx.answer.create({
      data: {
        eventId: event.id,
        roundIndex: event.currentRoundIndex,
        participantId: p.id,
        content: conso,
        outcome: isCorrect ? "CORRECT" : "WRONG",
        pointsAwarded: pointsBase,
        speedBonus: speedBonusPts,
      },
    });
    if (pointsBase > 0) {
      await tx.scoreAward.create({
        data: {
          eventId: event.id,
          roundIndex: event.currentRoundIndex,
          participantId: p.id,
          points: pointsBase,
          reason: "CORRECT",
        },
      });
    }
    if (speedBonusPts > 0) {
      await tx.scoreAward.create({
        data: {
          eventId: event.id,
          roundIndex: event.currentRoundIndex,
          participantId: p.id,
          points: speedBonusPts,
          reason: "SPEED_BONUS",
        },
      });
    }
    await tx.participant.update({
      where: { id: p.id },
      data: {
        score: { increment: pointsBase + speedBonusPts },
        correctCount: isCorrect ? { increment: 1 } : undefined,
        attempts: { increment: 1 },
        totalAttempts: { increment: 1 },
      },
    });
  }).catch((e) => {
    // تكرار الجائزة (نادر مع تأكيد one shot) — يُمنع بالقيد الوحيد
    const code = (e as { code?: string }).code;
    if (code !== "P2002") throw e;
  });

  if (!isCorrect) {
    await announce(event, "INFO_REPLY", "wrongAnswer", {
      event: event.name,
      username: msg.kickUsername,
    });
    return { handled: true, intent: "answer_wrong" };
  }
  return { handled: true, intent: "answer_correct" };
}

/* ─── الفرق ─────────────────────────────────── */

async function teamCommand(
  event: EventWithConfig,
  msg: IngestMessage,
  args: string[],
): Promise<Outcome> {
  if (event.type !== "TEAM_BATTLE") {
    return { handled: false, reason: "ليست فعالية فرق" };
  }
  if (event.status !== "REG_OPEN" && !(event.status === "RUNNING" && event.parsed.team.joinAfterStart)) {
    await announce(event, "INFO_REPLY", "registrationNotOpen", { event: event.name });
    return { handled: true, intent: "team_denied" };
  }
  const p = await getParticipant(event.id, msg.kickUserId);
  if (!p || p.status !== "ACTIVE") {
    await announce(event, "INFO_REPLY", "notRegistered", {
      event: event.name,
      username: msg.kickUsername,
      join: event.registrationCommand,
    });
    return { handled: true, intent: "team_not_registered" };
  }

  const arg = normalizeAnswerText(args[0] ?? "", {
    caseSensitive: false,
    normalizeArabic: true,
  });
  const matched = event.parsed.team.teams.find((t) => {
    const aliasNorm = [t.key, t.label, ...t.aliases].map((x) =>
      normalizeAnswerText(x, { caseSensitive: false, normalizeArabic: true }),
    );
    return aliasNorm.includes(arg);
  });

  if (event.parsed.team.selection === "BALANCED") {
    // في وضع الموازنة: تعيين البوت حتمي ومرئي
    const counts: Record<string, number> = {};
    for (const t of event.parsed.team.teams) {
      counts[t.key] = await db.participant.count({
        where: { eventId: event.id, teamName: t.key, status: "ACTIVE" },
      });
    }
    const assigned = balancedTeamFor(counts, event.parsed.team.teams);
    const label = event.parsed.team.teams.find((t) => t.key === assigned)!.label;
    await db.participant.update({ where: { id: p.id }, data: { teamName: assigned } });
    await announce(event, "INFO_REPLY", "registered", {
      event: event.name,
      username: msg.kickUsername,
      count: `تعيينك للفريق ${label}.`,
      slots: "",
    });
    return { handled: true, intent: "team_balanced", replyKey: assigned };
  }

  if (!matched) {
    const names = event.parsed.team.teams.map((t) => t.label).join(" / ");
    await announce(event, "INFO_REPLY", "registrationNotOpen", {
      event: `${event.name} — اختر فريقًا: ${names}`,
    });
    return { handled: true, intent: "team_unknown" };
  }

  if (p.teamName && p.teamName !== matched.key) {
    // عدم التعارض: المنضمّ مرة واحدة لكل فريق؛ التحويل مسموح قبل البدء فقط (قاعدة واضحة)
    if (event.status === "RUNNING") {
      return { handled: true, intent: "team_switch_locked" };
    }
  }
  await db.participant.update({
    where: { id: p.id },
    data: { teamName: matched.key },
  });
  await announce(event, "INFO_REPLY", "registered", {
    event: event.name,
    username: msg.kickUsername,
    count: `فريقك: ${matched.label}.`,
    slots: "",
  });
  return { handled: true, intent: "team_assigned" };
}

/* ─── معلومات ───────────────────────────────── */

async function scoreCommand(
  event: EventWithConfig,
  msg: IngestMessage,
): Promise<Outcome> {
  const p = await getParticipant(event.id, msg.kickUserId);
  if (!p || p.status !== "ACTIVE") {
    await announce(event, "INFO_REPLY", "notRegistered", {
      event: event.name,
      username: msg.kickUsername,
      join: event.registrationCommand,
    });
    return { handled: true, intent: "score_not_registered" };
  }
  const list = await db.participant.findMany({
    where: { eventId: event.id, status: "ACTIVE" },
  });
  const ranked = rankStandings(
    list.map((x) => ({
      participantId: x.id,
      username: x.kickUsername,
      team: x.teamName,
      score: x.score,
      correctCount: x.correctCount,
      attempts: x.totalAttempts,
      joinedAt: x.joinedAt.toISOString(),
      roundWins: 0,
    })),
    event.parsed.rules.tieBreak,
  );
  const rank = ranked.findIndex((r) => r.participantId === p.id) + 1;
  await announce(event, "INFO_REPLY", "score", {
    username: msg.kickUsername,
    rank: rank > 0 ? rank : "—",
    count: ranked.length,
    score: p.score,
    correct: p.correctCount,
  });
  return { handled: true, intent: "score_reported" };
}

async function eventInfoCommand(
  event: EventWithConfig,
  _msg: IngestMessage,
): Promise<Outcome> {
  const count = await countActive(event.id);
  const statusKey = event.status;
  const statusLabel =
    statusKey === "REG_OPEN"
      ? "التسجيل مفتوح"
      : statusKey === "REG_CLOSED"
        ? "التسجيل مغلق"
        : statusKey === "RUNNING"
          ? "جارية الآن"
          : statusKey;
  const roundTotal = await db.question.count({ where: { eventId: event.id } });
  const extra =
    event.status === "RUNNING"
      ? `الجولة ${event.currentRoundIndex + 1} من ${roundTotal}.`
      : "";
  await announce(event, "INFO_REPLY", "eventInfo", {
    event: event.name,
    status: statusLabel,
    extra: `${extra} المشاركون: ${count}.`,
    join: event.registrationCommand,
  });
  return { handled: true, intent: "event_info" };
}

async function helpCommand(
  event: EventWithConfig,
  _msg: IngestMessage,
): Promise<Outcome> {
  await announce(event, "INFO_REPLY", "help", {
    join: event.registrationCommand,
    leave: event.leaveCommand,
    answerCmd: event.answerCommand,
    team: event.type === "TEAM_BATTLE" ? `${event.teamCommand} ` : "",
    score: event.scoreCommand,
    eventInfo: event.eventCommand,
    help: event.helpCommand,
  });
  return { handled: true, intent: "help" };
}

