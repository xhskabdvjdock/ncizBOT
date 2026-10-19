import { NextRequest, NextResponse } from "next/server";
import {
  assertEventOwnership,
  requireUser,
} from "@/server/api-helpers";
import { subscribe } from "@/server/realtime";
import { buildEventSnapshot } from "@/server/snapshot";

/**
 * تحديث حي بـ SSE — إرسال لقطة كاملة عند كل تغيير (متجاوزًا) ونبضة دورية.
 * بيانات لقطة فقط (بلا أسرار). العميل يتحول للفواصل عند فقد الاتصال تلقائيًا.
 */

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "جلسة مطلوبة" }, { status: 401 });
  const { id } = await ctx.params;
  const event = await assertEventOwnership(user.id, id);

  const encoder = new TextEncoder();
  let closed = false;
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let sendTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingRefresh = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          closed = true;
        }
      };

      const pushSnapshot = async () => {
        if (closed) return;
        const snap = await buildEventSnapshot(id);
        if (snap) {
          send(`data: ${JSON.stringify(snap)}\n\n`);
        }
      };

      // لقطة أولى فور الاتصال
      await pushSnapshot();

      const scheduleSnapshot = () => {
        if (pendingRefresh) return;
        pendingRefresh = true;
        sendTimer = setTimeout(async () => {
          pendingRefresh = false;
          await pushSnapshot();
        }, 350);
      };

      unsubscribe = subscribe((msg) => {
        if (msg.channel !== event.channelId) return;
        if (msg.event && msg.event !== id) return;
        scheduleSnapshot();
      });

      heartbeat = setInterval(() => {
        // نبضة تعليق تعيد الضبط في المتصفح وتحدّث ساعة الخادم
        send(`: ping\n\n`);
        void pushSnapshot();
      }, 15_000);

      const cleanup = () => {
        closed = true;
        unsubscribe?.();
        if (heartbeat) clearInterval(heartbeat);
        if (sendTimer) clearTimeout(sendTimer);
        try {
          controller.close();
        } catch {
          /* مُغلق مسبقًا */
        }
      };
      (controller as unknown as { __cleanup?: () => void }).__cleanup = cleanup;

      // عند انقطاع العميل
      req.signal?.addEventListener("abort", cleanup);
    },
    cancel() {
      closed = true;
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
      if (sendTimer) clearTimeout(sendTimer);
    },
  });

  return new NextResponse(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
