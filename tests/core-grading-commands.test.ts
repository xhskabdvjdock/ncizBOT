import { describe, expect, it } from "vitest";
import {
  gradeAnswer,
  normalizeAnswerText,
  letterIndex,
  answerDisplay,
} from "@/core/grading";
import {
  cleanChatContent,
  parseCommand,
  commandMatches,
} from "@/core/command";

describe("تطبيع الإجابات العربية", () => {
  it("يوحّد الألف والهمزات والتاء المربوطة والتشكيل", () => {
    const opts = { caseSensitive: false, normalizeArabic: true };
    expect(normalizeAnswerText("إجابة", opts)).toBe("اجابه");
    expect(normalizeAnswerText("أحمد", opts)).toBe("احمد");
    expect(normalizeAnswerText("قَاهِرَة", opts)).toBe("قاهره");
    expect(normalizeAnswerText("مدرسيّة", opts)).toBe(normalizeAnswerText("مدرسية", opts));
  });

  it("يحترم حساسية الحروف عند تفعيلها", () => {
    const opts = { caseSensitive: true, normalizeArabic: false };
    expect(normalizeAnswerText("Fire", opts)).toBe("Fire");
    expect(normalizeAnswerText("fire", opts)).toBe("fire");
  });
});

describe("تمثيل حروف الخيارات", () => {
  it("يترجم A-D/أ-د/الأرقام إلى فهارس", () => {
    expect(letterIndex("a", 4)).toBe(0);
    expect(letterIndex("ب", 4)).toBe(1);
    expect(letterIndex("ج", 4)).toBe(2);
    expect(letterIndex("د", 4)).toBe(3);
    expect(letterIndex("ه", 6)).toBe(4); // خامس خيار يتاح عند 6 خيارات
    expect(letterIndex("2", 4)).toBe(1);
    expect(letterIndex("ه", 4)).toBeNull(); // الخامس غير موجود عند 4 خيارات
    expect(letterIndex("ه", 2)).toBeNull();
    expect(letterIndex("x", 3)).toBeNull();
    expect(letterIndex("زرقاء", 3)).toBeNull();
  });
});

describe("تقييم الإجابات", () => {
  const opts = { caseSensitive: false, normalizeArabic: true };

  it("أسئلة الخيارات: يقبل الحرف العربي أو اللاتيني أو الرقم", () => {
    const q = { options: ["الرياض", "جدة", "الدمام"], correctAnswers: ["ب"] };
    expect(gradeAnswer("ب", q, opts)).toBe(true);
    expect(gradeAnswer("B", q, opts)).toBe(true);
    expect(gradeAnswer("2", q, opts)).toBe(true);
    expect(gradeAnswer("جدة", q, opts)).toBe(true); // النص الكامل للخيار الصحيح
    expect(gradeAnswer("الرياض", q, opts)).toBe(false);
  });

  it("الإجابات الحرة: مطابقة بعد التطبيع", () => {
    const q = { options: null, correctAnswers: ["عمان", "عمّان"] };
    expect(gradeAnswer("عمان", q, opts)).toBe(true);
    expect(gradeAnswer("  عمان  ", q, opts)).toBe(true);
    expect(gradeAnswer("مسقط", q, opts)).toBe(false);
  });

  it("يرفض نصًا فارغًا", () => {
    const q = { options: null, correctAnswers: ["شئ"] };
    expect(gradeAnswer("   ", q, opts)).toBe(false);
  });
});

describe("تنقية المحادثة وتحليل الأوامر", () => {
  it("يزيل رموز الإيموت ويسهل الفراغات", () => {
    const cleaned = cleanChatContent("[emote:12345:pog] !join [emote:9:x]");
    expect(cleaned).toBe("!join");
  });

  it("يحلل الأمر والحجج", () => {
    expect(parseCommand("!answer ب")).toEqual({
      kind: "command",
      command: "answer",
      args: ["ب"],
      raw: "!answer ب",
    });
    expect(parseCommand("مرحبا")).toEqual({ kind: "none" });
    expect(parseCommand("!answer")).toMatchObject({ command: "answer", args: [] });
  });

  it("مطابقة الأوامر غير حساسة للهمزات والحالة", () => {
    expect(commandMatches("!JOIN", "!join")).toBe(true);
    expect(commandMatches("!إجابة", "!اجابة")).toBe(true);
    expect(commandMatches("!answer", "!leave")).toBe(false);
  });

  it("يُظهر عرض الإجابة الصحيحة", () => {
    expect(answerDisplay({ options: ["أحمد", "سعيد"], correctAnswers: ["A"] })).toContain("أحمد");
    expect(answerDisplay({ options: null, correctAnswers: ["القاهرة"] })).toBe("القاهرة");
  });
});
