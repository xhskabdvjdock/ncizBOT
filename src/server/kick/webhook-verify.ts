import crypto from "node:crypto";
import { fetchPublicKey } from "./client";

/**
 * تحقق تواقيع Webhook الخاصة بـ Kick:
 * التوقيع: RSA-PKCS1v15-SHA256 على النص (messageId.timestamp.rawBody) بترمييز base64.
 * المفتاح العام يجيب وفقها من /public/v1/public-key — يُخزَّن مؤقتًا مع دورة تحديث،
 * ولا يُثبَّت مرمّزًا (قد يتغير في أي لحظة من جهة Kick).
 */

const CACHE_TTL_MS = 10 * 60 * 1000;

type CachedKey = { pem: string; loadedAt: number };

const globalCache = globalThis as unknown as { __kep_pubkey?: CachedKey };

export async function getKickPublicKey(force = false): Promise<
  { ok: true; pem: string } | { ok: false; error: string }
> {
  const cached = globalCache.__kep_pubkey;
  if (
    !force &&
    cached &&
    Date.now() - cached.loadedAt < CACHE_TTL_MS
  ) {
    return { ok: true, pem: cached.pem };
  }
  const fetched = await fetchPublicKey();
  if (!fetched.ok) return fetched;
  globalCache.__kep_pubkey = { pem: fetched.pem, loadedAt: Date.now() };
  return fetched;
}

export type KickWebhookHeaders = {
  messageId: string; // Kick-Event-Message-Id
  subscriptionId: string; // Kick-Event-Subscription-Id
  signature: string; // Kick-Event-Signature (base64)
  timestamp: string; // Kick-Event-Message-Timestamp (RFC3339)
  eventType: string; // Kick-Event-Type
  version: string; // Kick-Event-Version
};

export function extractKickHeaders(h: Headers): KickWebhookHeaders | null {
  const messageId = h.get("kick-event-message-id");
  const subscriptionId = h.get("kick-event-subscription-id");
  const signature = h.get("kick-event-signature");
  const timestamp = h.get("kick-event-message-timestamp");
  const eventType = h.get("kick-event-type");
  const version = h.get("kick-event-version");
  if (!messageId || !signature || !timestamp || !eventType) return null;
  return {
    messageId,
    subscriptionId: subscriptionId ?? "",
    signature,
    timestamp,
    eventType,
    version: version ?? "1",
  };
}

/**
 * يتحقق من التوقيع على الجسم الخام. يجب تمرير الجسم كما وصل حرفيًا (بلا إعادة ترميز).
 * أيضاً يرفض الرسائل الأقدم من 10 دقائق أو المستقبلية (ردح ساعة بسيط) لنيّة إبطال إعادة اللعب.
 */
export async function verifyKickWebhook(
  headers: KickWebhookHeaders,
  rawBody: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!rawBody) return { ok: false, reason: "جسم فارغ" };
  const pk = await getKickPublicKey();
  if (!pk.ok) return { ok: false, reason: `تعذّر جلب المفتاح العام: ${pk.error}` };

  const ts = Date.parse(headers.timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "طابع زمني غير صالح" };
  const skew = Math.abs(Date.now() - ts);
  if (skew > 10 * 60 * 1000) {
    return { ok: false, reason: "طابع زمني خارج النطاق (حماية إعادة اللعب)" };
  }

  const payload = `${headers.messageId}.${headers.timestamp}.${rawBody}`;
  const sigBuf = Buffer.from(headers.signature, "base64");
  if (sigBuf.length === 0) return { ok: false, reason: "توقيع فارغ" };

  const keyObj = crypto.createPublicKey(pk.pem);
  const verified = crypto.verify(
    "sha256",
    Buffer.from(payload, "utf8"),
    keyObj,
    sigBuf,
  );
  if (!verified) return { ok: false, reason: "توقيع غير متطابق" };
  return { ok: true };
}

/** التحقق للاختبارات: مفتاح مكشوف معلوم. */
export function verifyWithPem(
  pem: string,
  payload: { messageId: string; timestamp: string; body: string },
  signatureB64: string,
): boolean {
  const keyObj = crypto.createPublicKey(pem);
  const payloadStr = `${payload.messageId}.${payload.timestamp}.${payload.body}`;
  return crypto.verify(
    "sha256",
    Buffer.from(payloadStr, "utf8"),
    keyObj,
    Buffer.from(signatureB64, "base64"),
  );
}
