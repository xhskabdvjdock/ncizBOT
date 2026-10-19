import { execFileSync } from "node:child_process";
import path from "node:path";
import { resolveSchema, root } from "./prisma-schema.mjs";

/** يطبّق ترحيلات الإنتاج (migrate deploy) على قاعدة البيانات المناسبة. */
const schema = resolveSchema();
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

console.log(`[prisma] migrate deploy ← ${path.relative(root, schema)}`);
execFileSync(npx, ["prisma", "migrate", "deploy", "--schema", schema], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
