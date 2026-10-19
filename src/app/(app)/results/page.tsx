import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { db } from "@/server/db";
import { getSessionUser } from "@/server/auth";
import { Card, EmptyState } from "@/components/ui";
import { StatusBadge, TYPE_LABELS } from "@/components/status";
import { fmtTime } from "@/lib/utils";
import { Trophy } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "سجل النتائج" };

export default async function ResultsPage() {
  const session = await getSessionUser((await cookies()).get("kep_session")?.value);
  if (!session) redirect("/login");

  const channels = await db.channel.findMany({ where: { ownerUserId: session.id } });
  const channelIds = channels.map((c) => c.id);

  const finished = await db.event.findMany({
    where: {
      channelId: { in: channelIds },
      status: { in: ["COMPLETED", "CANCELLED"] },
    },
    orderBy: { endedAt: "desc" },
    take: 50,
    include: { _count: { select: { participants: true, questions: true } } },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-3">
      <header>
        <h1 className="text-[16px] font-medium">سجل النتائج</h1>
        <p className="text-[12px] text-muted">الفعاليات المنتهية فقط — النتائج المحفوظة فعلًا، لا صافي أرقام تقديرية.</p>
      </header>

      {finished.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Trophy className="size-6" />}
            title="لا نتائج بعد"
            body="عند إنهاء فعالية أو إلغائها تظهر هنا مع الترتيب النهائي أو سبب الإلغاء."
          />
        </Card>
      ) : (
        <Card bodyClass="p-0">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-sep text-[11px] text-faint">
                <th className="px-4 py-2 text-start font-normal">الفعالية</th>
                <th className="px-2 py-2 text-start font-normal">النوع</th>
                <th className="px-2 py-2 text-start font-normal">الحالة</th>
                <th className="px-2 py-2 text-start font-normal">مشاركون</th>
                <th className="px-2 py-2 text-start font-normal">جولات</th>
                <th className="px-4 py-2 text-start font-normal">أُنهيت</th>
              </tr>
            </thead>
            <tbody>
              {finished.map((e) => (
                <tr key={e.id} className="border-b border-sep/60 last:border-0 hover:bg-elevation/40">
                  <td className="px-4 py-2">
                    <Link href={`/results/${e.id}`} className="hover:underline">
                      {e.name}
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-muted">{TYPE_LABELS[e.type] ?? e.type}</td>
                  <td className="px-2 py-2"><StatusBadge status={e.status} /></td>
                  <td className="px-2 py-2 num text-muted">{e._count.participants}</td>
                  <td className="px-2 py-2 num text-muted">{e._count.questions}</td>
                  <td className="px-4 py-2 num text-muted">{fmtTime(e.endedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
