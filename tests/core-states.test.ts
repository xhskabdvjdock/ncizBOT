import { describe, expect, it } from "vitest";
import {
  ALLOWED_TRANSITIONS,
  EVENT_STATUSES,
  DomainError,
  assertTransition,
  canPerform,
  resolveTransition,
  targetForAction,
} from "@/core/states";

describe("قوانين انتقالات الحالة", () => {
  it("يسمح بالمخطط الصحيح ويستبعد القفزات الخطأ", () => {
    // مسار سليم: DRAFT → READY → REG_OPEN → REG_CLOSED → RUNNING → COMPLETED
    assertTransition("DRAFT", "READY");
    assertTransition("READY", "REG_OPEN");
    assertTransition("REG_OPEN", "REG_CLOSED");
    assertTransition("REG_CLOSED", "RUNNING");
    assertTransition("RUNNING", "COMPLETED");

    // إلغاء صالح من كل الحالات النشطة
    for (const s of ["DRAFT", "READY", "REG_OPEN", "REG_CLOSED", "RUNNING"] as const) {
      assertTransition(s, "CANCELLED");
    }

    // غير مسموح
    expect(() => assertTransition("DRAFT", "RUNNING")).toThrow(DomainError);
    expect(() => assertTransition("REG_OPEN", "COMPLETED")).toThrow(DomainError);
    expect(() => assertTransition("COMPLETED", "RUNNING")).toThrow(DomainError);
    expect(() => assertTransition("CANCELLED", "READY")).toThrow(DomainError);
  });

  it("كل حالة معرفة خريطة انتقالاتها", () => {
    for (const s of EVENT_STATUSES) {
      expect(ALLOWED_TRANSITIONS[s]).toBeDefined();
    }
  });

  it("resolveTransition يحسم الهدف أو يرمي", () => {
    expect(resolveTransition("REG_OPEN", "START")).toBe("RUNNING");
    expect(resolveTransition("REG_CLOSED", "START")).toBe("RUNNING");
    expect(resolveTransition("READY", "START")).toBe("RUNNING");
    expect(() => resolveTransition("RUNNING", "START")).toThrow(DomainError);
    expect(() => resolveTransition("DRAFT", "OPEN_REGISTRATION")).toThrow(DomainError);
  });

  it("الأفعال متاحة فقط لحالاتها", () => {
    expect(canPerform("DRAFT", "PREPARE")).toBe(true);
    expect(canPerform("READY", "PREPARE")).toBe(false); // نفس الحالة = لا فعل
    expect(canPerform("RUNNING", "FINISH")).toBe(true);
    expect(canPerform("COMPLETED", "CANCEL")).toBe(false);
    expect(targetForAction("COMPLETED", "FINISH")).toBeUndefined();
  });
});
