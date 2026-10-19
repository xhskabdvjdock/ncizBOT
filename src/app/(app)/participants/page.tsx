import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { db } from "@/server/db";
import { getSessionUser } from "@/server/auth";
import { Card, EmptyState, Badge, Dot } from "@/components/ui";
import { fmtTime } from "@/lib/utils";
import { RemoveParticipantButton } from "@/components/participant-remove";
import { Users } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "المشاركون" };

const PARTICIPANT_STATUS: Record<string, { label: string; tone: "ok" | "neutral" | "bad" }> = {
  ACTIVE: { label: "نشط", tone: "ok" },
  LEFT: { label: "انسحب", tone: "neutral" },
  REMOVED: { label: "أُزيل", tone: "bad" },
};

function teamLabel(team: string | null) {
  if (team === "red") return "الأحمر";
  if (team === "blue") return "الأزرق";
  return team ?? "—";
}

export default async function ParticipantsPage({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string; q?: string }>;
}) {
  const session = await getSessionUser((await cookies()).get("kep_session")?.value);
  if (!session) redirect("/login");

  const channels = await db.channel.findMany({ where: { ownerUserId: session.id } });
  const channelIds = channels.map((c) => c.id);

  const events = await db.event.findMany({
    where: { channelId: { in: channelIds } },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { participants: true } } },
  });

  const { eventId, q } = await searchParams;
  const selectedId = eventId && events.some((e) => e.id === eventId) ? eventId : events[0]?.id ?? null;
  const selected = events.find((e) => e.id === selectedId) ?? null;

  const rows = selected
    ? (await db.participant.findMany({
        where: { eventId: selected.id },
        orderBy: [{ score: "desc" }, { joinedAt: "asc" }],
      })).filter(
        (p) =>
          !q ||
          p.kickUsername.toLowerCase().includes(q.toLowerCase()) ||
          String(p.kickUserId).includes(q),
      )
    : [];

  return (
    <div className="mx-auto max-w-5xl space-y-3">
      <header>
        <h1 className="text-[16px] font-medium">المشاركون</h1>
        <p className="text-[12px] text-muted">قائمة فعلية من قاعدة البيانات — لا تجريبية.</p>
      </header>

      {events.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="size-6" />}
            title="لا فعاليات بعد"
            body="أنشئ فعالية أولًا ثم سجلّ فيها مشاركين لعرضهم هنا."
          />
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {events.slice(0, 12).map((e) => (
              <Link
                key={e.id}
                href={`/participants?eventId=${e.id}`}
                className={
                  e.id === selectedId
                    ? "rounded-sm border border-accent-soft bg-[#132a08] px-2.5 py-1 text-[12px] text-accent-ink"
                    : "rounded-sm border border-sep bg-surface px-2.5 py-1 text-[12px] text-muted hover:text-ink"
                }
              >
                {e.name}
                <span className="ms-1.5 num text-[10.5px] text-faint">{e._count.participants}</span>
              </Link>
            ))}
          </div>

          <form className="flex gap-2" action="/participants" method="GET">
            <input type="hidden" name="eventId" value={selectedId ?? ""} />
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="ابحث بالاسم أو المعرف"
              aria-label="بحث في المشاركين"
              className="h-8 w-64 rounded-sm border border-sep-strong bg-elevation px-2.5 text-[12px]"
            />
            <button className="h-8 rounded-sm border border-sep-strong bg-elevation px-3 text-[12px] hover:bg-[#23282d]">
              بحث
            </button>
          </form>

          <Card
            title={selected ? `مشاركو «${selected.name}»` : ""}
            actions={selected ? <Badge tone="neutral">{rows.length} صف</Badge> : undefined}
            bodyClass="p-0"
          >
            {rows.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12px] text-muted">
                لا مشاركين مطابقين — إما لم يسجّل أحد أو البحث لا يجد شيئًا.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="border-b border-sep text-[11px] text-faint">
                      <th className="px-4 py-2 text-start font-normal">مك المشاهد</th>
                      <th className="px-2 py-2 text-start font-normal">الحالة</th>
                      <th className="px-2 py-2 text-start font-normal">فريق</th>
                      <th className="px-2 py-2 text-start font-normal">نقاط</th>
                      <th className="px-2 py-2 text-start font-normal">صحيحة</th>
                      <th className="px-2 py-2 text-start font-normal">محاولات</th>
                      <th className="px-2 py-2 text-start font-normal">انضم</th>
                      <th className="px-4 py-2 text-start font-normal">إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => {
                      const st = PARTICIPANT_STATUS[p.status] ?? { label: p.status, tone: "neutral" as const };
                      const removalAllowed =
                        selected?.status !== "COMPLETED" &&
                        selected?.status !== "CANCELLED" &&
                        p.status === "ACTIVE" &&
                        (() => {
                          return true; // يُفحص الإعداد فعليًا في الخادم عند الضغط
                        })();
                      return (
                        <tr key={p.id} className="border-b border-sep/60 last:border-0 hover:bg-elevation/40">
                          <td className="px-4 py-2">
                            <span className="ltr-tech">{p.kickUsername}</span>
                            <span className="ms-1.5 num text-[10.5px] text-faint">{p.kickUserId}</span>
                          </td>
                          <td className="px-2 py-2">
                            <span className="inline-flex items-center gap-1.5 text-[12px]">
                              <Dot tone={st.tone} /> {st.label}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-muted">{teamLabel(p.teamName)}</td>
                          <td className="px-2 py-2 num font-medium">{p.score}</td>
                          <td className="px-2 py-2 num text-muted">{p.correctCount}</td>
                          <td className="px-2 py-2 num text-muted">{p.totalAttempts}</td>
                          <td className="px-2 py-2 num text-muted">{fmtTime(p.joinedAt)}</td>
                          <td className="px-4 py-2">
                            {removalAllowed ? (
                              <RemoveParticipantButton eventId={selected!.id} participantId={p.id} username={p.kickUsername} />
                            ) : (
                              <span className="text-[11px] text-faint">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
