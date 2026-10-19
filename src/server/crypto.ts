import crypto from "node:crypto";
import { env } from "./env";

/**
 * تشفير اعتمادات OAuth عند التخزين (AES-256-GCM).
 * صيغة السطر: v1:<iv-b64>:<tag-b64>:<cipher-b64>
 * المفتاح يأتي من APP_ENCRYPTION_KEY (hex 32 بايت أي 64 محرف).
 * لا تس>|سجلات ولا مخرجات تطبع الاعتماد أو المفتاح.
 */

function loadKey(userId = "default"): Buffer {
  const keyHex = env.encryptionKey;
  if (!keyHex) {
    throw new Error(
      "APP_ENCRYPTION_KEY غير مضبوط — لا يمكن تشفير/فك اعتمادات التخزين",
    );
  }
  const raw = Buffer.from(keyHex, "hex");
  if (raw.length !== 32) {
    throw new Error(
      "APP_ENCRYPTION_KEY يجب أن يكون 64 محرفًا hex (32 بايت)",
    );
  }
  return raw;
}

export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(encoded: string): string {
  const key = loadKey();
  const parts = encoded.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("شكل اعتماد مشفّر غير صالح");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivB64!, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64!, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64!, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}
