import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUser } from "@/server/api-helpers";
import { env } from "@/server/env";
import { SCOPES_TO_REQUEST } from "@/server/kick/client";

/** بدء ربط Kick: توليد state + PKCE وحفظهما، ثم التحويل إلى Kick. */
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) {
    return NextResponse.redirect(new URL("/login", env.appBaseUrl));
  }
  if (!env.hasKickCredentials) {
    return NextResponse.redirect(
      new URL(
        "/kick?error=" +
          encodeURIComponent(
            "KICK_CLIENT_ID و KICK_CLIENT_SECRET غير مضبوطين على الخادم — راجع README",
          ),
        env.appBaseUrl,
      ),
    );
  }

  // يمكن تجاوز رابط الرجوع بمتغير KICK_REDIRECT_URI — Kick تقارن ما يُرسَل مع المسجَّل في «تطبيق المطوّر» حرفيًا
  const redirectUri = env.kickRedirectUri || `${env.appBaseUrl}/api/kick/callback`;
  const state = crypto.randomBytes(24).toString("base64url");
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");

  await db.oAuthState.create({
    data: {
      id: state,
      userId: user.id,
      codeVerifier: verifier,
      redirectUri,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  // بناء يدوي للسلسلة الاستعلامية: الفصل بين النطاقات بـ %20 كما في مثال التوثيق الرسمي
  // (URLSearchParams يرمّز الفاصل بـ +، وفي طلبات التفويض هذه كل محرف حساس)
  // Kick تقرأ القيم من نص الاستعلام الخام عند المقارنة مع المسجَّل في «تطبيق المطوّر»
  // (انظر ملاحظة التوثيق عن إعادة كتابة 127.0.0.1 قبل فك الترميز) — لذا يُرسَل
  // redirect_uri خامًا حرفيًا كما سُجِّل، بينما scope يظل برميز %20 القياسي.
  const authorizeUrl = `https://id.kick.com/oauth/authorize?${[
    "response_type=code",
    `client_id=${encodeURIComponent(env.kickClientId)}`,
    `redirect_uri=${redirectUri}`,
    `scope=${encodeURIComponent(SCOPES_TO_REQUEST)}`,
    `state=${encodeURIComponent(state)}`,
    `code_challenge=${encodeURIComponent(challenge)}`,
    "code_challenge_method=S256",
  ].join("&")}`;
  console.log(
    "[kick/authorize] redirect_uri:",
    redirectUri,
    "| client_id:",
    env.kickClientId.slice(0, 6) + "…",
  );

  return NextResponse.redirect(authorizeUrl);
}
