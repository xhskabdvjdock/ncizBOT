import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { env } from "@/server/env";
import {
  exchangeAuthorizationCode,
  getAuthorizedUser,
  createChatWebhookSubscription,
} from "@/server/kick/client";
import { encryptSecret } from "@/server/crypto";
import { audit } from "@/server/audit";

/** ردّ Kick: تبادل الرمز (محليًا على الخادم فقط)، ثم إنشاء/تحديث القناة والاعتماد. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const fail = (msg: string) =>
    NextResponse.redirect(
      new URL(`/kick?error=${encodeURIComponent(msg)}`, env.appBaseUrl),
    );

  if (oauthError) return fail(`تم صرف السماح: ${oauthError}`);
  if (!code || !state) return fail("ردّ غير صالح (بيانات ناقصة)");

  const stored = await db.oAuthState.findUnique({ where: { id: state } });
  if (!stored) return fail("حالة التفويض غير معروفة — إعادة المحاولة مطلوبة");
  if (stored.expiresAt.getTime() < Date.now()) {
    await db.oAuthState.delete({ where: { id: state } }).catch(() => undefined);
    return fail("انتهت صلاحية التفويض — حاول مرة أخرى");
  }

  try {
    const xlim = await exchangeAuthorizationCode({
      code,
      redirectUri: stored.redirectUri,
      codeVerifier: stored.codeVerifier,
      clientId: env.kickClientId,
      clientSecret: env.kickClientSecret,
    });
    await db.oAuthState.delete({ where: { id: state } }).catch(() => undefined);
    if (!xlim.ok) {
      await audit({ userId: stored.userId, action: "KICK_CONNECT_FAIL", detail: { step: "token", error: xlim.error } });
      return fail(`فشل تبادل الرمز: ${xlim.error}`);
    }

    const userRes = await getAuthorizedUser(xlim.payload.access_token);
    if (!userRes.ok) {
      await audit({ userId: stored.userId, action: "KICK_CONNECT_FAIL", detail: { step: "users", error: userRes.error } });
      return fail(`تعذر جلب هوية المستخدم: ${userRes.error}`);
    }
    const kickUser = userRes.data as { user_id: number; name: string };

    const existing = await db.channel.findUnique({
      where: { kickUserId: kickUser.user_id },
      include: { credential: true, state: true },
    });
    if (existing && existing.ownerUserId !== stored.userId) {
      return fail("هذه قناة مرتبطة بحساب مستخدم آخر");
    }

    const expiresAt = new Date(
      Date.now() + Number(xlim.payload.expires_in ?? 0) * 1000,
    );
    const credentialData = {
      accessTokenEnc: encryptSecret(xlim.payload.access_token),
      refreshTokenEnc: encryptSecret(
        xlim.payload.refresh_token ?? stored.codeVerifier, // لا يصل refresh؟ Kick يعيد دوماً — حدّث للاحتياط
      ),
      accessTokenExpiresAt: expiresAt,
      scopes: xlim.payload.scope ?? "",
    };

    const channel = existing
      ? await db.channel.update({
          where: { id: existing.id },
          data: {
            kickUsername: kickUser.name,
            kind: "KICK",
            credential: { update: credentialData },
            state: {
              upsert: {
                create: {
                  status: "CONNECTED",
                  lastCheckedAt: new Date(),
                  lastHealthyAt: new Date(),
                },
                update: {
                  status: "CONNECTED",
                  lastCheckedAt: new Date(),
                  lastHealthyAt: new Date(),
                  lastError: null,
                },
              },
            },
            botSettings: {
              upsert: {
                create: { botDisplayName: "بوت المنصة" },
                update: {},
              },
            },
          },
        })
      : await db.channel.create({
          data: {
            ownerUserId: stored.userId,
            kind: "KICK",
            kickUserId: kickUser.user_id,
            kickUsername: kickUser.name,
            kickChannelSlug: kickUser.name.toLowerCase(),
            credential: { create: credentialData },
            state: {
              create: {
                status: "CONNECTED",
                lastCheckedAt: new Date(),
                lastHealthyAt: new Date(),
              },
            },
            botSettings: {
              create: { botDisplayName: "بوت المنصة" },
            },
          },
        });

    // طلب إنشاء اشتراك المحادثة (قد يفشل إذا لم يُضبط Webhook URL في إعدادات تطبيق Kick — نحسم الحالة بصدق)
    const subs = await createChatWebhookSubscription(
      xlim.payload.access_token,
      undefined,
    );
    const subsOk = subs.ok;
    await db.connectionState.update({
      where: { channelId: channel.id },
      data: {
        subscriptionsActive: subsOk,
        lastError: subsOk ? null : `تعذّر إنشاء اشتراك الأحداث: ${"error" in subs ? subs.error : ""}`,
      },
    });

    await audit({
      channelId: channel.id,
      userId: stored.userId,
      action: subsOk ? "KICK_CONNECT" : "KICK_CONNECT_NO_SUBS",
      detail: { kickUsername: kickUser.name, subscription: subsOk },
    });

    return NextResponse.redirect(
      new URL(
        `/kick?${subsOk ? "connected=1" : `connecting=1&error=${encodeURIComponent("تم الربط، لكن إنشاء اشتراك الأحداث لم ينجح — تحقق من ضبط Webhook URL في إعدادات تطبيق Kick ثم أعد «مطابقة الاشتراك»")}`}`,
        env.appBaseUrl,
      ),
    );
  } catch (e) {
    console.error("[kick/callback] فشل:", e instanceof Error ? e.message : e);
    return fail("خطأ غير متوقع أثناء الربط");
  }
}
