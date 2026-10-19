import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { db } from "@/server/db";
import { getSessionUser } from "@/server/auth";
import { StatusBadge, TYPE_LABELS } from "@/components/status";
import { Card, Badge, Dot } from "@/components/ui";
import { fmtTime } from "@/lib/utils";
import {
  Plug,
  PlusCircle,
  Users,
  Trophy,
  CalendarClock,
  PencilLine,
  History,
} from "lucide-react";

export const dynamic = "force-dynamic";

function teamLabel(t: string | null): string {
  if (t === "red") return "الفريق الأحمر";
  if (t === "blue") return "الفريق الأزرق";
  return t ?? "—";
}

export default async function OverviewPage() {
  const session = await getSessionUser(
    (await cookies()).get("kep_session")?.value,
  );
  if (!session) redirect("/login");

  const channels = await db.channel.findMany({
    where: { ownerUserId: session.id },
    include: { state: true },
  });
  const channelIds = channels.map((c) => c.id);

  const [activeEvent, recentEvents] = await Promise.all([
    db.event.findFirst({
      where: { channelId: { in: channelIds }, status: { in: ["REG_OPEN", "REG_CLOSED", "RUNNING"] } },
      orderBy: { createdAt: "desc" },
    }),
    db.event.findMany({
      where: { channelId: { in: channelIds } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { _count: { select: { participants: true } } },
    }),
  ]);

  const winners = await db.participant.findMany({
    where: {
      id: {
        in: recentEvents
          .map((e) => e.winnerParticipantId)
          .filter((x): x is string => Boolean(x)),
      },
    },
  });
  const winnerMap = new Map(winners.map((w) => [w.id, w.kickUsername]));

  const kickChannel = channels.find((c) => c.kind === "KICK");
  const state = kickChannel?.state;

  let activeParticipants = 0;
  let totalRounds = 0;
  if (activeEvent) {
    [activeParticipants, totalRounds] = await Promise.all([
      db.participant.count({ where: { eventId: activeEvent.id, status: "ACTIVE" } }),
      db.question.count({ where: { eventId: activeEvent.id } }),
    ]);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-[16px] font-medium">نظرة عامة</h1>
          <p className="text-[12px] text-muted">
            كل ما يظهر هنا مقروء من قاعدة البيانات الفعلية — بلا بيانات تجريبية.
          </p>
        </div>
        <Link
          href="/events/new"
          className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-accent px-3 text-[12px] font-medium text-[#0b2f00]"
        >
          <PlusCircle className="size-3.5" /> إنشاء فعالية
        </Link>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* الاتصال */}
        <Card title="حالة الاتصال بـ Kick">
          {kickChannel ? (
            <div className="space-y-2.5 text-[13px]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Dot
                    tone={
                      state?.status === "CONNECTED"
                        ? "ok"
                        : state?.status === "ERROR"
                          ? "bad"
                          : "neutral"
                    }
                  />
                  <span className="ltr-tech font-medium">{kickChannel.kickUsername}</span>
                </div>
                <Badge
                  tone={
                    state?.status === "CONNECTED" ? "ok" : state?.status === "ERROR" ? "bad" : "neutral"
                  }
                >
                  {state?.status === "CONNECTED"
                    ? "متصلة"
                    : state?.status === "ERROR"
                      ? "خطأ بالاتصال"
                      : "غير متصلة"}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-muted">
                <div>آخر فحص: {state?.lastCheckedAt ? fmtTime(state.lastCheckedAt) : "لم يُفحص بعد"}</div>
                <div>آخر لحظة سلامة: {state?.lastHealthyAt ? fmtTime(state.lastHealthyAt) : "—"}</div>
                <div>اشتراك محادثة: {state?.subscriptionsActive ? "فعّال" : "غير مؤكَّد"}</div>
                <div>
                  السجلات مطلوبة: <span className="ltr-tech">user:read · chat:write · events:subscribe</span>
                </div>
              </div>
              {state?.lastError && (
                <div className="rounded-xs border border-[#5c2b28] bg-bad-bg px-2 py-1.5 text-[12px] text-bad">
                  {state.lastError}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Link
                  href="/kick"
                  className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-sep-strong bg-elevation px-2.5 text-[12px] hover:bg-[#23282d]"
                >
                  <Plug className="size-3.5" /> إدارة الاتصال أو إصلاحه
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="max-w-xs text-[12.5px] text-muted">
                لا قناة Kick مرتبطة بعد. الربط يمنح: إرسال الإعلانات، واستقبال رسائل
                المشاهدين <span className="ltr-tech">!join</span> وإجاباتهم.
              </p>
              <Link
                href="/kick"
                className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-accent px-3 text-[12px] font-medium text-[#0b2f00]"
              >
                <Plug className="size-3.5" /> ربط Kick
              </Link>
            </div>
          )}
        </Card>

        {/* الفعالية الحالية */}
        <Card title="الفعالية الحالية" actions={activeEvent ? <StatusBadge status={activeEvent.status} /> : undefined}>
          {activeEvent ? (
            <div className="space-y-2 text-[13px]">
              <div className="font-medium">{activeEvent.name}</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-muted">
                <div>النوع: {TYPE_LABELS[activeEvent.type] ?? activeEvent.type}</div>
                <div>المشاركون النشطون: <span className="num">{activeParticipants}</span></div>
                {activeEvent.status === "RUNNING" ? (
                  <div>
                    الجولة: <span className="num">{activeEvent.currentRoundIndex + 1}</span> /{" "}
                    <span className="num">{totalRounds}</span>
                  </div>
                ) : (
                  <div>الجولات المعدّة: <span className="num">{totalRounds}</span></div>
                )}
                <div>
                  بدأت: {activeEvent.startedAt ? fmtTime(activeEvent.startedAt) : "لم تبدأ"}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Link
                  href={`/events/${activeEvent.id}`}
                  className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-sep-strong bg-elevation px-2.5 text-[12px] hover:bg-[#23282d]"
                >
                  <PencilLine className="size-3.5" /> فتح غرفة التحكم
                </Link>
              </div>
            </div>
          ) : (
            <p className="py-2 text-[12.5px] text-muted">
              لا فعالية نشطة. أعدّ فعالية جديدة أو جهّز واحدة من قائمة الفعاليات، ثم افتح
              التسجيل من غرفة التحكم.
            </p>
          )}
        </Card>
      </div>

      {/* الفعاليات الأخيرة */}
      <Card
        title="أحدث الفعاليات"
        bodyClass="p-0"
        actions={
          <Link href="/events" className="flex items-center gap-1 text-[11px] text-muted hover:text-ink">
            <History className="size-3.5" /> كل الفعاليات
          </Link>
        }
      >
        {recentEvents.length === 0 ? (
          <div className="px-4 py-8 text-center text-[12px] text-muted">
            لا توجد فعاليات مسجلة بعد — قاعدة البيانات فارغة فعليًا.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-sep text-[11px] text-faint">
                  <th className="px-4 py-2 text-start font-normal">الفعلية</th>
                  <th className="px-2 py-2 text-start font-normal">النوع</th>
                  <th className="px-2 py-2 text-start font-normal">الحالة</th>
                  <th className="px-2 py-2 text-start font-normal">المشاركون</th>
                  <th className="px-2 py-2 text-start font-normal">الفائز</th>
                  <th className="px-4 py-2 text-start font-normal">أُنشئت</th>
                </tr>
              </thead>
              <tbody>
                {recentEvents.map((e) => (
                  <tr key={e.id} className="border-b border-sep/60 last:border-0 hover:bg-elevation/40">
                    <td className="px-4 py-2">
                      <Link href={`/events/${e.id}`} className="hover:underline">
                        {e.name}
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-muted">{TYPE_LABELS[e.type] ?? e.type}</td>
                    <td className="px-2 py-2"><StatusBadge status={e.status} /></td>
                    <td className="px-2 py-2 num text-muted">{e._count.participants}</td>
                    <td className="px-2 py-2 text-muted">
                      {e.winnerParticipantId
                        ? winnerMap.get(e.winnerParticipantId) ?? "—"
                        : e.winnerTeamName
                          ? teamLabel(e.winnerTeamName)
                          : "—"}
                    </td>
                    <td className="px-4 py-2 num text-muted">{fmtTime(e.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* اختصارات مفيدة */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { href: "/events/new", icon: PlusCircle, label: "إنشاء فعالية", desc: "أسئلة أو سرعة أو فرق" },
          { href: "/events", icon: CalendarClock, label: "نسّق فعالية جاهزة", desc: "ابدأ التسجيل أو البث" },
          { href: "/participants", icon: Users, label: "المشاركون", desc: "قوائم وبيانات حقيقية" },
          { href: "/results", icon: Trophy, label: "سجل النتائج", desc: "نتائج مكتملة فقط" },
        ].map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="flex items-start gap-3 rounded-md border border-sep bg-surface p-3 transition-colors hover:bg-elevation/50"
          >
            <a.icon className="mt-0.5 size-4 text-muted" />
            <span>
              <span className="block text-[13px]">{a.label}</span>
              <span className="block text-[11px] text-faint">{a.desc}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
