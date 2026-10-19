import { createHash, randomBytes } from "node:crypto";

/**
 * إدارة البيئة — تُقرأ مرة واحدة، وتُفشل قرارات التشغيل بوضوح عند غياب مفاتيح حرجة.
 */

function read(key: string): string {
  return process.env[key] ?? "";
}

export const env = {
  get databaseUrl(): string {
    return read("DATABASE_URL");
  },
  get appBaseUrl(): string {
    return (read("APP_BASE_URL") || "http://localhost:3000").replace(/\/+$/, "");
  },
  get kickClientId(): string {
    return read("KICK_CLIENT_ID");
  },
  get kickClientSecret(): string {
    return read("KICK_CLIENT_SECRET");
  },
  /** رابط رجوع اختياري مسيطر عليه — يجب أن يطابق المسجَّل في تطبيق Kick حرفيًا (وإلا رفض Kick للطلب). */
  get kickRedirectUri(): string {
    return read("KICK_REDIRECT_URI").trim();
  },
  get sessionSecret(): string {
    return read("SESSION_SECRET");
  },
  get encryptionKey(): string {
    return read("APP_ENCRYPTION_KEY");
  },
  get hasKickCredentials(): boolean {
    return Boolean(read("KICK_CLIENT_ID") && read("KICK_CLIENT_SECRET"));
  },
  isProduction(): boolean {
    return process.env.NODE_ENV === "production";
  },
};

/** في Production يجب وجود SESSION_SECRET للتشغيل السليم. */
export function assertRuntimeEnv(): void {
  if (env.isProduction()) {
    if (!env.sessionSecret) {
      throw new Error("SESSION_SECRET مطلوب في وضع الإنتاج");
    }
    if (!env.encryptionKey) {
      throw new Error("APP_ENCRYPTION_KEY مطلوب في وضع الإنتاج");
    }
  }
}

/** كشف مفاتيح شكل سهل للمساعدة في التشغيل (README يحتوي التفاصيل). */
export function missingEnvKeys(): string[] {
  const missing: string[] = [];
  if (!env.databaseUrl) missing.push("DATABASE_URL");
  if (!env.sessionSecret) missing.push("SESSION_SECRET");
  if (!env.encryptionKey) missing.push("APP_ENCRYPTION_KEY");
  // KICK_CLIENT_* مطلوبة فقط عند الربط الحقيقي — لا نعطّل التطبيق بدونها
  return missing;
}

export function generateSecret(): string {
  return randomBytes(32).toString("hex");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
