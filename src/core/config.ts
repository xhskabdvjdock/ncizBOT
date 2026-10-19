import { z } from "zod";
import type { EventType } from "./states";

/**
 * إعداد الفعالية الكامل — يُخزَّن JSON نصيًا ويُوصَف هنا بمخطط Zod.
 * كل حقل هنا له أثر فعلي في محرك التنفيذ؛ لا توجد مفاتيح بلا استخدام.
 */

const commandSchema = z
  .string()
  .regex(/^![\p{L}\p{N}_+]{1,20}$/u, "الأمر يجب أن يبدأ بـ !دون فراغات، بحد 20 محرفًا");

export const eventConfigSchema = z
  .object({
    participation: z
      .object({
        joinOnce: z.boolean().default(true), // تسجيل مرة واحدة فقط لكل مشاهد
        lateRegistration: z.boolean().default(false), // السماح بالانضمام بعد البدء
        maxParticipants: z.number().int().min(2).max(1000).nullable().default(null),
        minParticipants: z.number().int().min(1).max(999).nullable().default(null),
        allowManualRemoval: z.boolean().default(true), // إزالة مشارك يدويًا يسمح بها الباين
      })
      .default({}),
    rules: z
      .object({
        revealAnswer: z.boolean().default(true), // كشف الإجابة الصحيحة بعد كل جولة
        awardAllCorrect: z.boolean().default(true), // منح نقاط كل الإجابات الصحيحة (الأسرع فقط يأخذ المكافأة)
        tieBreak: z
          .enum(["EARLIEST_REGISTRATION", "MOST_ROUND_WINS", "DRAW"])
          .default("EARLIEST_REGISTRATION"),
        defaultPoints: z.number().int().min(1).max(1000).default(100),
        defaultSpeedBonus: z.number().int().min(0).max(1000).default(0),
        defaultTimeLimitSec: z.number().int().min(5).max(600).default(30),
        maxAttemptsPerRound: z.number().int().min(1).max(5).default(1),
        caseSensitive: z.boolean().default(false), // لتحدي السرعة
        normalizeArabic: z.boolean().default(true),
      })
      .default({}),
    team: z
      .object({
        selection: z.enum(["CHOOSE", "BALANCED"]).default("CHOOSE"), // اختيار المشاهد أو موازنة تلقائية حتمية
        joinAfterStart: z.boolean().default(false),
        teams: z
          .array(
            z.object({
              key: z.enum(["red", "blue"]),
              label: z.string().min(1).max(24),
              aliases: z.array(z.string().min(1).max(24)).max(8),
            }),
          )
          .max(2)
          .default([
            { key: "red", label: "الأحمر", aliases: ["red", "احمر", "أحمر"] },
            { key: "blue", label: "الأزرق", aliases: ["blue", "ازرق", "أزرق"] },
          ]),
      })
      .default({}),
    autoCloseRegistrationSec: z
      .number()
      .int()
      .min(10)
      .max(86400)
      .nullable()
      .default(null),
    messages: z
      .object({
        regOpen: z.string().max(480).nullable().default(null),
        eventStart: z.string().max(480).nullable().default(null),
        question: z.string().max(480).nullable().default(null),
        roundResult: z.string().max(480).nullable().default(null),
        winner: z.string().max(480).nullable().default(null),
        cancelled: z.string().max(480).nullable().default(null),
        registered: z.string().max(200).nullable().default(null),
        alreadyRegistered: z.string().max(200).nullable().default(null),
        registrationClosed: z.string().max(200).nullable().default(null),
        registrationNotOpen: z.string().max(200).nullable().default(null),
        eventClosed: z.string().max(200).nullable().default(null),
        maxReached: z.string().max(200).nullable().default(null),
        lateJoinDenied: z.string().max(200).nullable().default(null),
        removed: z.string().max(200).nullable().default(null),
        left: z.string().max(200).nullable().default(null),
        notRegistered: z.string().max(200).nullable().default(null),
        attemptLimitReached: z.string().max(200).nullable().default(null),
        alreadyAnswered: z.string().max(200).nullable().default(null),
        wrongAnswer: z.string().max(200).nullable().default(null),
        help: z.string().max(480).nullable().default(null),
        eventInfo: z.string().max(480).nullable().default(null),
        score: z.string().max(200).nullable().default(null),
        paused: z.string().max(200).nullable().default(null),
      })
      .default({}),
  })
  .default({});

export type EventConfig = z.infer<typeof eventConfigSchema>;
export type TeamKey = "red" | "blue";

export type QuestionInput = {
  prompt: string;
  options: string[] | null; // خيارات التنويع المتعدد أو null للإجابة الحرة
  correctAnswers: string[]; // إجابات مقبولة (نص حر أو حرف التنويع)
  timeLimitSec: number;
  points: number;
  speedBonus: number;
  explanation: string | null;
};

export type EventDraftInput = {
  name: string;
  description: string | null;
  type: EventType;
  commands: {
    registration: string;
    leave: string;
    answer: string;
    team: string;
    score: string;
    help: string;
    eventInfo: string;
  };
  config: EventConfig;
  simulation: boolean;
  questions: QuestionInput[];
};

const draftInputSchema = z.object({
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().max(300).nullable().optional(),
  type: z.enum(["QUIZ", "SPEED", "TEAM_BATTLE"]),
  commands: z
    .object({
      registration: commandSchema,
      leave: commandSchema,
      answer: commandSchema,
      team: commandSchema,
      score: commandSchema,
      help: commandSchema,
      eventInfo: commandSchema,
    })
    .refine(
      (c) => new Set(Object.values(c)).size === Object.keys(c).length,
      "أوامر مكررة بين الحقول",
    ),
  config: eventConfigSchema,
  simulation: z.boolean().default(false),
  questions: z
    .array(
      z.object({
        prompt: z.string().trim().min(3).max(280),
        options: z.array(z.string().trim().min(1).max(120)).min(2).max(6).nullable(),
        correctAnswers: z
          .array(z.string().trim().min(1).max(120))
          .min(1)
          .max(10),
        timeLimitSec: z.number().int().min(5).max(600),
        points: z.number().int().min(1).max(1000),
        speedBonus: z.number().int().min(0).max(1000),
        explanation: z.string().trim().max(280).nullable(),
      }),
    )
    .min(1)
    .max(50),
});

export function parseDraftInput(raw: unknown): EventDraftInput {
  const parsed = draftInputSchema.parse(raw);
  for (const q of parsed.questions) {
    if (q.options) {
      // في أسئلة الخيارات: كل إجابة مقبولة يجب أن تُرقْم خيارًا موجودًا
      for (const answer of q.correctAnswers) {
        if (optionIndexFor(q, answer) === null) {
          throw new z.ZodError([
            {
              path: ["questions", "correctAnswers"],
              message: `الإجابة «${answer}» تشير إلى خيار غير موجود (المتوفر ${q.options.length})`,
              code: "custom",
            },
          ]);
        }
      }
    }
  }
  return parsed as EventDraftInput;
}

const ARABIC_OPTION_LETTERS: Record<string, number> = {
  أ: 0,
  ا: 0,
  إ: 0,
  آ: 0,
  ب: 1,
  ج: 2,
  د: 3,
  ه: 4,
  و: 5,
};

/** يعيد فهرس الخيار (0-based) إذا أشير إليه بحرف لاتيني/عربي/رقم، وإلا null. */
export function optionIndexFor(
  question: Pick<QuestionInput, "options">,
  raw: string,
): number | null {
  if (!question.options) return null;
  const s = raw.trim();
  if (/^[A-Za-z]$/.test(s)) {
    const idx = s.toUpperCase().charCodeAt(0) - 65; // A=0
    return idx >= 0 && idx < question.options.length ? idx : null;
  }
  if (s.length === 1 && s in ARABIC_OPTION_LETTERS) {
    const idx = ARABIC_OPTION_LETTERS[s];
    return idx < question.options.length ? idx : null;
  }
  if (/^\d{1,2}$/.test(s)) {
    const idx = parseInt(s, 10) - 1;
    return idx >= 0 && idx < question.options.length ? idx : null;
  }
  return null;
}
