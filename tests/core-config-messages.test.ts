import { describe, expect, it } from "vitest";
import { parseDraftInput, optionIndexFor } from "@/core/config";
import { renderTemplate, graphemeLength, KICK_MAX_CHARS, fitsKickLimit, optionsLine } from "@/core/messages";

type Draft = import("@/core/config").EventDraftInput;

const validDraft = (): Draft =>
  ({
    name: "مسابقة الاختبار",
  description: null,
  type: "QUIZ",
  commands: {
    registration: "!join",
    leave: "!leave",
    answer: "!answer",
    team: "!team",
    score: "!score",
    help: "!help",
    eventInfo: "!event",
  },
  config: {},
  simulation: false,
  questions: [
    {
      prompt: "ما عاصمة عُمان؟",
      options: null,
      correctAnswers: ["مسقط"],
      timeLimitSec: 30,
      points: 100,
      speedBonus: 25,
      explanation: null,
    },
  ],
}) as unknown as Draft;

describe("parseDraftInput — بوابة الحفظ", () => {
  it("يقبل مسودة صحيحة ويجامل الإعدادات الافتراضية", () => {
    const d = parseDraftInput(validDraft());
    expect(d.config.rules.defaultPoints).toBe(100);
    expect(d.config.team.teams).toHaveLength(2);
    expect(d.questions[0]!.points).toBe(100);
  });

  it("يرفض أوامر مكررة", () => {
    const bad = validDraft();
    bad.commands.leave = "!join";
    expect(() => parseDraftInput(bad)).toThrow();
  });

  it("يرفض مسودة بلا أسئلة", () => {
    const bad = { ...validDraft(), questions: [] };
    expect(() => parseDraftInput(bad)).toThrow();
  });

  it("يرفض إجابة تشير إلى خيار غير موجود", () => {
    const bad = validDraft();
    bad.questions[0] = {
      prompt: "سؤال خيارات",
      options: ["خيار1", "خيار2"],
      correctAnswers: ["ج"], // الخيار الثالث غير موجود
      timeLimitSec: 20,
      points: 10,
      speedBonus: 0,
      explanation: null,
    };
    expect(() => parseDraftInput(bad)).toThrow();
  });

  it("يرفض اسمًا أقصر من 3 محارف", () => {
    const bad = { ...validDraft(), name: "ا" };
    expect(() => parseDraftInput(bad)).toThrow();
  });
});

describe("optionIndexFor", () => {
  it("يحل الحروف والأرقام", () => {
    expect(optionIndexFor({ options: ["a", "b", "c"] }, "أ")).toBe(0);
    expect(optionIndexFor({ options: ["a", "b", "c"] }, "C")).toBe(2);
    expect(optionIndexFor({ options: ["a", "b", "c"] }, "3")).toBe(2);
    expect(optionIndexFor({ options: ["a", "b"] }, "ج")).toBeNull();
    expect(optionIndexFor({ options: ["a", "b"] }, "نص")).toBeNull();
  });
});

describe("حدود رسائل كت", () => {
  it("يحسب الطول بالكتية لا بالمحارف الخام", () => {
    expect(graphemeLength("abc")).toBe(3);
    expect(graphemeLength("مرحبا")).toBe(5);
  });

  it("يقطع القالب عند 500 كت.", () => {
    const out = renderTemplate(
      "س".repeat(600),
      "",
      {},
    );
    expect(graphemeLength(out)).toBeLessThanOrEqual(KICK_MAX_CHARS);
    expect(fitsKickLimit(out)).toBe(true);
  });

  it("يعوض المتغيرات ويترك ما ليس متغيرًا معرفًا كما هو", () => {
    const out = renderTemplate(
      "أهلاً {username} في {event}! {unknown}",
      "",
      { username: "سالم", event: "المسابقة" },
    );
    expect(out).toBe("أهلاً سالم في المسابقة! {unknown}");
  });

  it("يسرد الخيارات بحروف A/B/C", () => {
    expect(optionsLine(["أحمد", "سعيد", "كرم"])).toBe("A) أحمد | B) سعيد | C) كرم");
  });
});
