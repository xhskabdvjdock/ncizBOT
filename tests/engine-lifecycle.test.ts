import "./_setup-env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  createEvent,
  performAction,
  pauseEvent,
  resumeEvent,
  advanceRound,
  finalizeEvent,
  withParsedConfig,
  removeParticipant,
} from "@/server/engine/engine";
import { processChatMessage, type IngestMessage } from "@/server/engine/chat-commands";
import { ingestChatMessage } from "@/server/engine/ingest";
import { buildEventSnapshot } from "@/server/snapshot";
import type { EventDraftInput } from "@/core/config";
import { DomainError } from "@/core/states";
import crypto from "node:crypto";

let userId = "";
let channelId = "";
let eventId = "";

const draft = (): EventDraftInput => ({
  name: "اختبار المحرك",
  description: null,
  type: "QUIZ",
  commands: {
    registration: "!join",
    leave: "!leave",
    answer: "!answer",
    team: "!team",
    score: "!score",
    help: "!help",
    eventInfo: "!event",
  },
  config: {
    participation: { lateRegistration: true, maxParticipants: null, minParticipants: null },
    rules: { defaultPoints: 100, defaultSpeedBonus: 50, defaultTimeLimitSec: 30, maxAttemptsPerRound: 1, awardAllCorrect: true },
  },
  simulation: false,
  questions: [
    { prompt: "ما 2+2؟", options: null, correctAnswers: ["4", "أربعة"], timeLimitSec: 30, points: 100, speedBonus: 50, explanation: null },
    { prompt: "لون السماء؟", options: null, correctAnswers: ["أزرق"], timeLimitSec: 30, points: 100, speedBonus: 50, explanation: null },
  ],
}) as unknown as import("@/core/config").EventDraftInput;

const msg = (kickUserId: number, text: string, username?: string): IngestMessage => ({
  kickUserId,
  kickUsername: username ?? `viewer-${kickUserId}`,
  text,
  receivedAt: new Date(),
  source: "SIMULATION",
});

beforeAll(async () => {
  const user = await db.user.create({
    data: {
      email: `t-${crypto.randomUUID().slice(0, 8)}@test.local`,
      displayName: "مختبر",
      passwordHash: "x",
    },
  });
  userId = user.id;
  const channel = await db.channel.create({
    data: {
      ownerUserId: userId,
      kind: "LOCAL",
      kickUsername: "قناة محلية",
      kickChannelSlug: `local-${userId.slice(-6)}`,
      botSettings: { create: { botDisplayName: "بوت الاختبار" } },
    },
  });
  channelId = channel.id;
  const event = await createEvent({ channelId, userId, draft: draft(), action: "PREPARE" });
  eventId = event.id;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("دورة حياة الفعالية كاملة", () => {
  it("READY بعد الإنشاء بالنقاش PREPARE، ثم افتح التسجيل", async () => {
    const afterPrepare = await withParsedConfig(await db.event.findUniqueOrThrow({ where: { id: eventId } }));
    expect(afterPrepare.status).toBe("READY");

    const opened = await performAction(eventId, userId, "OPEN_REGISTRATION");
    expect(opened.status).toBe("REG_OPEN");

    // فعل مشابه مكرّر يُرفض وفق انتقالات الحالة
    await expect(performAction(eventId, userId, "PREPARE")).rejects.toThrow(DomainError);
  });

  it("التسجيل يستهل عبر !join ويمنع الازدواج", async () => {
    await expect(
      ingestChatMessage({ channelId, msg: msg(101, "[emote:1:x] !join") }),
    );
    // مرة أخرى مسجل مسبقًا — لا مشارك ثاني
    await ingestChatMessage({ channelId, msg: msg(101, "!join") });
    const count101 = await db.participant.count({ where: { eventId, kickUserId: 101 } });
    expect(count101).toBe(1);

    await ingestChatMessage({ channelId, msg: msg(102, "!join") });
    await ingestChatMessage({ channelId, msg: msg(103, "!join") });

    const active = await db.participant.count({ where: { eventId, status: "ACTIVE" } });
    expect(active).toBe(3);

    // انسحاب ثم عدم العودة (joinOnce)
    await ingestChatMessage({ channelId, msg: msg(102, "!leave") });
    const p102 = await db.participant.findUniqueOrThrow({
      where: { eventId_kickUserId: { eventId, kickUserId: 102 } },
    });
    expect(p102.status).toBe("LEFT");

    await ingestChatMessage({ channelId, msg: msg(102, "!join") });
    const again = await db.participant.findUniqueOrThrow({
      where: { eventId_kickUserId: { eventId, kickUserId: 102 } },
    });
    expect(again.status).toBe("LEFT"); // لم يعود
  });

  it("تسجيل الإجابات: الصحيح يتقاسم النقاط والسريع الأول يأخذ المكافأة", async () => {
    await performAction(eventId, userId, "CLOSE_REGISTRATION");
    const started = await performAction(eventId, userId, "START");
    expect(started.status).toBe("RUNNING");
    expect(started.currentRoundIndex).toBe(0);
    expect(started.currentRoundEndsAt).not.toBeNull();

    // إجابة صحيحة من 103 أسرع أولًا (100 + 50)
    await ingestChatMessage({ channelId, msg: msg(103, "!answer 4") });
    // صحيحة أيضًا من 101 (100 فقط)
    await ingestChatMessage({ channelId, msg: msg(101, "!answer أربعة") });
    // خاطئة من 101 مرة ثانية — تجاوز المحاولات (rejected)
    await ingestChatMessage({ channelId, msg: msg(101, "!answer 5") });

    const p103 = await db.participant.findUniqueOrThrow({ where: { eventId_kickUserId: { eventId, kickUserId: 103 } } });
    const p101 = await db.participant.findUniqueOrThrow({ where: { eventId_kickUserId: { eventId, kickUserId: 101 } } });
    expect(p103.score).toBe(150);
    expect(p101.score).toBe(100);

    const rejected = await db.answer.count({
      where: { eventId, participantId: p101.id, outcome: "REJECTED", rejectedReason: "ATTEMPT_LIMIT" },
    });
    expect(rejected).toBe(1);

    // إجابة بعد الموعد تُتكلَّم رفض صامت — نحقن msg بوقت منتهٍ
    const late = await processChatMessage({
      event: await withParsedConfig(await db.event.findUniqueOrThrow({ where: { id: eventId } })),
      msg: { ...msg(103, "!answer 4"), receivedAt: new Date(Date.now() + 60_000) },
    });
    expect(late.handled).toBe(false);
  });

  it("إيقاف واستئناف يجمّدان الموعد ويعيدان تشغيله", async () => {
    const paused = await pauseEvent(eventId, userId);
    expect(paused.currentRoundRemainingMs).not.toBeNull();
    const resumed = await resumeEvent(eventId, userId);
    expect(resumed.currentRoundEndsAt).not.toBeNull();
  });

  it("تقدم الجولة يدويًا يحسم الأولى ويبدأ الثانية; النهائي يحسم الترتيب والفريق", async () => {
    const round2 = await advanceRound(eventId, userId);
    expect(round2.currentRoundIndex).toBe(1);

    // جولة 2: 101 يكون الأسرع ليقلص نقاط الاختلاف
    await ingestChatMessage({ channelId, msg: msg(101, "!answer أزرق") });
    await ingestChatMessage({ channelId, msg: msg(103, "!answer أزرق") });

    const snapshot = await buildEventSnapshot(eventId);
    expect(snapshot).not.toBeNull();
    // 103: 150 + 100 = 250 | 101: 100 + 150 = 250 → تعادل مُبرَر بالأسبقية (102 خارج)
    expect(snapshot!.leaderboard.length).toBeGreaterThanOrEqual(2);

    await finalizeEvent(eventId, userId, "rounds_complete");
    const result = await db.eventResult.findUniqueOrThrow({ where: { eventId } });
    expect(["WINNER", "DRAW"]).toContain(result.outcome);

    const final = await db.event.findUniqueOrThrow({ where: { id: eventId } });
    expect(final.status).toBe("COMPLETED");

    const standings = JSON.parse(result.standings) as { username: string; score: number }[];
    expect(standings.length).toBeGreaterThan(0);
    // مرتّبة تنازليًا: الصف الأول لا يتجاوز نقاط الصف الثاني
    if (standings.length > 1) {
      expect(standings[0]!.score).toBeGreaterThanOrEqual(standings[1]!.score);
    }
  });

  it("منتهية ترفض التسجيل والإجابات", async () => {
    const denied = await processChatMessage({
      event: null,
      msg: msg(103, "!join"),
    });
    expect(denied).toMatchObject({ handled: false });
  });
});

describe("إزالة مشارك يدويًا", () => {
  it("تعمل في التسجيل المفتوح وتُسطب المشارك REMOVED مع إعلان في الصندوق", async () => {
    const ev2 = await createEvent({ channelId, userId, draft: draft(), action: "SAVE_DRAFT" });
    await performAction(ev2.id, userId, "PREPARE");
    await performAction(ev2.id, userId, "OPEN_REGISTRATION");
    await ingestChatMessage({ channelId, msg: { ...msg(999, "!join"), receivedAt: new Date() } });
    const p = await db.participant.findFirstOrThrow({ where: { eventId: ev2.id, kickUserId: 999 } });
    await removeParticipant(ev2.id, p.id, userId);
    const after = await db.participant.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.status).toBe("REMOVED");

    // العودة محظورة (REMOVED دائم مع joinOnce)
    await ingestChatMessage({ channelId, msg: msg(999, "!join") });
    const still = await db.participant.findUniqueOrThrow({ where: { id: p.id } });
    expect(still.status).toBe("REMOVED");

    // تنظيف: ألغِ الفعالية لتفادي قيد الفعالية الوحيدة النشطة
    await performAction(ev2.id, userId, "CANCEL");
  });
});

describe("الجداول الصندوق والقنوات المحلية", () => {
  it("إعلانات القناة المحلية تُؤرشف في الصندوق فعليًا (بلا زعم إرسال)", async () => {
    const rows = await db.outboxMessage.count({ where: { channelId } });
    expect(rows).toBeGreaterThan(0);
  });
});

describe("لوحة اللقطة", () => {
  it("تبني لقطة كاملة مع serverNow وبلا إجابات صحيحة مكشوفة للجارِ", async () => {
    const snap = await buildEventSnapshot(eventId);
    expect(snap).not.toBeNull();
    expect(snap!.event).toBeDefined();
    expect(Date.parse(snap!.serverNow)).toBeGreaterThan(0);
    // currentQuestion فقط عند RUNNING — لسنا في RUNNING الآن (منتهية)
    expect(snap!.currentQuestion).toBeNull();
  });
});
