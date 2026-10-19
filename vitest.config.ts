import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: false,
    testTimeout: 30000,
    // قاعدة بيانات SQLite واحدة لملفات الاختبار — تشغيل تسلسلي لتفادي تفاعل القفل
    fileParallelism: false,
    globalSetup: "./tests/global-setup.ts",
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
