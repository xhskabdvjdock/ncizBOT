import { execFileSync } from "node:child_process";
import path from "node:path";
import { resolveSchema, root } from "./prisma-schema.mjs";

/** يفتح Prisma Studio على المخطط المناسب حسب نوع DATABASE_URL. */
const schema = resolveSchema();
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

console.log(`[prisma] studio ← ${path.relative(root, schema)}`);
execFileSync(npx, ["prisma", "studio", "--schema", schema], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
