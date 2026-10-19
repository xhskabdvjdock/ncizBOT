import { randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { env } from "./env";

/**
 * مصادقة لوحة التحكم: حساب تطبيق + جلسات بصيغة كوكي httpOnly.
 * لا يرد أي شيء من اعتمادات Kick للمتصفح — تلك وزن الخادم وحده.
 */

export const SESSION_COOKIE = "kep_session";
export const SESSION_TTL_DAYS = 30;

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

export function newSessionId(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(userId: string): Promise<{ id: string; expiresAt: Date }> {
  const id = newSessionId();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await db.session.create({ data: { id, userId, expiresAt } });
  return { id, expiresAt };
}

export async function getSessionUser(
  sessionId: string | undefined | null,
): Promise<SessionUser | null> {
  if (!sessionId || sessionId.length < 20 || sessionId.length > 120) return null;
  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return {
    id: session.user.id,
    email: session.user.email,
    displayName: session.user.displayName,
  };
}

export async function destroySession(sessionId: string): Promise<void> {
  await db.session.deleteMany({ where: { id: sessionId } });
}

/** مقارنات سلسلة آمنة إحصائيًا (للحالات النادرة). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a.padEnd(64, "="), "utf8");
  const bb = Buffer.from(b.padEnd(64, "="), "utf8");
  return timingSafeEqual(ab.slice(0, 64), bb.slice(0, 64));
}

export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.isProduction(),
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export const SESSION_MAX_AGE = SESSION_TTL_DAYS * 86_400;
