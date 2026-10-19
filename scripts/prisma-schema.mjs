import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * مصدر الحقيقة هو prisma/schema.prisma (SQLite للتطوير والاختبارات).
 * عند وجود DATABASE_URL يبدأ بـ postgres، نولّد نسخة PostgreSQL
 * في prisma/postgres/schema.prisma ونستخدم ترحيلاتها الخاصة.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(here, "..");
export const sqliteSchema = path.join(root, "prisma", "schema.prisma");
export const postgresDir = path.join(root, "prisma", "postgres");
export const postgresSchema = path.join(postgresDir, "schema.prisma");

export function isPostgresUrl(url = process.env.DATABASE_URL ?? "") {
  return /^postgres(ql)?:\/\//i.test(url.trim());
}

export function syncPostgresSchema() {
  if (!fs.existsSync(sqliteSchema)) {
    throw new Error(`لم أجد مخطط Prisma: ${sqliteSchema}`);
  }
  const source = fs.readFileSync(sqliteSchema, "utf8");
  if (!/provider\s*=\s*"sqlite"/.test(source)) {
    throw new Error(
      'prisma/schema.prisma يجب أن يحتوي provider = "sqlite" حتى نولّد نسخة PostgreSQL',
    );
  }

  const generated = source
    .replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"')
    .replace(
      /^\/\/ مخطط قاعدة البيانات.*$/m,
      "// مخطط قاعدة البيانات — نسخة PostgreSQL مولّدة من prisma/schema.prisma\n// لا تعدّل هذا الملف يدويًا؛ عدّل المصدر ثم شغّل: npm run db:sync:pg",
    )
    .replace(
      /^\/\/ ملاحظة: النوع Enum غير مدعوم في SQLite.*\r?\n\/\/ ويتم التحقق منها في طبقة التطبيق.*$/m,
      "// ملاحظة: الأنواع محفوظة كنصوص ويتم التحقق منها في src/core عبر Zod.",
    );

  fs.mkdirSync(postgresDir, { recursive: true });
  fs.writeFileSync(postgresSchema, generated, "utf8");
  return postgresSchema;
}

export function resolveSchema() {
  return isPostgresUrl() ? syncPostgresSchema() : sqliteSchema;
}

// تشغيل مباشر: node scripts/prisma-schema.mjs
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const schema = syncPostgresSchema();
  console.log(`[prisma] generated ${path.relative(root, schema)}`);
}
