import crypto from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  extractKickHeaders,
  verifyWithPem,
} from "@/server/kick/webhook-verify";

/**
 * اختبار تحقق التواقيع بزوج RSA متولَّد إختبارًا — لا اعتماد على Kick الفعلي.
 * المفتاح العام هنا يجسّد ما يُعاد من GET /public/v1/public-key بصيغة TXT/DNS? ×
 */
describe("تواقيع Webhook (RSA PKCS1v15-SHA256)", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const publicPem = publicKey.export({ type: "spki", format: "pem" }) as string;

  const body = JSON.stringify({
    broadcaster: { user_id: 1, username: "streamer" },
    sender: { user_id: 2, username: "viewer" },
    content: "!join",
  });
  const messageId = "msg-123";
  const timestamp = new Date().toISOString();

  const sign = (mid: string, ts: string, raw: string) =>
    crypto
      .sign("sha256", Buffer.from(`${mid}.${ts}.${raw}`, "utf8"), {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      })
      .toString("base64");

  const goodHeaders = new Headers({
    "kick-event-message-id": messageId,
    "kick-event-subscription-id": "sub-1",
    "kick-event-signature": "",
    "kick-event-message-timestamp": timestamp,
    "kick-event-type": "chat.message.sent",
    "kick-event-version": "1",
  });

  it("verifyWithPem يقبل توقيعًا صحيحًا ويرفض تلاعبًا بالجسم", () => {
    const sig = sign(messageId, timestamp, body);
    expect(verifyWithPem(publicPem, { messageId, timestamp, body }, sig)).toBe(true);

    const tampered = body.replace("!join", "!leave");
    expect(
      verifyWithPem(publicPem, { messageId, timestamp, body: tampered }, sig),
    ).toBe(false);

    expect(
      verifyWithPem(publicPem, { messageId: "other", timestamp, body }, sig),
    ).toBe(false);

    expect(
      verifyWithPem(publicPem, { messageId, timestamp: "2020-01-01T00:00:00Z", body }, sig),
    ).toBe(false);
  });

  it("extractKickHeaders يستخرج الرؤوس المطلوبة ويرفض الناقص", () => {
    const h = new Headers({
      "kick-event-message-id": "m1",
      "kick-event-signature": "sig",
      "kick-event-message-timestamp": new Date().toISOString(),
      "kick-event-type": "chat.message.sent",
      "kick-event-subscription-id": "s1",
      "kick-event-version": "1",
    });
    expect(extractKickHeaders(h)).toMatchObject({ messageId: "m1", subscriptionId: "s1" });

    const missing = new Headers({ "kick-event-type": "chat.message.sent" });
    expect(extractKickHeaders(missing)).toBeNull();
  });
});
