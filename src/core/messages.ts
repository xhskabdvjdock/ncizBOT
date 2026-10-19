import type { EventConfig } from "./config";
import type { EventType, EventStatus } from "./states";

/**
 * رسائل الإعلانات: قوالب افتراضية عربية + تعويض متغيرات + حدود كت.
 * الأحرف تُحسب كُتية (Grapheme Clusters) وفق توثيق كت: 500 حرف.
 */

export type TemplateVars = Record<string, string | number | null | undefined>;

export function renderTemplate(
  template: string | null,
  fallback: string,
  vars: TemplateVars,
): string {
  let out = (template ?? fallback) as string;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{${key}}`, value == null ? "" : String(value));
  }
  return collapseSpaces(out).slice(0, KICK_MAX_CHARS);
}

export function collapseSpaces(s: string): string {
  return s.replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").trim();
}

/** 500 عنقود زخرفي — تقدير عملي عبر Intl.Segmenter مع تراجع آمن. */
export function graphemeLength(s: string): number {
  const SegmenterCtor = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (SegmenterCtor) {
    try {
      const seg = new SegmenterCtor("ar", { granularity: "grapheme" });
      let n = 0;
      for (const _ of seg.segment(s)) n++;
      return n;
    } catch {
      /* تراجع */
    }
  }
  return [...s].length;
}

export const KICK_MAX_CHARS = 500;

export function fitsKickLimit(content: string): boolean {
  return graphemeLength(content) <= KICK_MAX_CHARS;
}

export type MessageKey = keyof EventConfig["messages"];

type DefaultSpec = { key: string; fallback: string };

export const DEFAULT_MESSAGES: Record<keyof EventConfig["messages"], string> = {
  regOpen: "لقد انطلق تسجيل «{event}» من نوع {type}! للانضمام أرسل {join} في المحادثة. {slots}",
  eventStart:
    "انطلقت «{event}» رسميًا بين {participants} من المشاركين، {rounds} جولات بانتظاركم — بالتوفيق للجميع!",
  question:
    "السؤال {round}/{rounds}: {question}\n{options}\nأرسل إجابتك بـ {answerCmd} [الحرف أو الإجابة] خلال {time} ثانية.",
  roundResult:
    "انتهت الجولة {round}. الإجابة الصحيحة: {answer}{answerExplanation}",
  winner:
    "انتهت «{event}»! الفائز الأول: {winner} بـ {score} نقطة. تحية للجميع على المشاركة!",
  cancelled: "تم إلغاء فعالية «{event}». الفعالية القادمة على أتم الاستعداد — ترقبوا!",
  registered: "{username}، تم تسجيلك في «{event}». {count}{slots}",
  alreadyRegistered: "{username}، أنت مسجل مسبقًا في «{event}». ترقب البدء.",
  registrationClosed: "أُغلق تسجيل «{event}». المشاركون المسجلون: {count}.",
  registrationNotOpen: "تسجيل «{event}» غير مفتوح الآن.",
  eventClosed: "كانت «{event}» قد انتهت أو أُلغيت — لا تسجيل.",
  maxReached: "اكتمل العدد الأقصى ({max}) لـ «{event}». حظًا موفقًا في المرة القادمة!",
  lateJoinDenied: "«{event}» قد بدأت والتسجيل المتأخر مغلق. نراك في الفعالية القادمة.",
  removed: "{username} أُزيل من «{event}».",
  left: "{username}، تم إخراجك من «{event}». إلى اللقاء.",
  notRegistered: "{username}، لم تسجل بعد! أرسل {join} للمشاركة.",
  attemptLimitReached: "{username}، استهلكت محاولاتك لهذه الجولة ({max}).",
  alreadyAnswered: "{username}، إجابتك لهذه الجولة مقبولة بالفعل — ترقب النتيجة.",
  wrongAnswer: "{username}، إجابة غير صحيحة — حاول لاحقًا إن سَمح العدد.",
  help: "أوامر الفعاليات: {join} للانضمام، {leave} للانسحاب، {answerCmd} [إجابة] للإجابة، {score} لإظهار ترتيبك، {eventInfo} لحالة الفعالية، {help} للمساعدة.",
  eventInfo: "الفعالية «{event}» — الحالة: {status}. {extra}",
  score: "{username}: {rank}/{count} بـ {score} نقطة ({correct} صحيحة).",
  paused: "توقف مؤقت في «{event}» — نعود بعد قليل.",
};

export function defaultTemplates(): Record<string, string> {
  return { ...DEFAULT_MESSAGES };
}

export function templateFallback(key: string): string {
  return DEFAULT_MESSAGES[key as MessageKey] ?? "";
}

/** ترميز سطر الخيارات للعرض: A) نص B) نص … */
export function optionsLine(options: string[]): string {
  return options.map((o, i) => letter(i) + ") " + o).join(" | ");
}

function letter(index: number): string {
  return String.fromCharCode(65 + index);
}

/** وصف مساحة المشاركة المتبقية لإعلان التسجيل. */
export function slotsText(
  count: number,
  max: number | null | undefined,
): string {
  if (max == null) return "";
  const left = Math.max(0, max - count);
  return left > 0 ? `تبقى ${left} مكانًا.` : "اكتملت الأماكن.";
}

export type MessageKind =
  | "REG_OPEN"
  | "EVENT_START"
  | "QUESTION"
  | "ROUND_RESULT"
  | "WINNER"
  | "CANCELLED"
  | "PAUSED"
  | "INFO_REPLY";

/**
 * أنواع الرسائل الوارد من المستخدم تقابل مفاتيح القوالب.
 * المفتاح الذي يُستخدم عند الغياب: للردود الفردية من settings.channel أو الافتراضية.
 */
export function messageKindForTemplate(
  key: string,
): Pick<DefaultSpec, "key"> {
  return { key };
}

/** كت تطبّق حدود إرسال على المحادثة (يرد 429 عند التجاوز). حدّنا الداخلي أثقل منه بقصد؛ راقِب Retry-After عند ظهوره. */
export const SAFE_SEND_INTERVAL_MS = 1200;
