import { NextRequest, NextResponse } from "next/server";
import {
  assertEventOwnership,
  requireUser,
  toApiError,
} from "@/server/api-helpers";
import { ingestChatMessage } from "@/server/engine/ingest";
import { loadEventFull } from "@/server/engine/engine";
import { allow } from "@/server/rate-limit";
import { z } from "zod";

/**
 * وضع الاختبار فقط — يسمح لمالك الفعالية حقن رسائل محاكاة
 * في نفس مسار معالجة الأوامر المُستخدم مع Kick الحقيقي.
 * متاح فقط للفعاليات المُعلَّمة simulation=true، وسجل الرسائل موثق كوضع اختبار.
 */

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  username: z
    .string()
    .trim()
    .min(2)
    .max(24)
    .regex(/^[A-Za-z0-9_\u0600-\u06FF-]+$/u, "اسم مستخدم غير مسموح"),
  text: z.string().min(1).max(300),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireUser(req);
    if (!user) return NextResponse.json({ error: "جلسة مطلوبة" }, { status: 401 });
    const { id } = await ctx.params;
    const event = await assertEventOwnership(user.id, id);
    const full = await loadEventFull(id);
    if (!full.simulation) {
      return NextResponse.json(
        { error: "وضع الاختبار غير مفعل لهذه الفعالية" },
        { status: 403 },
      );
    }
    const parsed = bodySchema.parse(await req.json());

    // ~30 رسالة/دقيقة لكل فعالية في وضع الاختبار
    if (!allow(`sim:${id}`, 60_000, 30).allowed) {
      return NextResponse.json(
        { error: "تكرار سريع جدًا لرسائل المحاكاة" },
        { status: 429 },
      );
    }

    const outcome = await ingestChatMessage({
      channelId: event.channelId,
      msg: {
        // معرف رقمي ثابت لاسم الاختبار — داخل نطاق Int32 وبعيد عن نطاق مستخدمي Kick المعروف
        kickUserId: simUserId(parsed.username),
        kickUsername: parsed.username,
        text: parsed.text,
        receivedAt: new Date(),
        source: "SIMULATION",
      },
    });

    return NextResponse.json({ ok: true, outcome });
  } catch (e) {
    return toApiError(e);
  }
}

/** معرف رقمي ثابت لاسم محاكاة — يمنع تعارض فعلي مع مستخدمي Kick الحقيقيين. */
function simUserId(username: string): number {
  let h = 0;
  for (let i = 0; i < username.length; i++) {
    h = (h * 31 + username.charCodeAt(i)) | 0;
  }
  return 2_050_000_000 + (Math.abs(h) % 90_000_000);
}
