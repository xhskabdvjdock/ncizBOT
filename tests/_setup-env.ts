import crypto from "node:crypto";

/**
 * اختبارات محرك دورة الحياة ضد قاعدة بيانات اختبار معزولة (SQLite).
 * env DATABASE_URL يُجمَد قبل أي استيراد لضبط Prisma على test.db.
 */

const __hoist = (globalThis as unknown as { __kep_test_env?: boolean }).__kep_test_env;
if (!__hoist) {
  (globalThis as unknown as { __kep_test_env?: boolean }).__kep_test_env = true;
  process.env.DATABASE_URL = "file:./prisma/test.db";
  process.env.APP_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
  process.env.SESSION_SECRET = crypto.randomBytes(32).toString("hex");
}
