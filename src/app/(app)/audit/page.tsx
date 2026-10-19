import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { getSessionUser } from "@/server/auth";
import { Card, EmptyState, Badge } from "@/components/ui";
import { auditActionLabel } from "@/server/snapshot";
import { fmtTime } from "@/lib/utils";
import { ScrollText } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "سجل العمليات" };

export default async function AuditPage() {
  const session = await getSessionUser((await cookies()).get("kep_session")?.value);
  if (!session) redirect("/login");

  const channels = await db.channel.findMany({
    where: { ownerUserId: session.id },
    include: { auditLogs: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const channelIds = channels.map((c) => c.id);

  const logs = await db.auditLog.findMany({
    where: { channelId: { in: channelIds } },
    orderBy: { createdAt: "desc" },
    take: 120,
    include: { event: true },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-3">
      <header>
        <h1 className="text-[16px] font-medium">سجل العمليات</h1>
        <p className="text-[12px] text-muted">
          كل فعل إداري أو تلقائي مسجّل مع مصدره — يبقى حتى بعد إعادة التشغيل لأنه في قاعدة البيانات.
        </p>
      </header>

      {logs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ScrollText className="size-6" />}
            title="لا عمليات مسجلة بعد"
            body="تُسجل أول عملية عند إنشاء أول فعالية أو ربط قناة."
          />
        </Card>
      ) : (
        <Card bodyClass="p-0">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-sep text-[11px] text-faint">
                <th className="px-4 py-2 text-start font-normal">الوقت</th>
                <th className="px-2 py-2 text-start font-normal">العملية</th>
                <th className="px-2 py-2 text-start font-normal">الفعالية</th>
                <th className="px-4 py-2 text-start font-normal">المنفّذ</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-sep/50 last:border-0 hover:bg-elevation/40">
                  <td className="px-4 py-2 num text-muted">{fmtTime(l.createdAt)}</td>
                  <td className="px-2 py-2">{auditActionLabel(l.action)}</td>
                  <td className="px-2 py-2 text-muted">
                    {l.event?.name ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={l.userId ? "info" : "neutral"}>
                      {l.userId ? "يدوي" : "تلقائي (المجدول)"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
