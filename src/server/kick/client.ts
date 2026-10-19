import { db } from "@/server/db";
import { decryptSecret, encryptSecret } from "@/server/crypto";
import { env } from "@/server/env";
import type { ConnectionState } from "@prisma/client";

/**
 * عميل Kick الرسمي (Dev API v1) — نقاط النهاية لكل التوثيق:
 *  - OAuth:  https://id.kick.com  (authorize / token / revoke / introspect)
 *  - API:    https://api.kick.com/public/v1
 * لا توجد مسارات مبتكرة هنا. أي استجابة غير موثقة تُسجَّل كخطأ وتُصنَّف صراحة.
 */

export const KICK_OAUTH_BASE = "https://id.kick.com";
export const KICK_API_BASE = "https://api.kick.com";

/** النطاقات المستخدمة فعليًا في ميزات المنصة — لا طلب نطاقات إضافية. */
export const REQUIRED_SCOPES = ["user:read", "chat:write", "events:subscribe"] as const;

export const SCOPES_TO_REQUEST = REQUIRED_SCOPES.join(" ");

export type KickScope = (typeof REQUIRED_SCOPES)[number];

export type KickUser = {
  user_id: number;
  name: string;
  email?: string | null;
  profile_picture?: string | null;
};

export type KickChatSendResult =
  | { sent: true; messageId: string }
  | { sent: false; error: string; retryAfterSec?: number };

function buildTokenEndpoint(): string {
  return `${KICK_OAUTH_BASE}/oauth/token`;
}

async function tokenRequest(
  body: Record<string, string>,
): Promise<
  | { ok: true; payload: { access_token: string; refresh_token?: string; expires_in: number; scope?: string; token_type?: string } }
  | { ok: false; status: number; error: string }
> {
  const res = await fetch(buildTokenEndpoint(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* عدم تسلسل يعني استجابة غير متوقعة؛ تجاهل بصمت للسجل */
  }
  if (!res.ok) {
    const err =
      (json as { error?: string; message?: string } | null)?.error ??
      (json as { message?: string } | null)?.message ??
      `HTTP ${res.status}`;
    return { ok: false, status: res.status, error: err };
  }
  return { ok: true, payload: json as never };
}

/** تبادل رمز التفويض مقابل رموز الوصول (مع PKCE على الخادم). */
export async function exchangeAuthorizationCode(input: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
  clientId: string;
  clientSecret: string;
}) {
  return tokenRequest({
    grant_type: "authorization_code",
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
    code: input.code,
  });
}

export async function refreshAccessToken(input: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}) {
  return tokenRequest({
    grant_type: "refresh_token",
    client_id: input.clientId,
    client_secret: input.clientSecret,
    refresh_token: input.refreshToken,
  });
}

export async function revokeToken(input: {
  token: string;
  tokenHintType?: "access_token" | "refresh_token";
}): Promise<boolean> {
  const url = new URL(`${KICK_OAUTH_BASE}/oauth/revoke`);
  url.searchParams.set("token", input.token);
  if (input.tokenHintType) url.searchParams.set("token_hint_type", input.tokenHintType);
  try {
    const res = await fetch(url, { method: "POST", cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

export type Introspection = {
  active: boolean;
  user_type?: "app" | "user";
  scope?: string;
  exp?: number;
};

/** فحص الرمز عبر introspect (للتوثيق فقط — بما في ذلك السكوب الفعلي المنح). */
export async function introspectAccessToken(accessToken: string): Promise<Introspection | null> {
  try {
    const res = await fetch(`${KICK_OAUTH_BASE}/oauth/token/introspect`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: Introspection };
    return body.data ?? null;
  } catch {
    return null;
  }
}

export type ApiCall<A> =
  | { ok: true; data: A }
  | { ok: false; status: number; error: string; retryAfterSec?: number };

async function apiCall<A>(
  path: string,
  init: { method?: string; body?: unknown; accessToken: string },
): Promise<ApiCall<A>> {
  const res = await fetch(`${KICK_API_BASE}/public/v1${path}`, {
    method: init.method ?? "GET",
    headers: {
      authorization: `Bearer ${init.accessToken}`,
      ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const retryAfter = parseRetryAfter(res.headers);
  let body: unknown = null;
  const text = await res.text();
  try {
    body = JSON.parse(text);
  } catch {
    /* غير JSON */
  }
  if (!res.ok) {
    const err = (body as { message?: string } | null)?.message ?? `HTTP ${res.status}`;
    return { ok: false, status: res.status, error: err, retryAfterSec: retryAfter };
  }
  return { ok: true, data: ((body as { data?: unknown }).data ?? body) as A };
}

function parseRetryAfter(headers: Headers): number | undefined {
  const v = headers.get("retry-after");
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// ─── إصدار اللوحة من الرموز ─────────────────────────────────────

export type ChannelWithCredential = {
  id: string;
  kind: string;
  kickUserId: number;
  kickUsername: string;
  kickChannelSlug: string;
  credential: {
    accessTokenEnc: string;
    refreshTokenEnc: string;
    accessTokenExpiresAt: Date;
    scopes: string;
  } | null;
};

/** يعيد رمز وصول صحيحًا للقناة، محاولًا تجديده عند اقتراب انتهاء صلاحية. */
export async function validAccessToken(
  channel: ChannelWithCredential,
): Promise<{ token: string } | { error: string }> {
  const cred = channel.credential;
  if (!cred) return { error: "لا يوجد اعتماد متصل" };
  if (!env.kickClientId || !env.kickClientSecret) {
    return { error: "اعتمادات KICK_CLIENT_* غير مضبوطة على الخادم" };
  }
  let accessToken: string;
  try {
    accessToken = decryptSecret(cred.accessTokenEnc);
  } catch {
    return { error: "تعذر فك تشفير رمز الوصول" };
  }
  const needsRefresh = cred.accessTokenExpiresAt.getTime() - Date.now() < 90_000;
  if (needsRefresh) {
    let refreshToken: string;
    try {
      refreshToken = decryptSecret(cred.refreshTokenEnc);
    } catch {
      return { error: "تعذر فك تشفير رمز التجديد" };
    }
    const refreshed = await refreshAccessToken({
      refreshToken,
      clientId: env.kickClientId,
      clientSecret: env.kickClientSecret,
    });
    if (!refreshed.ok) {
      return { error: `فشل تحديث الرمز: ${refreshed.error}` };
    }
    accessToken = refreshed.payload.access_token;
    const newRefresh = refreshed.payload.refresh_token ?? refreshToken;
    try {
      await db.kickCredential.update({
        where: { channelId: channel.id },
        data: {
          accessTokenEnc: encryptSecret(accessToken),
          refreshTokenEnc: encryptSecret(newRefresh),
          accessTokenExpiresAt: new Date(
            Date.now() + refreshed.payload.expires_in * 1000,
          ),
          scopes: refreshed.payload.scope ?? cred.scopes,
        },
      });
    } catch (e) {
      return {
        error:
          e instanceof Error ? `رمز مجدد لكن لم يُحفظ: ${e.message}` : "خطأ حفظ",
      };
    }
  }
  return { token: accessToken };
}

// ─── استدعاءات ميزات فعلية ─────────────────────────────────────

/** هوية المستخدم المصرّح. */
export async function getAuthorizedUser(token: string): Promise<ApiCall<KickUser>> {
  const call = await apiCall<{ data?: KickUser[]; users?: KickUser[]; items?: KickUser[] }>(
    "/users",
    { accessToken: token },
  );
  if (!call.ok) return call;
  const list = (call.data as unknown) as { data?: KickUser[] };
  const first =
    (Array.isArray(list) ? list[0] : undefined) ??
    list.data?.[0] ??
    (call.data as { items?: KickUser[] }).items?.[0];
  if (!first) {
    return { ok: false, status: 204, error: "استجابة users فارغة" };
  }
  return { ok: true, data: first as KickUser };
}

/** إرسال رسالة محادثة (لا تتجاوز 500 عنقود زخرفي). */
export async function sendChatMessage(
  token: string,
  params: { content: string; sendType: "user" | "bot"; broadcasterUserId?: number },
): Promise<KickChatSendResult> {
  const body: Record<string, unknown> = {
    content: params.content,
    type: params.sendType,
  };
  if (params.sendType === "user" && params.broadcasterUserId) {
    body.broadcaster_user_id = params.broadcasterUserId;
  }
  const res = await apiCall<{ message_id: string; is_sent: boolean }>("/chat", {
    method: "POST",
    body,
    accessToken: token,
  });
  if (res.ok && res.data.is_sent) {
    return { sent: true, messageId: res.data.message_id ?? "" };
  }
  return {
    sent: false,
    error: res.ok ? "استجابة بلا معرف رسالة" : `${res.status}: ${res.error}`,
    retryAfterSec: res.ok ? undefined : res.retryAfterSec,
  };
}

export type SubscriptionRow = {
  id: string;
  event: string;
  method: string;
  version: number;
  broadcaster_user_id?: number;
};

/** إنشاء اشتراك مزامنة أدخل أحداث محادثة القناة (webhook). */
export async function createChatWebhookSubscription(
  token: string,
  broadcasterUserId?: number,
): Promise<ApiCall<SubscriptionRow[]>> {
  const body: { events: { name: string; version: number }[]; method: "webhook"; broadcaster_user_id?: number } = {
    events: [{ name: "chat.message.sent", version: 1 }],
    method: "webhook",
  };
  if (broadcasterUserId) body.broadcaster_user_id = broadcasterUserId;
  return apiCall<SubscriptionRow[]>("/events/subscriptions", {
    method: "POST",
    body,
    accessToken: token,
  });
}

export async function listSubscriptions(
  token: string,
  broadcasterUserId?: number,
): Promise<ApiCall<SubscriptionRow[]>> {
  const qs = broadcasterUserId ? `?broadcaster_user_id=${broadcasterUserId}` : "";
  return apiCall<SubscriptionRow[]>(`/events/subscriptions${qs}`, { accessToken: token });
}

export async function deleteSubscriptions(
  token: string,
  ids: string[],
): Promise<ApiCall<null>> {
  const qs = ids.map((id) => `id=${encodeURIComponent(id)}`).join("&");
  return apiCall<null>(`/events/subscriptions?${qs}`, {
    method: "DELETE",
    accessToken: token,
  });
}

/** المفتاح العام للتاكد من تواقيع Webhook (مع كاش دوري خارج هذا الملف). */
export async function fetchPublicKey(): Promise<
  { ok: true; pem: string } | { ok: false; error: string }
> {
  try {
    const res = await fetch(`${KICK_API_BASE}/public/v1/public-key`, { cache: "no-store" });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const body = (await res.json()) as { data?: { public_key?: string }; public_key?: string };
    const pem = body.data?.public_key ?? body.public_key;
    if (!pem) return { ok: false, error: "لا يوجد public_key في الاستجابة" };
    return { ok: true, pem };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "خطأ شبكة" };
  }
}

/** حالة الاتصال المحلية المقابلة لسجل جهة الاتصال. */
export function connectionStatusLabel(state: ConnectionState | null): {
  label: string;
  tone: "connected" | "disconnected" | "error";
} {
  if (!state) return { label: "غير متصلة", tone: "disconnected" };
  switch (state.status) {
    case "CONNECTED":
      return { label: "متصلة", tone: "connected" };
    case "ERROR":
      return { label: "خطأ بالاتصال", tone: "error" };
    default:
      return { label: "غير متصلة", tone: "disconnected" };
  }
}
