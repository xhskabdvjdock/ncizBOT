import { execFileSync } from "node:child_process";
import path from "node:path";
import { resolveSchema, root } from "./prisma-schema.mjs";

/** ينشئ ترحيلًا جديدًا أثناء التطوير (migrate dev) على القاعدة المناسبة. */
const schema = resolveSchema();
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

console.log(`[prisma] migrate dev ← ${path.relative(root, schema)}`);
execFileSync(npx, ["prisma", "migrate", "dev", "--schema", schema], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
