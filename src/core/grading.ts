/**
 * تطبيع النصوص وتقييم الإجابات — منطق نقي بلا I/O.
 * لا يُقيَّم أي نص وارد كشيفرة، فقط كنص للمطابقة.
 */

const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

export type GradingOptions = {
  caseSensitive: boolean;
  normalizeArabic: boolean;
};

export function normalizeAnswerText(
  raw: string,
  opts: GradingOptions,
): string {
  let s = raw.trim();
  // إزالة محارف التحكم والاتجاه والفواصل الصفرية
  s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "");
  s = s.replace(/\s+/g, " ");
  if (opts.normalizeArabic) {
    s = s.replace(ARABIC_DIACRITICS, "");
    s = s
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ؤ/g, "و")
      .replace(/ئ/g, "ي")
      .replace(/ة/g, "ه");
  }
  if (!opts.caseSensitive) {
    s = s.toLowerCase();
  }
  return s;
}

/** تحويل أمرِittäin إلى شكل مقارنة موحد (بدون تغيير المعنى). */
export function toLowerArabicAware(name: string): string {
  return name
    .replace(/[أإآ]/g, "ا")
    .replace(/[ىئ]/g, "ي")
    .toLowerCase();
}

const ARABIC_OPTION_LETTERS: Record<string, number> = {
  ا: 0,
  أ: 0,
  إ: 0,
  آ: 0,
  ب: 1,
  ج: 2,
  د: 3,
  ه: 4,
  و: 5,
};

/** حرف تنويع (لاتيني/عربي/رقم) إلى فهرس خيار أو null إذا لم يكن حرف اختيار. */
export function letterIndex(raw: string, optionCount: number): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (s.length === 1 && /^[A-Za-z]$/.test(s)) {
    const idx = s.toUpperCase().charCodeAt(0) - 65;
    return idx >= 0 && idx < optionCount ? idx : null;
  }
  if (s.length === 1 && s in ARABIC_OPTION_LETTERS) {
    const idx = ARABIC_OPTION_LETTERS[s];
    return idx < optionCount ? idx : null;
  }
  if (/^\d{1,2}$/.test(s)) {
    const idx = parseInt(s, 10) - 1;
    return idx >= 0 && idx < optionCount ? idx : null;
  }
  return null;
}

/**
 * يقيّم نص إجابة ضد سؤال:
 * - أسئلة الخيارات: يقبل الحرف (A/a، أ، ب، ج، د، 1..6) أو النص المطابق للخيار بعد التطبيع.
 * - الإجابات الحرة: مطابقة ضد قائمة الإجابات المقبولة بعد التطبيع.
 */
export function gradeAnswer(
  response: string,
  question: { options: string[] | null; correctAnswers: string[] },
  opts: GradingOptions,
): boolean {
  const normalized = normalizeAnswerText(response, opts);
  if (!normalized) return false;

  if (question.options && question.options.length > 0) {
    const idx = letterIndex(response, question.options.length);
    if (idx !== null) {
      return question.correctAnswers.some((a) => {
        const answerIdx = letterIndex(a, question.options!.length);
        return answerIdx !== null ? answerIdx === idx : false;
      });
    }
    // النص الكامل لخيار مقبول
    return question.correctAnswers.some((a) => {
      const answerIdx = letterIndex(a, question.options!.length);
      if (answerIdx !== null) {
        return (
          normalizeAnswerText(question.options![answerIdx], opts) === normalized
        );
      }
      return normalizeAnswerText(a, opts) === normalized;
    });
  }

  return question.correctAnswers.some(
    (a) => normalizeAnswerText(a, opts) === normalized,
  );
}

/** يُكشف حرف الإجابة الصحيحة الأول (لعرضه في لوحة التحكم). */
export function answerDisplay(
  question: { options: string[] | null; correctAnswers: string[] },
): string {
  if (question.options && question.options.length > 0) {
    const first = question.correctAnswers[0];
    if (first === undefined) return "غير معرّفة";
    const idx = letterIndex(first, question.options.length);
    if (idx !== null) {
      return letter(idx) + " — " + question.options[idx];
    }
    return first;
  }
  return question.correctAnswers[0] ?? "غير معرّفة";
}

function letter(index: number): string {
  return String.fromCharCode(65 + index);
}
