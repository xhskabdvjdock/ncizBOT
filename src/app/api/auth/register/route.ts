import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/server/db";
import {
  createSession,
  hashPassword,
  SESSION_COOKIE,
  SESSION_TTL_DAYS,
  sessionCookieOptions,
} from "@/server/auth";
import { allow } from "@/server/rate-limit";
import { audit } from "@/server/audit";

const bodySchema = z.object({
  email: z.string().email("البريد غير صالح").max(120),
  displayName: z.string().trim().min(2).max(40).optional(),
  password: z.string().min(8, "كلمة المرور 8 محارف على الأقل").max(100),
});

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "معطيات غير صالحة";
      return NextResponse.json({ error: msg }, { status: 422 });
    }
    const email = parsed.data.email.toLowerCase();

    // حد أمان التسجيل (10/10 دقائق لكل عنوان)
    const ipKey = `register:${req.headers.get("x-forwarded-for") ?? "local"}`;
    if (!allow(ipKey, 600_000, 10).allowed) {
      return NextResponse.json({ error: "محاولات كثيرة — انتظر قليلًا" }, { status: 429 });
    }

    const exists = await db.user.findUnique({ where: { email } });
    if (exists) {
      return NextResponse.json(
        { error: "هذا البريد مسجل مسبقًا" },
        { status: 409 },
      );
    }

    const user = await db.user.create({
      data: {
        email,
        displayName: parsed.data.displayName ?? email.split("@")[0]!,
        passwordHash: await hashPassword(parsed.data.password),
      },
    });

    // قناة اختبار محلية — تسمح بتجربة الفعاليات من دون اتصال Kick
    await db.channel.create({
      data: {
        ownerUserId: user.id,
        kind: "LOCAL",
        kickUsername: "قناة الاختبار المحلية",
        kickChannelSlug: `local-${user.id.slice(-8)}`,
        botSettings: { create: { botDisplayName: "بوت المنصة (اختبار)" } },
      },
    });

    const session = await createSession(user.id);
    const res = NextResponse.json({
      user: { id: user.id, email: user.email, displayName: user.displayName },
    });
    res.cookies.set(SESSION_COOKIE, session.id, sessionCookieOptions(SESSION_TTL_DAYS * 86400));
    await audit({ userId: user.id, action: "ACCOUNT_CREATE", detail: { email } });
    return res;
  } catch (e) {
    console.error("[register] فشل:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "تعذر إنشاء الحساب — حاول مجددًا" },
      { status: 500 },
    );
  }
}
