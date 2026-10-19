import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { db } from "@/server/db";
import { getSessionUser } from "@/server/auth";
import { Card, Badge, EmptyState } from "@/components/ui";
import { StatusBadge, TYPE_LABELS } from "@/components/status";
import { auditActionLabel } from "@/server/snapshot";
import { fmtTime } from "@/lib/utils";
import { ArrowLeft, Trophy } from "lucide-react";

export const dynamic = "force-dynamic";

const TEAM_KEYS = ["red", "blue"] as const;
function teamLabel(t: string | null) {
  if (t === "red") return "الأحمر";
  if (t === "blue") return "الأزرق";
  return t ?? "—";
}

export default async function ResultDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser((await cookies()).get("kep_session")?.value);
  if (!session) redirect("/login");

  const event = await db.event.findUnique({
    where: { id },
    include: { channel: true },
  });
  if (!event || event.channel.ownerUserId !== session.id) notFound();

  const [result, participants, questions, answers, auditRows] = await Promise.all([
    db.eventResult.findFirst({ where: { eventId: id } }),
    db.participant.findMany({
      where: { eventId: id },
      orderBy: [{ score: "desc" }, { joinedAt: "asc" }],
    }),
    db.question.findMany({ where: { eventId: id }, orderBy: { index: "asc" } }),
    db.answer.findMany({
      where: { eventId: id, outcome: { in: ["CORRECT", "WRONG"] } },
      orderBy: { createdAt: "asc" },
      include: { participant: true },
    }),
    db.auditLog.findMany({ where: { eventId: id }, orderBy: { createdAt: "asc" }, take: 60 }),
  ]);

  if (event.status !== "COMPLETED" && event.status !== "CANCELLED") {
    return (
      <div className="mx-auto max-w-3xl">
        <Card title="لا نتيجة نهائية بعد">
          <EmptyState
            title="فعالية لم تنتهِ بعد"
            body="التفاصيل الحية موجودة في غرفة التحكم؛ النتيجة النهائية تُمحكم هنا بعد الإنهاء."
            actions={
              <Link
                href={`/events/${event.id}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-accent px-3 text-[12px] font-medium text-[#0b2f00]"
              >
                فتح غرفة التحكم
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  const teamMembers = participants.filter((p) => p.teamName);
  const teamTotals = TEAM_KEYS.map((key) => {
    const memberList = teamMembers.filter((p) => p.teamName === key);
    return {
      key,
      score: memberList.reduce((sum, p) => sum + p.score, 0),
      members: memberList.length,
    };
  }).filter((t) => t.members > 0);

  const answeredMap = new Map<number, { correct: number; total: number; fastest: string | null }>();
  for (const q of questions) answeredMap.set(q.index, { correct: 0, total: 0, fastest: null });
  for (const a of answers) {
    const rec = answeredMap.get(a.roundIndex);
    if (!rec) continue;
    rec.total += 1;
    if (a.outcome === "CORRECT") {
      rec.correct += 1;
      if (a.speedBonus > 0 && !rec.fastest) rec.fastest = a.participant.kickUsername;
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link href="/results" aria-label="رجوع للسجل">
            <ArrowLeft className="size-4 text-muted" />
          </Link>
          <div>
            <h1 className="text-[16px] font-medium">{event.name}</h1>
            <div className="flex items-center gap-2 text-[11px] text-muted">
              <span>{TYPE_LABELS[event.type] ?? event.type}</span>
              <StatusBadge status={event.status} />
              {event.simulation && <Badge tone="warn">وضع اختبار</Badge>}
            </div>
          </div>
        </div>
                        {result ? (
                          <div className="text-[12px] text-muted">
                            محسومة: <span className="num">{fmtTime(event.endedAt ?? result.computedAt)}</span>
                          </div>
                        ) : null}
      </header>

      {/* الفائز / النتيجة */}
      <Card title={<span className="flex items-center gap-1.5"><Trophy className="size-3.5 text-warn" /> النتيجة النهائية</span>}>
        {event.status === "CANCELLED" ? (
          <div className="text-[13px] text-muted">أُلغيت هذه الفعالية — لا فائز ولا نتيجة معلنة.</div>
        ) : event.winnerParticipantId ? (
          <div className="flex items-center gap-3 text-[13px]">
            <span className="text-[12px] text-muted">الفائز:</span>
            <span className="ltr-tech font-medium text-accent-ink">
              {participants.find((p) => p.id === event.winnerParticipantId)?.kickUsername ?? "—"}
            </span>
            {event.winnerTeamName && (
              <Badge tone="neutral">فريق {teamLabel(event.winnerTeamName)}</Badge>
            )}
          </div>
        ) : event.winnerTeamName ? (
          <div className="flex items-center gap-2 text-[13px]">
            <span className="text-[12px] text-muted">الفريق الفائز:</span>
            <span className="font-medium text-accent-ink">{teamLabel(event.winnerTeamName)}</span>
          </div>
        ) : (
          <div className="text-[13px] text-muted">
            {result?.outcome === "NO_PARTICIPANTS"
              ? "أُنهيت الفعالية بلا مشاركين مسجلين."
              : "تعادل — بلا فائز مفرد."}
          </div>
        )}
      </Card>

      {teamTotals.length > 0 && (
        <Card title="مجموع الفرق">
          <div className="space-y-2">
            {teamTotals.map((t, i) => (
              <div key={t.key} className="flex items-center justify-between text-[12.5px]">
                <span className="flex items-center gap-2 font-medium">
                  <span
                    aria-hidden
                    className={
                      t.key === "red"
                        ? "size-2 rounded-full bg-bad"
                        : "size-2 rounded-full bg-info"
                    }
                  />
                  {teamLabel(t.key)}
                </span>
                <span className="text-muted">
                  المجموع <span className="num font-medium text-ink">{t.score}</span> · المشاركون{" "}
                  <span className="num">{t.members}</span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="الترتيب النهائي" bodyClass="p-0">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-sep text-[11px] text-faint">
              <th className="px-4 py-2 text-start font-normal">#</th>
              <th className="px-2 py-2 text-start font-normal">مشاهد</th>
              <th className="px-2 py-2 text-start font-normal">فريق</th>
              <th className="px-2 py-2 text-start font-normal">نقاط</th>
              <th className="px-4 py-2 text-start font-normal">إجابات صحيحة</th>
            </tr>
          </thead>
          <tbody>
            {participants.slice(0, 20).map((p, i) => (
              <tr key={p.id} className="border-b border-sep/50 last:border-0">
                <td className="px-4 py-1.5 num text-faint">{i + 1}</td>
                <td className="px-2 py-1.5 ltr-tech">{p.kickUsername}</td>
                <td className="px-2 py-1.5 text-muted">{teamLabel(p.teamName)}</td>
                <td className="px-2 py-1.5 num font-medium">{p.score}</td>
                <td className="px-4 py-1.5 num text-muted">{p.correctCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="ملخص الجولات" bodyClass="p-0">
        {questions.length === 0 ? (
          <div className="px-4 py-6 text-center text-[12px] text-muted">لا أسئلة مسجلة.</div>
        ) : (
          <ul className="divide-y divide-sep/50">
            {questions.map((q) => {
              const rec = answeredMap.get(q.index)!;
              const answersList = JSON.parse(q.correctAnswers) as string[];
              const correct = (q.options ? answersList.join("، ") : answersList.join("، ")) || "—";
              return (
                <li key={q.id} className="px-4 py-2.5">
                  <div className="flex items-start justify-between gap-2 text-[12.5px]">
                    <div className="min-w-0">
                      <div className="mb-0.5 num text-[11px] text-faint">سؤال {q.index + 1}</div>
                      <div className="truncate">{q.prompt}</div>
                      {!q.options && (
                        <div className="mt-0.5 text-[11px] text-muted">الإجابة: {correct}</div>
                      )}
                    </div>
                    <div className="shrink-0 text-end text-[11px]">
                      <div className="text-muted">
                        <span className="num">{rec.correct}</span>/<span className="num">{rec.total}</span> صحيحة
                      </div>
                      {rec.fastest && <div className="text-faint">الأسرع: <span className="ltr-tech">{rec.fastest}</span></div>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="تسلسل الأحداث" bodyClass="p-0">
        <ul className="divide-y divide-sep/50">
          {auditRows.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 px-4 py-2 text-[12px]">
              <span>{auditActionLabel(a.action)}</span>
              <span className="num text-faint">{fmtTime(a.createdAt)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
