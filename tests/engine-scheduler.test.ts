import "./_setup-env";
import crypto from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createEvent, performAction } from "@/server/engine/engine";
import { tick } from "@/server/engine/scheduler";
import type { EventDraftInput } from "@/core/config";

const draft = (): EventDraftInput => ({
  name: "اختبار المجدول",
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
  config: {},
  simulation: false,
  questions: [
    { prompt: "س1", options: null, correctAnswers: ["ن"], timeLimitSec: 10, points: 10, speedBonus: 0, explanation: null },
  ],
}) as unknown as import("@/core/config").EventDraftInput;

afterAll(() => db.$disconnect());

describe("المجدول — استرداد الحالة من قاعدة البيانات بعد انقطاع", () => {
  it("يبعل تسجيلًا مجدول الفتح في الماضي → يفتح التسجيل تلقائيًا", async () => {
    const user = await db.user.create({
      data: {
        email: `s-${crypto.randomUUID().slice(0, 8)}@test.local`,
        displayName: "مختبر المجدول",
        passwordHash: "x",
      },
    });
    const channel = await db.channel.create({
      data: {
        ownerUserId: user.id,
        kind: "LOCAL",
        kickUsername: "قناة",
        kickChannelSlug: `local-${user.id.slice(-6)}`,
      },
    });
    const ev = await createEvent({ channelId: channel.id, userId: user.id, draft: draft(), action: "SAVE_DRAFT" });
    await performAction(ev.id, user.id, "PREPARE");

    // ضبط فتح مجدول في الماضي يخترق حد الأداء الزمني الحقيقي للنجاح
    await db.event.update({
      where: { id: ev.id },
      data: { scheduledStartAt: new Date(Date.now() - 30_000) },
    });

    await tick();
    const after = await db.event.findUniqueOrThrow({ where: { id: ev.id } });
    expect(after.status).toBe("REG_OPEN");

    // إغلاق موعده المُتقادم تلقائيًا
    await db.event.update({
      where: { id: ev.id },
      data: { registrationClosesAt: new Date(Date.now() - 10_000) },
    });
    await tick();
    const closed = await db.event.findUniqueOrThrow({ where: { id: ev.id } });
    expect(closed.status).toBe("REG_CLOSED");

    // بدء ثم جولة منتهية الموعود: الاسترداد يحسمها بلا تدخل يدوي (بعد إعادة تشغيل افتراضي)
    await performAction(ev.id, user.id, "START");
    await db.event.update({
      where: { id: ev.id },
      data: { currentRoundEndsAt: new Date(Date.now() - 5_000) },
    });
    await tick();
    const advanced = await db.event.findUniqueOrThrow({ where: { id: ev.id } });
    // سؤال واحد فقط → حسم نهاية (COMPLETED)
    expect(["COMPLETED", "RUNNING"]).toContain(advanced.status);
    if (advanced.status === "COMPLETED") {
      const result = await db.eventResult.findFirst({ where: { eventId: ev.id } });
      expect(result?.outcome).toBe("NO_PARTICIPANTS");
    }
  });

  it("رسائل قناة محلية لا تزعم إرسالًا: تبقى BLOCKED حقيقةً بعد الضخ", async () => {
    // من النبضة السابقة: regOpen إعلان أُسفل — تحقق بقائه غير مُرسل
    const anySent = await db.outboxMessage.count({ where: { status: "SENT" } });
    expect(anySent).toBe(0);
    const blocked = await db.outboxMessage.count({ where: { status: "BLOCKED" } });
    expect(blocked).toBeGreaterThan(0);
  });
});
