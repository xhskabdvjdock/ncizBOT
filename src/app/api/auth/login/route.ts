import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/server/db";
import {
  createSession,
  verifyPassword,
  SESSION_COOKIE,
  SESSION_TTL_DAYS,
  sessionCookieOptions,
} from "@/server/auth";
import { allow } from "@/server/rate-limit";

const bodySchema = z.object({
  email: z.string().email().max(120),
  password: z.string().min(1).max(100),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "معطيات غير صالحة" }, { status: 422 });
    }
    const email = parsed.data.email.toLowerCase();

    // حد أمان الدخول
    const emailKey = `login:email:${email}`;
    const ipKey = `login:ip:${req.headers.get("x-forwarded-for") ?? "local"}`;
    if (!allow(emailKey, 300_000, 5).allowed || !allow(ipKey, 300_000, 15).allowed) {
      return NextResponse.json(
        { error: "محاولات دخول كثيرة — انتظر بضع دقائق" },
        { status: 429 },
      );
    }

    const user = await db.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return NextResponse.json(
        { error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" },
        { status: 401 },
      );
    }

    const session = await createSession(user.id);
    const res = NextResponse.json({
      user: { id: user.id, email: user.email, displayName: user.displayName },
    });
    res.cookies.set(SESSION_COOKIE, session.id, sessionCookieOptions(SESSION_TTL_DAYS * 86400));
    return res;
  } catch (e) {
    console.error("[login] فشل:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "تعذر تسجيل الدخول" }, { status: 500 });
  }
}
