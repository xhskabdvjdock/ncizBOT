/**
 * وسيط Next.js:
 * - حماية CORS/AJAX: فحص أصل الطلبات المتغيرة (POST/PUT/PATCH/DELETE).
 * - تمرير صفحات لوحة التحكم إلى صفحات الدخول عند غياب كوكي الجلسة.
 * ملاحظة: التحقق الفعلي من صلاحية الجلسة يحدث على الخادم في كل صفحة/مسار.
 */
import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "kep_session";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/api/auth/login",
  "/api/auth/register",
  "/api/kick/webhook",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // حماية CSRF على مستوى الأصل: الطلبات المتغيرة من أصل مختلف تُرفض
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    if (pathname.startsWith("/api/kick/webhook") || pathname.startsWith("/api/kick/callback")) {
      // أصل خارجي (Kick) مسموح — هو مسوق بنفسه بالتوقيع
      return NextResponse.next();
    }
    const origin = req.headers.get("origin");
    if (origin) {
      try {
        const o = new URL(origin);
        const host = req.headers.get("host") ?? "";
        const proto = req.nextUrl.protocol.replace(":", "");
        if (o.host !== host) {
          return NextResponse.json(
            { error: "أصل الطلب غير مطابق" },
            { status: 403 },
          );
        }
        void proto;
      } catch {
        return NextResponse.json({ error: "طلب غير صالح" }, { status: 403 });
      }
    }
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (isPublic) return NextResponse.next();

  const hasSession = req.cookies.has(SESSION_COOKIE);
  if (!hasSession) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "جلسة مطلوبة" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
