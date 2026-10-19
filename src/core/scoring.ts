/**
 * التنقيط والترتيب — حتمي بالكامل وقابل للاختبار بمعزل عن قاعدة البيانات وواجهة المستخدم.
 */

export type StandingRow = {
  participantId: string;
  username: string;
  team: string | null;
  score: number;
  correctCount: number;
  attempts: number;
  joinedAt: string; // ISO
  roundWins: number;
};

export type TieBreakRule = "EARLIEST_REGISTRATION" | "MOST_ROUND_WINS" | "DRAW";

/**
 * ترتيب تنازلي حتمي:
 * 1) النقاط (الأعلى أولاً)
 * 2) قاعدة فك التعادل المُعدَّة
 * 3) اسم المستخدم ترتيبًا معجميًا (كسر نهائي ليكون الناتج مستقرًا دائمًا)
 */
export function rankStandings(
  rows: StandingRow[],
  tieBreak: TieBreakRule,
): StandingRow[] {
  return [...rows].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    switch (tieBreak) {
      case "EARLIEST_REGISTRATION":
        return compareTime(a.joinedAt, b.joinedAt);
      case "MOST_ROUND_WINS":
        if (b.roundWins !== a.roundWins) return b.roundWins - a.roundWins;
        return compareTime(a.joinedAt, b.joinedAt);
      case "DRAW":
        return a.username.localeCompare(b.username, "ar");
    }
  });
}

function compareTime(a: string, b: string): number {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (ta !== tb) return ta < tb ? -1 : 1;
  return 0;
}

export type RoundWinner = { participantId: string };

/** فائز الجولة: أول إجابة صحيحة حسب زمن الاستلام. */
export function pickFirstCorrect<T extends { correct: boolean; at: number; participantId: string }>(
  answers: T[],
): T | null {
  const corrects = answers.filter((a) => a.correct);
  if (corrects.length === 0) return null;
  return corrects.reduce((best, cur) => (cur.at < best.at ? cur : best));
}

/**
 * حساب النتيجة النهائية:
 * - فائز فردي وحيد عند تفرد أعلى نتيجة (أو فك التعادل يقرر بوضوح).
 * - تعادل عند قاعدة DRAW أو تطابق الترتيب بعد فك التعادل.
 */
export function computeResult(
  standings: StandingRow[],
  tieBreak: TieBreakRule,
): { outcome: "WINNER" | "DRAW" | "NO_PARTICIPANTS"; winnerParticipantId: string | null } {
  if (standings.length === 0) {
    return { outcome: "NO_PARTICIPANTS", winnerParticipantId: null };
  }
  const ranked = rankStandings(standings, tieBreak);
  const top = ranked[0];
  const second = ranked[1];
  // تعادل فعلي على النقاط (بعد فك التعادل بالمعايير المرتبة)
  if (
    tieBreak === "DRAW" &&
    second &&
    second.score === top.score
  ) {
    return { outcome: "DRAW", winnerParticipantId: null };
  }
  if (top.score === 0) {
    // لا نقاط أبدًا: لا يوجد فائز حاسم
    return { outcome: "DRAW", winnerParticipantId: null };
  }
  return { outcome: "WINNER", winnerParticipantId: top.participantId };
}

export type TeamScore = { key: string; label: string; score: number; members: number };

/** تجميع نقاط الفرق من الترتيب نهائيًا. الفريق الفائز أعلى نقاطًا فقط. */
export function computeTeamScores(
  standings: StandingRow[],
  teams: { key: string; label: string }[],
): TeamScore[] {
  const map = new Map<string, TeamScore>();
  for (const t of teams) {
    map.set(t.key, { key: t.key, label: t.label, score: 0, members: 0 });
  }
  for (const row of standings) {
    if (!row.team) continue;
    const t = map.get(row.team);
    if (t) {
      t.score += row.score;
      t.members += 1;
    }
  }
  return [...map.values()];
}

/**
 * اختيار الفريق في وضع الموازنة — حتمي:
 * الفريق الأصغر عددًا؛ عند التساوي الترتيب كما هو مُعرَّف في الإعداد (الأول).
 */
export function balancedTeamFor(
  counts: Record<string, number>,
  teams: { key: string }[],
): string {
  let best = teams[0]!;
  for (const t of teams.slice(1)) {
    if ((counts[t.key] ?? 0) < (counts[best.key] ?? Number.MAX_SAFE_INTEGER)) {
      best = t;
    }
  }
  return best.key;
}
