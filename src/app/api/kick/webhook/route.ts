import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { ingestChatMessage } from "@/server/engine/ingest";
import {
  extractKickHeaders,
  verifyKickWebhook,
} from "@/server/kick/webhook-verify";

/**
 * نقطة استقبال Webhook من Kick — مفحوصة التواقيع بالمفتاح العام المستدَر حيًّا،
 * مع تنافر الرسائل (WebhookIngest) لكل Kick-Event-Message-Id.
 * استجابة 204 دائمًا بعد استقبال موقّع صحيح (نهج موصى به: لا إعادة إرسال اللانهائية).
 */

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const headers = extractKickHeaders(req.headers);

  if (!headers) {
    console.error("[webhook] رؤوس مفقودة — رفض 401");
    return new NextResponse(null, { status: 401 });
  }

  const verified = await verifyKickWebhook(headers, raw);
  if (!verified.ok) {
    console.error(
      `[webhook] تحقق التوقيع فشل: ${verified.reason} (type=${headers.eventType})`,
    );
    return new NextResponse(null, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const p = payload as {
    broadcaster?: { user_id?: number; username?: string };
    sender?: { user_id?: number; username?: string };
    content?: string;
    message_id?: string;
    created_at?: string;
  };

  if (headers.eventType !== "chat.message.sent") {
    return new NextResponse(null, { status: 204 });
  }

  const broadcasterId = p.broadcaster?.user_id;
  if (!broadcasterId || !p.sender?.user_id) {
    return new NextResponse(null, { status: 204 });
  }

  // القناة المعنية — المعرف الفعلي من محتوى الحدث
  const channel = await db.channel.findUnique({
    where: { kickUserId: broadcasterId },
  });
  if (!channel || channel.kind !== "KICK") {
    return new NextResponse(null, { status: 204 });
  }

  // تنافر: نفس الختم لا تُعالج مرتين
  const messageId = headers.messageId || crypto.randomUUID();
  const created = await db.webhookIngest
    .create({
      data: { id: messageId, channelId: channel.id },
    })
    .catch(() => null);

  if (!created) {
    const existing = await db.webhookIngest.findUnique({ where: { id: messageId } });
    if (existing && existing.processedAt) {
      // تمت معالجتُه مسبقًا
      return new NextResponse(null, { status: 204 });
    }
    if (existing && !existing.processedAt) {
      // أُدرج فشل قبله (مثلاً تعطل خادم) — يعاد الالتقاط
    }
  }

  try {
    await ingestChatMessage({
      channelId: channel.id,
      msg: {
        kickUserId: p.sender.user_id,
        kickUsername: p.sender.username ?? `user-${p.sender.user_id}`,
        text: p.content ?? "",
        receivedAt: p.created_at ? new Date(p.created_at) : new Date(),
        source: "KICK_WEBHOOK",
      },
    });
    await db.webhookIngest
      .update({ where: { id: messageId }, data: { processedAt: new Date() } })
      .catch(() => undefined);
  } catch (e) {
    console.error(
      "[webhook] فشل معالجة:",
      e instanceof Error ? e.message : e,
    );
    // يُبقي unprocessed — يمكن إعادة الالتقاط عند إعادة الرسالة من كت (retry)
  }

  return new NextResponse(null, { status: 204 });
}
