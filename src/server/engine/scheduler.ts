import { db } from "@/server/db";
import { publish } from "@/server/realtime";
import {
  resolveRoundInternal,
  performAction,
} from "./engine";
import {
  validAccessToken,
  introspectAccessToken,
  listSubscriptions,
  sendChatMessage,
  type ChannelWithCredential,
} from "@/server/kick/client";
import type { OutboxMessage } from "@prisma/client";

/**
 * جدولة الخلفية:
 * - إغلاق الجولات عند المواعيد المخزنة في قاعدة البيانات (استرجاع بعد إعادة التشغيل يعمل تلقائيًا).
 * - إغلاق التسجيل التلقائي وفتح التسجيل المجدول.
 * - ضخّ صندوق الرسانات مع حدود إرسال وتراجع تدريجي على الفشل أو 429.
 * - فحص دوري لاتصال Kick وتحديث حالة الاتصال الحقيقية فقط.
 */

const TICK_MS = 1000;
const HEALTH_SWEEP_INTERVAL_MS = 4 * 60 * 1000;

type GlobalState = {
  __kep_scheduler?: boolean;
  __kep_lastHealthAt?: number;
  __kep_channelLastSend?: Map<string, number>;
};

const g = globalThis as unknown as GlobalState;

export function startScheduler(): void {
  if (g.__kep_scheduler) return;
  g.__kep_scheduler = true;
  g.__kep_channelLastSend = new Map();
  const loop = async () => {
    for (;;) {
      try {
        await tick();
      } catch (e) {
        console.error(
          "[scheduler] tick failed:",
          e instanceof Error ? e.message : e,
        );
      }
      await new Promise((r) => setTimeout(r, TICK_MS));
    }
  };
  void loop();
  console.log("[scheduler] started");
}

/** تنفيذ نبضة واحدة من الجدول — تُستخدم من حلقة الخلفية ومن الاختبارات مباشرة. */
export async function tick(): Promise<void> {
  const now = new Date();

  // 1) جولات انقضت مواعيدها
  const dueRounds = await db.event.findMany({
    where: { status: "RUNNING", currentRoundEndsAt: { lt: now } },
    select: { id: true, currentRoundIndex: true },
    take: 10,
  });
  for (const e of dueRounds) {
    try {
      await resolveRoundInternal(e.id, e.currentRoundIndex, { early: false });
    } catch (err) {
      console.error(
        "[scheduler] resolveRound failed:",
        e.id,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // 2) إغلاق تسجيل انتهت مدته
  const dueReg = await db.event.findMany({
    where: { status: "REG_OPEN", registrationClosesAt: { lt: now } },
    select: { id: true },
    take: 10,
  });
  for (const e of dueReg) {
    try {
      await performAction(e.id, null, "CLOSE_REGISTRATION");
    } catch (err) {
      console.error(
        "[scheduler] closeRegistration failed:",
        e.id,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // 3) فتح تسجيل مجدول مبكرًا
  const dueScheduled = await db.event.findMany({
    where: { status: "READY", scheduledStartAt: { lte: now } },
    select: { id: true },
    take: 10,
  });
  for (const e of dueScheduled) {
    try {
      await performAction(e.id, null, "OPEN_REGISTRATION");
    } catch (err) {
      console.error(
        "[scheduler] scheduledOpen failed:",
        e.id,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // 4) ضخ صندوق الرسائل
  await pumpOutbox(now);

  // 5) فحص اتصال دوري
  const last = g.__kep_lastHealthAt ?? 0;
  if (Date.now() - last > HEALTH_SWEEP_INTERVAL_MS) {
    g.__kep_lastHealthAt = Date.now();
    void healthSweep();
  }
}

/* ─── صندوق الرسائل ─────────────────────────── */

const BACKOFF_MS = [5_000, 10_000, 20_000, 40_000, 60_000];
const MAX_ATTEMPTS = 6;

async function pumpOutbox(now: Date): Promise<void> {
  const msgs = await db.outboxMessage.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: now } },
    orderBy: { createdAt: "asc" },
    take: 25,
    include: { channel: true },
  });
  for (const msg of msgs) {
    await deliverOutbox(msg, msg.channel);
  }
}

async function deliverOutbox(
  msg: OutboxMessage,
  channel: { id: string; kind: string; kickUserId: number | null; kickUsername: string },
): Promise<void> {
  const now = Date.now();
  if (channel.kind !== "KICK") {
    // قناة محلية اختبار: الرسالة محفوظة للعرض حاليًا بلا إرسال حقيقي
    await db.outboxMessage.update({
      where: { id: msg.id },
      data: {
        status: "BLOCKED",
        lastError: "قناة محلية (اختبار) — لا إرسال حقيقي عبر Kick",
      },
    });
    publish(channel.id, msg.eventId ?? undefined, { kind: "refresh" }, "patch");
    return;
  }

  // فحص الاتصال المخزن
  const state = await db.connectionState.findUnique({ where: { channelId: channel.id } });
  if (!state || state.status !== "CONNECTED") {
    await db.outboxMessage.update({
      where: { id: msg.id },
      data: {
        status: "BLOCKED",
        lastError:
          state?.lastError ?? "قناة Kick غير متصلة — الرسالة محفوظة للعرض فقط",
      },
    });
    publish(channel.id, msg.eventId ?? undefined, { kind: "refresh" }, "patch");
    return;
  }

  // معدل إرسال لكل قناة (حد أمان داخلي أثقل من حدود كت؛ يتراجع عند 429)
  const settings = await db.botSettings.findUnique({ where: { channelId: channel.id } });
  const minInterval = Math.max(600, settings?.minSendIntervalMs ?? 1200);
  const lastSend = g.__kep_channelLastSend?.get(channel.id) ?? 0;
  if (now - lastSend < minInterval) return;

  const channelWithCred = (await db.channel.findUnique({
    where: { id: channel.id },
    include: { credential: true },
  })) as unknown as ChannelWithCredential | null;
  if (!channelWithCred) return;

  const tokenRes = await validAccessToken(channelWithCred);
  if ("error" in tokenRes) {
    await db.connectionState.update({
      where: { channelId: channel.id },
      data: { status: "ERROR", lastError: tokenRes.error, lastCheckedAt: new Date() },
    });
    await db.outboxMessage.update({
      where: { id: msg.id },
      data: {
        attempts: { increment: 1 },
        nextAttemptAt: new Date(now + 30_000),
        lastError: tokenRes.error,
      },
    });
    publish(channel.id, msg.eventId ?? undefined, { kind: "refresh" }, "patch");
    return;
  }

  const attempts = msg.attempts;
  const result = await sendChatMessage(tokenRes.token, {
    content: msg.content,
    sendType: (settings?.sendType as "user" | "bot") ?? "user",
    broadcasterUserId: channel.kickUserId ?? undefined,
  });

  g.__kep_channelLastSend?.set(channel.id, Date.now());

  if (result.sent) {
    await db.outboxMessage.update({
      where: { id: msg.id },
      data: { status: "SENT", sentAt: new Date(), lastError: null },
    });
  } else if (result.retryAfterSec) {
    await db.outboxMessage.update({
      where: { id: msg.id },
      data: {
        nextAttemptAt: new Date(now + Math.max(result.retryAfterSec, 5) * 1000),
        lastError: `تجاوز حد إرسال (429) — إعادة المحاولة لاحقًا`,
        attempts: { increment: 1 },
      },
    });
  } else {
    const attemptNo = attempts + 1;
    const exhausted = attemptNo >= MAX_ATTEMPTS;
    await db.outboxMessage.update({
      where: { id: msg.id },
      data: {
        attempts: attemptNo,
        status: exhausted ? "FAILED" : "PENDING",
        nextAttemptAt: exhausted
          ? msg.nextAttemptAt
          : new Date(now + (BACKOFF_MS[Math.min(attemptNo - 1, BACKOFF_MS.length - 1)] ?? 60_000)),
        lastError: result.error,
      },
    });
  }
  publish(channel.id, msg.eventId ?? undefined, { kind: "refresh" }, "patch");
}

/* ─── فحص الاتصال ───────────────────────────── */

/** فحص دوري لكل قنوات Kick: تحقق الرمز والنطاقات واشتراك الأحداث. */
export async function healthSweep(): Promise<void> {
  const channels = (await db.channel.findMany({
    where: { kind: "KICK" },
    include: { credential: true, state: true },
  })) as unknown as (ChannelWithCredential & {
    state: { status: string; lastHealthyAt: Date | null } | null;
  })[];
  for (const channel of channels) {
    try {
      const tokenRes = await validAccessToken(channel);
      const now = new Date();
      if ("error" in tokenRes) {
        await db.connectionState.upsert({
          where: { channelId: channel.id },
          create: {
            channelId: channel.id,
            status: "ERROR",
            lastCheckedAt: now,
            lastError: tokenRes.error,
          },
          update: {
            status: "ERROR",
            lastCheckedAt: now,
            lastError: tokenRes.error,
            lastHealthyAt:
              channel.state?.status === "CONNECTED"
                ? now
                : channel.state?.lastHealthyAt,
          },
        });
        publish(channel.id, undefined, { kind: "connection" }, "patch");
        continue;
      }
      const intro = await introspectAccessToken(tokenRes.token);
      const active = intro?.active === true;
      let subsActive = false;
      if (active) {
        const subs = await listSubscriptions(tokenRes.token);
        if (subs.ok) {
          subsActive = (subs.data ?? []).some(
            (s) => s.event === "chat.message.sent",
          );
        }
      }
      await db.connectionState.upsert({
        where: { channelId: channel.id },
        create: {
          channelId: channel.id,
          status: active ? "CONNECTED" : "ERROR",
          lastCheckedAt: now,
          lastHealthyAt: active ? now : null,
          lastError: active ? null : "الرمز غير نشط (introspect)",
          subscriptionsActive: subsActive,
        },
        update: {
          status: active ? "CONNECTED" : "ERROR",
          lastCheckedAt: now,
          lastHealthyAt: active ? now : undefined,
          lastError: active ? null : "الرمز غير نشط (introspect)",
          subscriptionsActive: subsActive,
        },
      });
      publish(channel.id, undefined, { kind: "connection" }, "patch");
    } catch (e) {
      console.error(
        "[scheduler] healthSweep failed:",
        channel.id,
        e instanceof Error ? e.message : e,
      );
    }
  }
}
