"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn, fmtTime } from "@/lib/utils";
import { StatusBadge, TYPE_LABELS, OUTBOX_STATUS } from "@/components/status";
import { Badge, Button, Card, Dot, EmptyState, ProgressBar } from "@/components/ui";
import type { EventSnapshot } from "@/server/snapshot";
import {
  Activity,
  ArrowLeft,
  Hourglass,
  Inbox,
  ListOrdered,
  LogIn,
  RefreshCw,
  Send,
  Trophy,
  Users,
} from "lucide-react";

type Conn = "connecting" | "live" | "polling";

export function ControlRoom({
  eventId,
  initialSnapshot,
  channelConnected,
  channelKind,
}: {
  eventId: string;
  initialSnapshot: EventSnapshot;
  channelConnected: boolean;
  channelKind: "KICK" | "LOCAL";
}) {
  const router = useRouter();
  const [snap, setSnap] = useState<EventSnapshot>(initialSnapshot);
  const [connState, setConnState] = useState<Conn>("connecting");
  const [serverSkew, setServerSkew] = useState(0);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmKind, setConfirmKind] = useState<string | null>(null);
  const [simBusy, setSimBusy] = useState(false);
  const [simName, setSimName] = useState("viewer_1");
  const [simText, setSimText] = useState("!join");

  useEffect(() => {
    setServerSkew(Date.parse(initialSnapshot.serverNow) - Date.now());
  }, [initialSnapshot.serverNow]);

  /* ── التدفق الحي (SSE) مع بديل استطلاع واضح ── */
  useEffect(() => {
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let alive = true;

    const startPolling = () => {
      if (!alive || poll) return;
      setConnState("polling");
      poll = setInterval(async () => {
        const res = await fetch(`/api/events/${eventId}/snapshot`, { cache: "no-store" });
        if (res.ok) {
          const body = (await res.json()) as { snapshot: EventSnapshot };
          setSnap(body.snapshot);
        }
      }, 4000);
    };

    try {
      es = new EventSource(`/api/events/${eventId}/stream`);
      es.onopen = () => setConnState("live");
      es.onerror = () => {
        if (es) {
          es.close();
          es = null;
        }
        startPolling();
      };
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as EventSnapshot;
          setSnap(data);
          setConnState("live");
        } catch {
          /* تجاهل رزمة غير متوقعة */
        }
      };
    } catch {
      startPolling();
    }

    return () => {
      alive = false;
      es?.close();
      if (poll) clearInterval(poll);
    };
  }, [eventId]);

  const act = useCallback(
    async (action: string) => {
      setBusyAction(action);
      setActionError(null);
      try {
        const res = await fetch(`/api/events/${eventId}/action`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const body = (await res.json()) as { snapshot?: EventSnapshot; error?: string };
        if (!res.ok) {
          setActionError(body.error ?? "فشل تنفيذ الفعل");
          return;
        }
        if (body.snapshot) setSnap(body.snapshot);
        setConfirmKind(null);
      } finally {
        setBusyAction(null);
      }
    },
    [eventId],
  );

  const simulate = useCallback(async () => {
    setSimBusy(true);
    try {
      await fetch(`/api/events/${eventId}/simulate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: simName, text: simText }),
      });
      await fetch(`/api/events/${eventId}/snapshot`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((b) => b && setSnap((b as { snapshot: EventSnapshot }).snapshot));
    } finally {
      setSimBusy(false);
    }
  }, [eventId, simName, simText]);

  const e = snap.event;
  const busy = busyAction != null;

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      {/* الرأس */}
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => router.push("/events")} aria-label="رجوع">
            <ArrowLeft className="size-3.5" />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-[16px] font-medium">{e.name}</h1>
            <div className="flex items-center gap-2 text-[11px] text-muted">
              <span>{TYPE_LABELS[e.type] ?? e.type}</span>
              <span aria-hidden>·</span>
              <StatusBadge status={e.status} />
              {e.simulation && <Badge tone="warn">وضع اختبار</Badge>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <span className="flex items-center gap-1">
            <Dot tone={e.status === "RUNNING" ? "ok" : connState === "polling" ? "warn" : connState === "live" ? "ok" : "neutral"} />
            {connState === "live" ? "تحديث حي" : connState === "polling" ? "استطلاع كل 4 ثوانٍ" : "جارٍ الاتصال…"}
          </span>
          {channelKind === "KICK" ? (
            <span className="flex items-center gap-1">
              <Dot tone={channelConnected ? "ok" : "bad"} />
              {channelConnected ? "قناة متصلة" : "قناة غير متصلة"}
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <Dot tone="neutral" />
              قناة محلية اختبار
            </span>
          )}
        </div>
      </header>

      {actionError && (
        <div className="rounded-xs border border-[#5c2b28] bg-bad-bg px-2.5 py-2 text-[12px] text-bad">
          {actionError}
        </div>
      )}

      {/* شريط التحكم */}
      <ControlsBar
        snap={snap}
        busy={busy}
        busyAction={busyAction}
        onAct={act}
        confirmKind={confirmKind}
        setConfirmKind={setConfirmKind}
      />

      {confirmKind && (
        <div className="rounded-sm border border-[#5c2b28] bg-bad-bg p-3 text-[12.5px]">
          <div className="mb-2 font-medium text-bad">{CONFIRM_TEXT[confirmKind]}</div>
          <div className="flex gap-2">
            <Button variant="danger" size="sm" loading={busy} onClick={() => act(confirmKind)}>
              تأكيد
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmKind(null)}>
              تراجع
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-5">
        {/* الرجوع الرئيسي */}
        <div className="space-y-3 lg:col-span-3">
          <RoundPanel snap={snap} serverSkew={serverSkew} />
          <LeaderboardPanel snap={snap} />
        </div>

        {/* التغذية */}
        <div className="space-y-3 lg:col-span-2">
          <AnswersPanel snap={snap} />
          <ActivityPanel snap={snap} />
          <OutboxPanel snap={snap} />
          {e.simulation && (
            <SimulatorPanel
              simBusy={simBusy}
              simName={simName}
              setSimName={setSimName}
              simText={simText}
              setSimText={setSimText}
              simulate={simulate}
              commands={e.commands}
            />
          )}
        </div>
      </div>
    </div>
  );
}

const CONFIRM_TEXT: Record<string, string> = {
  FINISH: "إنهاء الفعالية الآن؟ تُحسم النقاط الحالية نهائيًا وتظهر النتيجة — لا يمكن العودة إلى الجارِ.",
  CANCEL: "إلغاء الفعالية؟ لن تُعلن نتيجة ولا فائز، وتُوقف الجارِ مباشرة.",
};

/* ── شريط التحكم ─────────────────────────── */

function ControlsBar({
  snap,
  busy,
  busyAction,
  onAct,
  confirmKind,
  setConfirmKind,
}: {
  snap: EventSnapshot;
  busy: boolean;
  busyAction: string | null;
  onAct: (a: string) => void;
  confirmKind: string | null;
  setConfirmKind: (k: string | null) => void;
}) {
  const s = snap.event.status;
  const btn = (label: string, action: string, opts: { variant?: "primary" | "default" | "danger" | "ghost"; confirm?: boolean; disabled?: boolean } = {}) => (
    <Button
      size="sm"
      variant={opts.variant ?? "default"}
      disabled={busy || opts.disabled}
      loading={busyAction === action}
      onClick={() => (opts.confirm ? setConfirmKind(action) : onAct(action))}
    >
      {label}
    </Button>
  );

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-sep bg-surface px-3 py-2.5">
      <span className="me-1 flex items-center gap-1.5 text-[12px] text-muted">
        <Users className="size-3.5" />
        <span className="num">{snap.counts.active}</span> مشارك نشط
      </span>
      <span className="mx-1 h-4 w-px bg-sep" aria-hidden />

      {s === "DRAFT" && (
        <>
          {btn("ترقية إلى جاهزة", "PREPARE", { variant: "primary" })}
          {btn("تعديل الإعداد", "EDIT_DRAFT", { disabled: true })}
          {btn("إلغاء", "CANCEL", { variant: "danger", confirm: true })}
        </>
      )}
      {s === "READY" && (
        <>
          {btn("فتح التسجيل", "OPEN_REGISTRATION", { variant: "primary" })}
          {btn("بدء مباشر (بلا تسجيل مفتوح)", "START")}
          {btn("أعدّ من جديد", "PREPARE_EDIT")}
          {btn("إلغاء", "CANCEL", { variant: "danger", confirm: true })}
        </>
      )}
      {s === "REG_OPEN" && (
        <>
          {btn("إغلاق التسجيل", "CLOSE_REGISTRATION")}
          {btn("إغلاق التسجيل وابدأ الآن", "START", { variant: "primary" })}
          {btn("إلغاء", "CANCEL", { variant: "danger", confirm: true })}
        </>
      )}
      {s === "REG_CLOSED" && (
        <>
          {btn("ابدأ الفعالية", "START", { variant: "primary" })}
          {btn("إعادة فتح التسجيل", "OPEN_REGISTRATION")}
          {btn("إلغاء", "CANCEL", { variant: "danger", confirm: true })}
        </>
      )}
      {s === "RUNNING" && (
        <>
          {snap.event.paused
            ? btn("استئناف", "RESUME", { variant: "primary" })
            : btn("توقيف مؤقت", "PAUSE")}
          {btn("إغلاق الجولة والتالي", "ADVANCE_ROUND")}
          {btn("إنهاء الآن", "FINISH", { variant: "default", confirm: true })}
          {btn("إلغاء", "CANCEL", { variant: "danger", confirm: true })}
        </>
      )}
      {s === "COMPLETED" && (
        <Link href={`/results/${snap.event.id}`} className="text-[12px] text-info hover:underline">
          عرض النتيجة النهائية في سجل النتائج
        </Link>
      )}
      {s === "CANCELLED" && (
        <span className="text-[12px] text-muted">فعالية ملغاة — لا يوجد فائز ولا نتيجة تُحسب.</span>
      )}
    </div>
  );
}

/* ── لوحة السؤال ─────────────────────────── */

function RoundPanel({ snap, serverSkew }: { snap: EventSnapshot; serverSkew: number }) {
  const e = snap.event;
  const q = snap.currentQuestion;

  return (
    <Card
      title={
        <span className="flex items-center gap-1.5">
          <Hourglass className="size-3.5 text-muted" />
          {e.status === "RUNNING" ? "السؤال الحالي" : "مرحلة الفعالية"}
        </span>
      }
      actions={
        e.status === "RUNNING" && q ? (
          <span className="num text-[11px] text-faint">
            سؤال <span>{e.currentRoundIndex + 1}</span>/<span>{e.roundTotal}</span> ·{" "}
            {q.points} نقطة{q.speedBonus ? ` +${q.speedBonus} أسرع` : ""}
          </span>
        ) : undefined
      }
    >
      {e.status !== "RUNNING" ? (
        <EmptyState
          title={phaseTitle(e.status)}
          body={phaseBody(e.status, e)}
        />
      ) : q ? (
        <div className="space-y-3">
          {e.paused ? (
            <div className="rounded-xs border border-[#5a4520] bg-warn-bg px-2.5 py-2 text-[12px] text-warn">
              موقوف مؤقتًا — المتبقي <span className="num">{Math.ceil((e.currentRoundRemainingMs ?? 0) / 1000)}</span> ثانية.
            </div>
          ) : (
            <Countdown endsAtMs={e.currentRoundEndsAt ? Date.parse(e.currentRoundEndsAt) : 0} serverSkew={serverSkew} />
          )}
          <div className="text-[15px] leading-7">{q.prompt}</div>
          {q.options.length > 0 && (
            <ol className="grid gap-1 sm:grid-cols-2">
              {q.options.map((o, i) => (
                <li key={i} className="rounded-xs border border-sep bg-elevation px-2.5 py-1.5 text-[12.5px]">
                  <span className="ltr-tech me-1.5 text-faint">{String.fromCharCode(65 + i)})</span>
                  {o}
                </li>
              ))}
            </ol>
          )}
          <ProgressBar value={Math.max(0, (e.currentRoundEndsAt ? Date.parse(e.currentRoundEndsAt) - (Date.now() + serverSkew) : 0))} max={q.timeLimitSec * 1000} />
        </div>
      ) : (
        <div className="text-[12.5px] text-muted">جارٍ تجهيز السؤال التالي…</div>
      )}
    </Card>
  );
}

function phaseTitle(status: string): string {
  switch (status) {
    case "DRAFT": return "مسودة — أكمل الإعداد";
    case "READY": return "جاهزة — التسجيل لم يفتح";
    case "REG_OPEN": return "التسجيل مفتوح";
    case "REG_CLOSED": return "التسجيل مغلق — بانتظار بدئك";
    case "COMPLETED": return "انتهت الفعالية";
    case "CANCELLED": return "أُلغيت الفعالية";
    default: return status;
  }
}

function phaseBody(status: string, e: EventSnapshot["event"]): string {
  switch (status) {
    case "READY":
      return `افتح التسجيل لتستقبل ${e.commands.join} في المحادثة، أو ابدأ مباشرة إذا أردت.`;
    case "REG_OPEN":
      return `أعلِن في المحادثة: «${e.commands.join}» مع الإشارة إلى عدد المشاركين الحالي \u2190 تُحدّث اللوحة حيًّا.`;
    case "REG_CLOSED":
      return "ابدأ فعليًا من شريط التحكم أعلاه.";
    case "DRAFT":
      return "أكمل خطوات المعالج واحفظ، ثم عُد إلى هذه الصفحة.";
    case "COMPLETED":
      return "النتائج محفوظة في سجل النتائج وتشمل الترتيب النهائي والجولات.";
    case "CANCELLED":
      return "الأفعال المسجلة باقية في سجل العمليات، ولا يوجد فائز معلن.";
    default:
      return "";
  }
}

function Countdown({ endsAtMs, serverSkew }: { endsAtMs: number; serverSkew: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, endsAtMs - (now + serverSkew));
  const s = Math.ceil(left / 1000);
  return (
    <div className="flex items-baseline gap-2">
      <span className={cn("num text-[26px] font-medium leading-7", s <= 5 ? "text-bad" : "text-ink")}>
        {String(Math.floor(s / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}
      </span>
      <span className="text-[11px] text-faint">من ساعة الخادم</span>
    </div>
  );
}

/* ── الترتيب ─────────────────────────────── */

function LeaderboardPanel({ snap }: { snap: EventSnapshot }) {
  return (
    <Card
      title={
        <span className="flex items-center gap-1.5">
          <Trophy className="size-3.5 text-muted" /> الترتيب الحي
        </span>
      }
      actions={<span className="num text-[11px] text-faint">{snap.counts.active}</span>}
      bodyClass="p-0"
    >
      {snap.leaderboard.length === 0 ? (
        <EmptyState title="لا مشاركين بعد" body="بانتظار تسجيلات المشاهدين — تظهر هنا لحظة دخول أول واحد." />
      ) : (
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-sep text-[11px] text-faint">
              <th className="px-3 py-2 text-start font-normal">#</th>
              <th className="px-2 py-2 text-start font-normal">مشاهد</th>
              {snap.teams && <th className="px-2 py-2 text-start font-normal">فريق</th>}
              <th className="px-2 py-2 text-start font-normal">نقاط</th>
              <th className="px-3 py-2 text-start font-normal">صحيحة</th>
            </tr>
          </thead>
          <tbody>
            {snap.leaderboard.slice(0, 10).map((row) => (
              <tr key={row.username} className="border-b border-sep/50 last:border-0">
                <td className="px-3 py-1.5 num text-faint">{row.rank}</td>
                <td className="px-2 py-1.5"><span className="ltr-tech">{row.username}</span></td>
                {snap.teams && (
                  <td className="px-2 py-1.5">
                    <TeamTag team={row.team} />
                  </td>
                )}
                <td className="px-2 py-1.5 num font-medium">{row.score}</td>
                <td className="px-3 py-1.5 num text-muted">{row.correct}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {snap.teams && (
        <div className="space-y-2 border-t border-sep px-3 py-2.5">
          {snap.teams.map((t) => (
            <div key={t.key} className="flex items-center justify-between gap-2 text-[12px]">
              <TeamTag team={t.key} label={t.label} />
              <span className="num text-muted">{t.score} نقطة</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function TeamTag({ team, label }: { team: string | null; label?: string }) {
  if (!team) return <span className="text-faint">—</span>;
  const isRed = team === "red";
  return (
    <span
      className={cn(
        "inline-flex rounded-xs border px-1.5 py-0.5 text-[11px]",
        isRed ? "border-[#5c2b28] bg-bad-bg text-bad" : "border-[#2b4568] bg-info-bg text-info",
      )}
    >
      {label ?? (isRed ? "الأحمر" : "الأزرق")}
    </span>
  );
}

/* ── الإجابات ────────────────────────────── */

function AnswersPanel({ snap }: { snap: EventSnapshot }) {
  return (
    <Card title={
      <span className="flex items-center gap-1.5">
        <ListOrdered className="size-3.5 text-muted" /> أحدث الإجابات
      </span>
    } bodyClass="p-0">
      {snap.recentAnswers.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px] text-muted">لا إجابات بعد.</div>
      ) : (
        <ul className="divide-y divide-sep/50 text-[12px]">
          {snap.recentAnswers.map((a, i) => (
            <li key={i} className="flex items-center justify-between gap-2 px-3 py-1.5">
              <span className="truncate">
                <span className="ltr-tech">{a.username}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="num text-faint">س{a.round}</span>
                <Badge tone={a.outcome === "CORRECT" ? "ok" : a.outcome === "WRONG" ? "info" : "warn"}>
                  {a.outcome === "CORRECT" ? "صحيحة" : a.outcome === "WRONG" ? "خاطئة" : "مرفوضة"}
                </Badge>
                <span className="num text-faint">{fmtTime(a.at)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ── السجل والصندوق ──────────────────────── */

function ActivityPanel({ snap }: { snap: EventSnapshot }) {
  return (
    <Card title={<span className="flex items-center gap-1.5"><Activity className="size-3.5 text-muted" /> أحدث الأفعال</span>} bodyClass="p-0">
      {snap.activity.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px] text-muted">لا أفعال بعد.</div>
      ) : (
        <ul className="space-y-1 px-3 py-2 text-[12px]">
          {snap.activity.map((a, i) => (
            <li key={i} className="flex items-start justify-between gap-2 text-muted">
              <span className="flex items-start gap-1.5">
                {a.source === "SYSTEM" ? <RefreshCw className="mt-1 size-3 shrink-0 text-faint" /> : <Send className="mt-1 size-3 shrink-0 text-faint" />}
                {a.text}
              </span>
              <span className="num shrink-0 text-[10.5px] text-faint">{fmtTime(a.ts)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function OutboxPanel({ snap }: { snap: EventSnapshot }) {
  return (
    <Card title={
      <span className="flex items-center gap-1.5">
        <Inbox className="size-3.5 text-muted" /> صندوق إعلانات البوت
      </span>
    } bodyClass="p-0">
      {snap.outbox.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px] text-muted">
          لا رسائل بعد — كل إعلان يمر من هنا ويُوثّق حالته (أُرسلت/محفوظة/فشل).
        </div>
      ) : (
        <ul className="divide-y divide-sep/50">
          {snap.outbox.map((m) => {
            const st = OUTBOX_STATUS[m.status] ?? { label: m.status, tone: "neutral" as const };
            return (
              <li key={m.id} className="px-3 py-2">
                <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                  <Badge tone={st.tone}>{st.label}</Badge>
                  <span className="num text-faint">{fmtTime(m.createdAt)}</span>
                </div>
                <div className="whitespace-pre-wrap text-[12px] leading-6 text-ink/90">{m.content}</div>
                {m.lastError && <div className="mt-0.5 text-[10.5px] text-bad">{m.lastError}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ── المحاكي (وضع الاختبار) ──────────────── */

function SimulatorPanel({
  simBusy,
  simName,
  setSimName,
  simText,
  setSimText,
  simulate,
  commands,
}: {
  simBusy: boolean;
  simName: string;
  setSimName: (v: string) => void;
  simText: string;
  setSimText: (v: string) => void;
  simulate: () => void;
  commands: Record<string, string>;
}) {
  const quick = [
    { t: commands.join, label: "تسجيل" },
    { t: commands.leave, label: "انسحاب" },
    { t: `${commands.answer} أ`, label: "إجابة أ" },
    { t: `${commands.answer} ب`, label: "إجابة ب" },
    { t: commands.score, label: "ترتيبي" },
    { t: commands.info, label: "حالة" },
    { t: commands.help, label: "مساعدة" },
  ];
  return (
    <Card
      title={<span className="flex items-center gap-1.5"><LogIn className="size-3.5 text-warn" /> محاكي المحادثة</span>}
      actions={<Badge tone="warn">وضع اختبار</Badge>}
    >
      <p className="mb-2 text-[11.5px] text-muted">
        الرسائل هنا تعبر نفس خط التحقق المُستخدم مع رسائل Kick الصحيحة تمامًا — لكنها معزولة
        عن القناة الحقيقية وموسومة كاختبار.
      </p>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {quick.map((b) => (
          <button
            key={b.t}
            type="button"
            onClick={() => setSimText(b.t)}
            className="rounded-xs border border-sep-strong bg-elevation px-2 py-1 text-[11px] text-muted hover:text-ink"
          >
            {b.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input
          value={simName}
          onChange={(ev) => setSimName(ev.target.value)}
          placeholder="اسم المشاهد"
          aria-label="اسم المشاهد في المحاكاة"
          className="ltr-tech h-9 col-span-1 rounded-sm border border-sep-strong bg-elevation px-2 text-[12px]"
          maxLength={24}
        />
        <input
          value={simText}
          onChange={(ev) => setSimText(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" && !simBusy) simulate();
          }}
          dir={simText.startsWith("!") ? "ltr" : "rtl"}          aria-label="نص رسالة المحاكاة"
          className="ltr-tech h-9 col-span-2 rounded-sm border border-sep-strong bg-elevation px-2 text-[12px]"
          maxLength={300}
        />
      </div>
      <Button size="sm" className="mt-2" onClick={simulate} loading={simBusy}>
        إرسال للتدفق
      </Button>
      <div className="mt-2 text-[11px] text-faint">
        الأوامر الحالية: <code className="ltr-tech">{commands.join}</code> ·{" "}
        <code className="ltr-tech">{commands.answer} [إجابة]</code> ·{" "}
        <code className="ltr-tech">{commands.score}</code>
      </div>
    </Card>
  );
}
