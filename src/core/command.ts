/**
 * معالجة أوامر المحادثة — تنقية آمنة وبدون أي تقييم للنص الوارد.
 * النص من الغرفة غير موثوق: يُعامَل دومًا كنص عادي.
 */

export const EMOTE_TOKEN_RE = /\[emote:\d+:[^\]]*\]/g;

/** ينقّي نص رسالة Kick: يزيل رموز الإيموت، والمسافات الزائدة. */
export function cleanChatContent(raw: string): string {
  return raw.replace(EMOTE_TOKEN_RE, " ").replace(/\s+/g, " ").trim();
}

const DEFAULT_PREFIX = "!";

export type ParsedCommand =
  | { kind: "none" }
  | { kind: "command"; command: string; args: string[]; raw: string };

/** يحلل أول كلمة كأمر مع بادئة (غير حساس لحالة الأحرف). */
export function parseCommand(
  raw: string,
  prefix: string = DEFAULT_PREFIX,
): ParsedCommand {
  const text = cleanChatContent(raw);
  if (!text.startsWith(prefix)) return { kind: "none" };
  const after = text.slice(prefix.length);
  if (!after) return { kind: "none" };
  const parts = after.split(" ");
  const name = lowerCommand(parts[0] ?? "");
  if (!name) return { kind: "none" };
  const args = parts.slice(1).filter((a) => a.length > 0);
  return { kind: "command", command: name, args, raw: text };
}

import { toLowerArabicAware } from "./grading";

function lowerCommand(name: string): string {
  return toLowerArabicAware(name);
}

/** يساوي بين أمر كتبه المشاهد وأمامر مُعدّة (غير حساس للحالة/الهمزات). */
export function commandMatches(input: string, configured: string): boolean {
  return (
    lowerCommand(stripPrefix(input)) === lowerCommand(stripPrefix(configured))
  );
}

function stripPrefix(cmd: string): string {
  return cmd.startsWith("!") ? cmd.slice(1) : cmd;
}

/** حدود حماية على مستوى المشاهد (تنفيذها في الخادم فقط). */
export const COMMAND_RATE_LIMIT = {
  windowMs: 10_000,
  maxActions: 6,
};
