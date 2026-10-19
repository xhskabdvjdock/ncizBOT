import { cn } from "@/lib/utils";
import type { CSSProperties, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

/* زر — التزم بالأغراض الثلاثة فقط: أساسي/ثانوي/خطر */
export function Button({
  variant = "default",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
}) {
  const styles: Record<string, string> = {
    default:
      "bg-elevation border border-sep-strong text-ink hover:bg-[#23282d]",
    primary:
      "bg-accent text-[#0b2f00] border border-accent hover:bg-accent-soft font-medium",
    ghost: "bg-transparent border border-transparent text-muted hover:text-ink hover:bg-elevation",
    danger: "bg-bad-bg border border-[#5c2b28] text-bad hover:bg-[#3a1d1a]",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-sm transition-colors",
        size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-9 px-3.5 text-[13px]",
        styles[variant],
        (disabled || loading) && "opacity-50 pointer-events-none",
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function Card({
  title,
  actions,
  children,
  className,
  bodyClass,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-md border border-sep bg-surface",
        className,
      )}
    >
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-sep px-4 h-11">
          <h2 className="text-[13px] font-medium text-ink">{title}</h2>
          {actions}
        </header>
      )}
      <div className={cn("p-4", bodyClass)}>{children}</div>
    </section>
  );
}

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: "neutral" | "ok" | "warn" | "bad" | "info" | "accent";
  children: ReactNode;
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-elevation text-muted border-sep-strong",
    ok: "bg-ok-bg text-ok border-[#28513a]",
    warn: "bg-warn-bg text-warn border-[#5a4520]",
    bad: "bg-bad-bg text-bad border-[#5c2b28]",
    info: "bg-info-bg text-info border-[#2b4568]",
    accent: "bg-[#132a08] text-accent-ink border-[#2f5c1c]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-xs border px-1.5 py-0.5 text-[11px] leading-4",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ tone }: { tone: "ok" | "warn" | "bad" | "neutral" }) {
  const map: Record<string, string> = {
    ok: "bg-ok",
    warn: "bg-warn",
    bad: "bg-bad",
    neutral: "bg-faint",
  };
  return (
    <span
      aria-hidden
      className={cn("inline-block size-1.5 rounded-full", map[tone])}
    />
  );
}

export function Input(
  props: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string; error?: string },
) {
  const { label, hint, error, className, id, ...rest } = props;
  const inputId = id ?? rest.name;
  return (
    <div className="block">
      {label && (
        <label htmlFor={inputId} className="mb-1 block text-[12px] text-muted">
          {label}
        </label>
      )}
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint ? `${inputId}-hint` : undefined}
        className={cn(
          "h-9 w-full rounded-sm border border-sep-strong bg-elevation px-2.5 text-[13px] text-ink placeholder:text-faint",
          error && "border-bad",
          className,
        )}
        {...rest}
      />
      {error ? (
        <span className="mt-1 block text-[11px] text-bad">{error}</span>
      ) : hint ? (
        <span id={`${inputId}-hint`} className="mt-1 block text-[11px] text-faint">{hint}</span>
      ) : null}
    </div>
  );
}

export function Select(
  props: SelectHTMLAttributes<HTMLSelectElement> & { label?: string },
) {
  const { label, className, id, children, ...rest } = props;
  const selectId = id ?? rest.name;
  return (
    <label className="block" htmlFor={selectId}>
      {label && (
        <span className="mb-1 block text-[12px] text-muted">{label}</span>
      )}
      <select
        id={selectId}
        className={cn(
          "h-9 w-full rounded-sm border border-sep-strong bg-elevation px-2 text-[13px] text-ink",
          className,
        )}
        {...rest}
      >
        {children}
      </select>
    </label>
  );
}

export function Textarea(
  props: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: string },
) {
  const { label, hint, className, id, ...rest } = props;
  const areaId = id ?? rest.name;
  return (
    <div className="block">
      {label && (
        <label htmlFor={areaId} className="mb-1 block text-[12px] text-muted">
          {label}
        </label>
      )}
      <textarea
        id={areaId}
        aria-describedby={hint ? `${areaId}-hint` : undefined}
        className={cn(
          "w-full rounded-sm border border-sep-strong bg-elevation px-2.5 py-1.5 text-[13px] text-ink placeholder:text-faint min-h-[64px]",
          className,
        )}
        {...rest}
      />
      {hint && <span id={`${areaId}-hint`} className="mt-1 block text-[11px] text-faint">{hint}</span>}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <div className="text-[13px]">{label}</div>
        {hint && <div className="text-[11px] text-faint">{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full border transition-colors",
          checked ? "bg-accent-soft/90 border-accent-soft" : "bg-elevation border-sep-strong",
          disabled && "opacity-50",
        )}
      >
        <span
          aria-hidden
          className="absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full bg-bg transition-all"
          style={{
            insetInlineStart: checked ? "calc(100% - 1.0625rem)" : "0.1875rem",
          }}
        />
      </button>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  icon,
  actions,
}: {
  title: string;
  body?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
      {icon && <div className="mb-1 text-faint">{icon}</div>}
      <div className="text-[13px] text-ink">{title}</div>
      {body && <div className="max-w-sm text-[12px] text-muted">{body}</div>}
      {actions && <div className="mt-3 flex gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 animate-spin text-muted", className)} />;
}

export function ProgressBar({
  value,
  max,
  style,
}: {
  value: number;
  max: number;
  style?: CSSProperties;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-sep"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      style={style}
    >
      <div className="h-full bg-accent-soft transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}
