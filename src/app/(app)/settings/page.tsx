import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { getSessionUser } from "@/server/auth";
import { BotSettingsForm } from "@/components/bot-settings-form";
import { Card, Dot } from "@/components/ui";
import Link from "next/link";
import { fmtTime } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "إعدادات البوت" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ channelId?: string }>;
}) {
  const session = await getSessionUser((await cookies()).get("kep_session")?.value);
  if (!session) redirect("/login");

  const channels = await db.channel.findMany({
    where: { ownerUserId: session.id },
    include: { state: true, botSettings: true },
    orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
  });

  const { channelId } = await searchParams;
  const selected =
    channels.find((c) => c.id === channelId) ??
    channels.find((c) => c.kind === "KICK") ??
    channels[0];

  if (!selected) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card title="إعدادات البوت">لا قنوات — أعد تسجيل حساب جديد.</Card>
      </div>
    );
  }

  const state = selected.state;

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <header>
        <h1 className="text-[16px] font-medium">إعدادات البوت</h1>
        <p className="text-[12px] text-muted">لا تُخزَّن هنا أي أسرار — الترتيب الداخلي للإرسال فقط.</p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {channels.map((c) => (
          <Link
            key={c.id}
            href={`/settings?channelId=${c.id}`}
            className={
              c.id === selected.id
                ? "flex items-center gap-1.5 rounded-sm border border-accent-soft bg-[#132a08] px-2.5 py-1 text-[12px] text-accent-ink"
                : "flex items-center gap-1.5 rounded-sm border border-sep bg-surface px-2.5 py-1 text-[12px] text-muted hover:text-ink"
            }
          >
            <Dot
              tone={
                c.kind === "KICK"
                  ? state?.status === "CONNECTED"
                    ? "ok"
                    : "neutral"
                  : "neutral"
              }
            />
            {c.kind === "LOCAL" ? "قناة الاختبار المحلية" : c.kickUsername}
          </Link>
        ))}
      </div>

      <BotSettingsForm
        channelId={selected.id}
        initial={{
          botDisplayName: selected.botSettings?.botDisplayName ?? "بوت المنصة",
          commandPrefix: selected.botSettings?.commandPrefix ?? "!",
          sendType: (selected.botSettings?.sendType as "user" | "bot") ?? "user",
          minSendIntervalMs: selected.botSettings?.minSendIntervalMs ?? 1200,
          replyToCommands: selected.botSettings?.replyToCommands ?? true,
        }}
      />

      <Card title="حالة الإرسال لقناة Kick">
        {selected.kind === "KICK" ? (
          <div className="space-y-2 text-[12.5px] text-muted">
            <div>
              الحالة:{" "}
              <span className="text-ink">
                {state?.status === "CONNECTED" ? "متصلة" : state?.status === "ERROR" ? "خطأ" : "غير متصلة"}
              </span>
            </div>
            <div>آخر فحص: {state?.lastCheckedAt ? fmtTime(state.lastCheckedAt) : "لم يُفحص بعد"}</div>
            <div>اشتراك محادثة: {state?.subscriptionsActive ? "مفعّل" : "غير مؤكد"}</div>
            {state?.lastError && (
              <div className="rounded-xs border border-[#5c2b28] bg-bad-bg px-2 py-1.5 text-[12px] text-bad">
                {state.lastError}
              </div>
            )}
            <Link href="/kick" className="text-[12px] text-info hover:underline">
              إدارة الاتصال…
            </Link>
          </div>
        ) : (
          <div className="text-[12.5px] text-muted">
            قناة محلية للتجربة – لا إرسال حقيقي. الرسائل تبقى في صندوق الإعلانات بحالة «محفوظة — لا اتصال» دون محاولة إرسال مشوبة بالتضليل.
          </div>
        )}
      </Card>
    </div>
  );
}
