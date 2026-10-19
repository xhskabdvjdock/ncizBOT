import { describe, expect, it } from "vitest";
import {
  rankStandings,
  computeResult,
  computeTeamScores,
  balancedTeamFor,
  pickFirstCorrect,
  type StandingRow,
} from "@/core/scoring";

const row = (
  id: string,
  score: number,
  joinedAt: string,
  extra: Partial<StandingRow> = {},
): StandingRow => ({
  participantId: id,
  username: id,
  team: null,
  score,
  correctCount: score > 0 ? Math.max(1, Math.floor(score / 100)) : 0,
  attempts: 1,
  joinedAt,
  roundWins: 0,
  ...extra,
});

describe("rankStandings — ترتيب تنازلي حتمي", () => {
  it("يعيد ترتيب الأعلى نقاط أولًا", () => {
    const rows = [row("a", 100, "2026-01-01T00:00:00Z"), row("b", 300, "2026-01-01T00:00:02Z")];
    const ranked = rankStandings(rows, "EARLIEST_REGISTRATION");
    expect(ranked[0]!.participantId).toBe("b");
    expect(ranked[1]!.participantId).toBe("a");
  });

  it("يحسم التعادل بحسب قاعدة الأسبق تسجيلًا", () => {
    const rows = [
      row("late", 200, "2026-01-01T01:00:00Z"),
      row("early", 200, "2026-01-01T00:30:00Z"),
    ];
    const ranked = rankStandings(rows, "EARLIEST_REGISTRATION");
    expect(ranked[0]!.participantId).toBe("early");
  });

  it("الأكثر جولات فائزة (MOST_ROUND_WINS) يحسم عند تساوي النقاط", () => {
    const rows = [
      row("noWins", 150, "2026-01-01T00:00:00Z", { roundWins: 0 }),
      row("winner", 150, "2026-01-01T00:05:00Z", { roundWins: 2 }),
    ];
    const ranked = rankStandings(rows, "MOST_ROUND_WINS");
    expect(ranked[0]!.participantId).toBe("winner");
  });

  it("قاعدة DRAW تُبقي الترتيب حروفًا مستقرًا", () => {
    const rows = [row("zz", 110, "2026-01-02T00:00:00Z"), row("aa", 110, "2026-01-01T00:00:00Z")];
    const ranked = rankStandings(rows, "DRAW");
    expect(ranked[0]!.participantId).toBe("aa");
  });
});

describe("computeResult — الفائز والتعادل بلا مفاجآت", () => {
  it("فائز وحيد عند تفرد الأعلى", () => {
    const r = computeResult([row("a", 100, "2026-01-01T00:00:00Z"), row("b", 50, "2026-01-01T00:00:00Z")], "EARLIEST_REGISTRATION");
    expect(r.outcome).toBe("WINNER");
    expect(r.winnerParticipantId).toBe("a");
  });

  it("كل النقاط صفر → لا فائز مفرد (بلا فائز مزيف)", () => {
    const r = computeResult([row("a", 0, "2026-01-01T00:00:00Z"), row("b", 0, "2026-01-01T00:01:00Z")], "EARLIEST_REGISTRATION");
    expect(r.outcome).toBe("DRAW");
    expect(r.winnerParticipantId).toBeNull();
  });

  it("خيار التعادل الصريح مع نقطتين متساويتين → تعادل", () => {
    const r = computeResult([row("a", 120, "2026-01-01T00:00:00Z"), row("b", 120, "2026-01-01T00:00:00Z")], "DRAW");
    expect(r.outcome).toBe("DRAW");
  });

  it("بلا مشاركين → NO_PARTICIPANTS", () => {
    const r = computeResult([], "EARLIEST_REGISTRATION");
    expect(r.outcome).toBe("NO_PARTICIPANTS");
  });
});

describe("الفرق", () => {
  it("يجمع نقاط كل فريق وعدد أعضائه", () => {
    const standings = [
      row("1", 100, "x", { team: "red" }),
      row("2", 50, "x", { team: "red" }),
      row("3", 200, "x", { team: "blue" }),
    ];
    const teams = computeTeamScores(standings, [
      { key: "red", label: "الأحمر" },
      { key: "blue", label: "الأزرق" },
    ]);
    const red = teams.find((t) => t.key === "red")!;
    const blue = teams.find((t) => t.key === "blue")!;
    expect(red.score).toBe(150);
    expect(red.members).toBe(2);
    expect(blue.score).toBe(200);
    expect(blue.members).toBe(1);
  });

  it("الموازنة الحتمية تتعامل مع الفريق الأصغر وأولية الإعداد عند التساوي", () => {
    const teams = [{ key: "red" }, { key: "blue" }];
    expect(balancedTeamFor({ red: 3, blue: 2 }, teams)).toBe("blue");
    expect(balancedTeamFor({ red: 0, blue: 0 }, teams)).toBe("red"); // التساوي = الأول
  });

  it("فائز الجولة: أول إجابة صحيحة زمنيًا", () => {
    const winner = pickFirstCorrect([
      { participantId: "a", correct: true, at: 2000 },
      { participantId: "b", correct: true, at: 1000 },
      { participantId: "c", correct: false, at: 500 },
    ]);
    expect(winner?.participantId).toBe("b");
    expect(pickFirstCorrect([{ participantId: "c", correct: false, at: 1 }])).toBeNull();
  });
});
