import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { getSessionUser } from "@/server/auth";
import { Card, Badge, Dot } from "@/components/ui";
import { fmtTime } from "@/lib/utils";
import { env } from "@/server/env";
import { REQUIRED_SCOPES } from "@/server/kick/client";
import { KickActions } from "@/components/kick-actions";
import { Plug, ExternalLink, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "ربط Kick" };

export default async function KickPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string; connecting?: string }>;
}) {
  const session = await getSessionUser((await cookies()).get("kep_session")?.value);
  if (!session) redirect("/login");

  const sp = await searchParams;
  void sp;

  const channels = await db.channel.findMany({
    where: { ownerUserId: session.id },
    include: { state: true, credential: true },
  });
  const kick = channels.find((c) => c.kind === "KICK");

  const grantedScopes = kick?.credential?.scopes?.split(" ").filter(Boolean) ?? [];
  const missingScopes = REQUIRED_SCOPES.filter((s) => !grantedScopes.includes(s));

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <header>
        <h1 className="text-[16px] font-medium">ربط Kick</h1>
        <p className="text-[12px] text-muted">
          التفويض عبر <span className="ltr-tech">id.kick.com</span> فقط — الرموز تبقى داخل الخادم مشفّرة، ولا داعي لعرضها.
        </p>
      </header>

      {sp.error && (
        <div className="rounded-xs border border-[#5c2b28] bg-bad-bg px-3 py-2 text-[12.5px] text-bad">
          {sp.error}
        </div>
      )}

      <Card title="حالة القناة الحالية">
        {kick ? (
          <div className="space-y-2.5 text-[13px]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Dot
                  tone={kick.state?.status === "CONNECTED" ? "ok" : kick.state?.status === "ERROR" ? "bad" : "neutral"}
                />
                <span className="ltr-tech font-medium">{kick.kickUsername}</span>
              </div>
              <Badge
                tone={kick.state?.status === "CONNECTED" ? "ok" : kick.state?.status === "ERROR" ? "bad" : "neutral"}
              >
                {kick.state?.status === "CONNECTED" ? "متصلة" : kick.state?.status === "ERROR" ? "خطأ" : "غير متصلة"}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-muted">
              <div>آخر فحص: {kick.state?.lastCheckedAt ? fmtTime(kick.state.lastCheckedAt) : "لم يُفحص بعد"}</div>
              <div>اشتراك محادثة: {kick.state?.subscriptionsActive ? "مفعّل" : "غير مؤكد"}</div>
              <div>
                النطاقات الممنوحة:{" "}
                {grantedScopes.length > 0 ? (
                  <span className="ltr-tech">{grantedScopes.join(" · ")}</span>
                ) : (
                  "—"
                )}
              </div>
              <div>
                ناقص: {missingScopes.length === 0 ? <span className="text-ok">لا شيء</span> : <span className="ltr-tech text-warn">{missingScopes.join(" · ")}</span>}
              </div>
            </div>
            {kick.state?.lastError && (
              <div className="rounded-xs border border-[#5c2b28] bg-bad-bg px-2 py-1.5 text-[12px] text-bad">
                {kick.state.lastError}
              </div>
            )}
            <KickActions
              channelId={kick.id}
              connected={kick.state?.status === "CONNECTED"}
              subscriptionsActive={!!kick.state?.subscriptionsActive}
              kickoff={env.hasKickCredentials}
            />
          </div>
        ) : (
          <div className="space-y-2 text-[12.5px] text-muted">
            <div>لا قناة Kick مرتبطة بذلك الحساب حتى الآن.</div>
            {env.hasKickCredentials ? (
              <a
                href="/api/kick/authorize"
                className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-accent px-3 text-[12px] font-medium text-[#0b2f00]"
              >
                <Plug className="size-3.5" /> بدء الربط الآن
              </a>
            ) : (
              <div className="rounded-xs border border-[#5a4520] bg-warn-bg px-2.5 py-2 text-[12px] text-warn">
                المتغيرات <code className="ltr-tech">KICK_CLIENT_ID</code> و{" "}
                <code className="ltr-tech">KICK_CLIENT_SECRET</code> غير مضبوطة على الخادم — لا يمكن
                إنشاء زر ربط حقيقي بينما هذه الأسرار غائبة (استمرار صريح وليس محاكاة).
                ضبطها معرّف في README خطوة بخطوة.
              </div>
            )}
          </div>
        )}
      </Card>

      <Card title={<span className="flex items-center gap-1.5"><ShieldCheck className="size-3.5" /> خطوات التطوير</span>}>
        <ol className="list-inside list-decimal space-y-1.5 text-[12.5px] leading-6 text-muted">
          <li>
            أنشئ تطبيقًا في لوحة مطوّري Kick، ثم انقل{" "}
            <code className="ltr-tech mx-1">KICK_CLIENT_ID</code> و{" "}
            <code className="ltr-tech mx-1">KICK_CLIENT_SECRET</code> إلى{" "}
            <code className="ltr-tech mx-1">.env</code> وأعد تشغيل الخادم.
          </li>
          <li>
            سجّل رابط التحويل (Redirect URI) في إعدادات التطبيق:{" "}
            <code className="ltr-tech">{env.kickRedirectUri || `${env.appBaseUrl}/api/kick/callback`}</code>
          </li>
          <li>
            سجّل Webhook URL في إعدادات التطبيق:{" "}
            <code className="ltr-tech">{`${env.appBaseUrl}/api/kick/webhook`}</code>
          </li>
          <li>
            قدم النطاقات المطلوبة إلى التطبيق:{" "}
            <span className="ltr-tech">{REQUIRED_SCOPES.join(" · ")}</span>
          </li>
          <li>اضغط «فحص الاتصال الآن» بعد الربط للتحقق من حيوية الرمز واشتراك الأحداث.</li>
        </ol>
        <p className="mt-2 flex items-start gap-1.5 text-[11.5px] text-faint">
          <ExternalLink className="mt-0.5 size-3 shrink-0" />
          لتعيين Webhook لا يوجد نداء برمجي — يُضبط يدويًا من إعدادات تطبيق المطوّر في Kick بحد ذاته.
        </p>
      </Card>
    </div>
  );
}
