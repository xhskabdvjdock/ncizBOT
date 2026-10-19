import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { getSessionUser } from "@/server/auth";
import { StatusBadge, TYPE_LABELS } from "@/components/status";
import { Card, EmptyState } from "@/components/ui";
import { PlusCircle } from "lucide-react";
import { fmtTime } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "الفعاليات" };

export default async function EventsPage() {
  const session = await getSessionUser((await cookies()).get("kep_session")?.value);
  if (!session) redirect("/login");

  const channels = await db.channel.findMany({ where: { ownerUserId: session.id } });
  const channelIds = channels.map((c) => c.id);

  const events = await db.event.findMany({
    where: { channelId: { in: channelIds } },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { _count: { select: { participants: true, questions: true } } },
  });

  const groups: { title: string; filter: (s: string) => boolean }[] = [
    { title: "نشطة الآن أو بانتظار البدء", filter: (s) => ["REG_OPEN", "REG_CLOSED", "RUNNING", "READY"].includes(s) },
    { title: "مسودات", filter: (s) => s === "DRAFT" },
    { title: "منتهية", filter: (s) => ["COMPLETED", "CANCELLED"].includes(s) },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-[16px] font-medium">الفعاليات</h1>
          <p className="text-[12px] text-muted">العدد <span className="num">{events.length}</span> فعالية يمكن تفعيلها.</p>
        </div>
        <Link
          href="/events/new"
          className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-accent px-3 text-[12px] font-medium text-[#0b2f00]"
        >
          <PlusCircle className="size-3.5" /> إنشاء فعالية
        </Link>
      </header>

      {events.length === 0 && (
        <Card>
          <EmptyState
            icon={<PlusCircle className="size-6" />}
            title="لا توجد فعاليات بعد"
            body="أنشئ أول فعالية من معالج الإعداد: تفاصيل، قواعد مشاركة، أسئلة رسائل، ثم مراجعة نهائية."
            actions={
              <Link
                href="/events/new"
                className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-accent px-3 text-[12px] font-medium text-[#0b2f00]"
              >
                ابدأ الإعداد
              </Link>
            }
          />
        </Card>
      )}

      {groups.map((g) => {
        const rows = events.filter((e) => g.filter(e.status));
        if (rows.length === 0) return null;
        return (
          <Card key={g.title} title={g.title} bodyClass="p-0">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-sep text-[11px] text-faint">
                  <th className="px-4 py-2 text-start font-normal">الاسم</th>
                  <th className="px-2 py-2 text-start font-normal">النوع</th>
                  <th className="px-2 py-2 text-start font-normal">الحالة</th>
                  <th className="px-2 py-2 text-start font-normal">أسئلة</th>
                  <th className="px-2 py-2 text-start font-normal">مسجلون</th>
                  <th className="px-4 py-2 text-start font-normal">آخر تحديث</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="border-b border-sep/60 last:border-0 hover:bg-elevation/40">
                    <td className="px-4 py-2">
                      <Link href={`/events/${e.id}`} className="hover:underline">
                        {e.name}
                      </Link>
                      {e.simulation && (
                        <span className="ms-2 rounded-xs border border-[#5a4520] bg-warn-bg px-1 py-0.5 text-[10px] text-warn">
                          وضع اختبار
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-muted">{TYPE_LABELS[e.type] ?? e.type}</td>
                    <td className="px-2 py-2"><StatusBadge status={e.status} /></td>
                    <td className="px-2 py-2 num text-muted">{e._count.questions}</td>
                    <td className="px-2 py-2 num text-muted">{e._count.participants}</td>
                    <td className="px-4 py-2 num text-muted">{fmtTime(e.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        );
      })}
    </div>
  );
}
