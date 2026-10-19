import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * تجهيز قاعدة بيانات اختبار معزولة قبل تشغيل أي اختبار.
 * لا تلمس قاعدة بيانات التطوير مطلقًا.
 */
export default function globalSetup(): void {
  const dbPath = path.resolve(__dirname, "../prisma/prisma/test.db");
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(dbPath + suffix, { force: true });
  }
  // المخطط الافتراضي SQLite — نعيد توليد العميل دائمًا حتى لا يبقى
  // عميل PostgreSQL من آخر بناء إنتاجي ويُفشل الاختبارات.
  execSync("npx prisma generate", {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: "file:./prisma/test.db" },
    stdio: "inherit",
  });
  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: "file:./prisma/test.db" },
    stdio: "inherit",
  });
}
