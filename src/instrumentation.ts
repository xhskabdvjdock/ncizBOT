/**
 * تهيئة الخادم عند الإقلاع — تشغيل مجدول الخلفية على بيئة nodejs فقط.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/server/engine/scheduler");
    startScheduler();
  }
}
