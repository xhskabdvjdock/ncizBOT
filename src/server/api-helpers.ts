import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  getSessionUser,
  sessionCookieOptions,
  type SessionUser,
} from "@/server/auth";
import { DomainError } from "@/core/states";

/** هل المستخدم حاصلاً على جلسة موثقة فعليًا في قاعدة البيانات؟ */
export async function requireUser(req: NextRequest): Promise<SessionUser | null> {
  const sessionId = req.cookies.get(SESSION_COOKIE)?.value;
  return getSessionUser(sessionId);
}

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/** تحويل أخطاء المجال إلى استجابات واضحة. */
export function toApiError(e: unknown): NextResponse {
  if (e instanceof DomainError) {
    return jsonError(e.status, e.message);
  }
  if (e instanceof Error && e.name === "ZodError") {
    const lines = (e as unknown as { issues: { message: string }[] }).issues
      ?.map((i) => i.message)
      .slice(0, 3);
    return jsonError(422, lines?.join("؛ ") ?? "معطيات غير صالحة");
  }
  console.error("[api] خطأ غير متوقع:", e instanceof Error ? e.message : e);
  return jsonError(500, "خطأ داخلي غير متوقع — حاول مجددًا");
}

/** تعيين كوكي جلسة على استجابة. */
export function setSessionCookie(res: NextResponse, id: string): NextResponse {
  res.cookies.set(SESSION_COOKIE, id, sessionCookieOptions(SESSION_MAX_AGE));
  return res;
}

export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set(
    SESSION_COOKIE,
    "",
    sessionCookieOptions(0),
  );
  return res;
}

/** مالك القناة فقط — يمنع عبور المستخدمين لعناصر بعضهم. */
export async function assertChannelOwnership(
  userId: string,
  channelId: string,
): Promise<void> {
  const c = await db.channel.findUnique({ where: { id: channelId } });
  if (!c) throw new DomainError("القناة غير موجودة", "NOT_FOUND", 404);
  if (c.ownerUserId !== userId) {
    throw new DomainError("غير مصرح: القناة ليست لك", "NOT_FOUND", 403);
  }
}

export async function assertEventOwnership(
  userId: string,
  eventId: string,
) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: { channel: true },
  });
  if (!event) throw new DomainError("الفعالية غير موجودة", "NOT_FOUND", 404);
  if (event.channel.ownerUserId !== userId) {
    throw new DomainError("غير مصرح: الفعالية ليست لك", "NOT_FOUND", 403);
  }
  return event;
}
