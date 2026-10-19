import { cn } from "@/lib/utils";

/** حالات فعالية: لون + تسمية — لا يسبق اللون النص. */
export const STATUS_META: Record<string, { label: string; tone: "neutral"|"ok"|"warn"|"bad"|"info"|"accent" }> = {
  DRAFT: { label: "مسودة", tone: "neutral" },
  READY: { label: "جاهزة", tone: "info" },
  REG_OPEN: { label: "التسجيل مفتوح", tone: "ok" },
  REG_CLOSED: { label: "التسجيل مغلق", tone: "warn" },
  RUNNING: { label: "جارية الآن", tone: "accent" },
  COMPLETED: { label: "مكتملة", tone: "ok" },
  CANCELLED: { label: "ملغاة", tone: "bad" },
};

export const TYPE_LABELS: Record<string, string> = {
  QUIZ: "أسئلة مباشرة",
  SPEED: "تحدي سرعة",
  TEAM_BATTLE: "مواجهة فرق",
};

export const OUTBOX_STATUS: Record<string, { label: string; tone: "neutral"|"ok"|"warn"|"bad" }> = {
  PENDING: { label: "قيد الإرسال", tone: "warn" },
  SENT: { label: "أُرسلت", tone: "ok" },
  BLOCKED: { label: "محفوظة — لا اتصال", tone: "bad" },
  FAILED: { label: "فشل الإرسال", tone: "bad" },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const meta = STATUS_META[status] ?? { label: status, tone: "neutral" as const };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xs border px-1.5 py-0.5 text-[11px] leading-4",
        {
          neutral: "bg-elevation text-muted border-sep-strong",
          ok: "bg-ok-bg text-ok border-[#28513a]",
          warn: "bg-warn-bg text-warn border-[#5a4520]",
          bad: "bg-bad-bg text-bad border-[#5c2b28]",
          info: "bg-info-bg text-info border-[#2b4568]",
          accent: "bg-[#132a08] text-accent-ink border-[#2f5c1c]",
        }[meta.tone],
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
