import { clsx, type ClassValue } from "clsx";

export function cn(...parts: ClassValue[]) {
  return clsx(parts);
}

/** تنسيق أزمنة على الصيغة العربية القصيرة */
export function fmtTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("ar", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("ar", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function fmtElapsed(from: Date | string, to: Date | string | null): string {
  const a = typeof from === "string" ? Date.parse(from) : from.getTime();
  const b = to ? (typeof to === "string" ? Date.parse(to) : to.getTime()) : Date.now();
  const mins = Math.max(0, Math.round((b - a) / 60000));
  if (mins < 60) return `${mins} دقيقة`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} س ${m} د` : `${h} ساعة`;
}

/** مكوّن متبقي/فائت من موعد */
export function remainingText(endsAtMs: number, serverOffset: number): string {
  const left = Math.max(0, endsAtMs - (Date.now() + serverOffset));
  const s = Math.ceil(left / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s}`;
}
