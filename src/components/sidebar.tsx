"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  CalendarDays,
  PlusCircle,
  Users,
  Trophy,
  Bot,
  Plug,
  ScrollText,
  Menu,
  X,
  LogOut,
  CircleDot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Dot } from "@/components/ui";

export type NavChannel = {
  id: string;
  kind: "KICK" | "LOCAL";
  label: string;
  slug: string;
  status: string;
};

const ITEMS: { href: string; label: string; icon: React.ReactNode }[] = [
  { href: "/", label: "نظرة عامة", icon: <LayoutDashboard className="size-4" /> },
  { href: "/events", label: "الفعاليات", icon: <CalendarDays className="size-4" /> },
  { href: "/events/new", label: "إنشاء فعالية", icon: <PlusCircle className="size-4" /> },
  { href: "/participants", label: "المشاركون", icon: <Users className="size-4" /> },
  { href: "/results", label: "سجل النتائج", icon: <Trophy className="size-4" /> },
  { href: "/settings", label: "إعدادات البوت", icon: <Bot className="size-4" /> },
  { href: "/kick", label: "ربط Kick", icon: <Plug className="size-4" /> },
  { href: "/audit", label: "سجل العمليات", icon: <ScrollText className="size-4" /> },
];

function connTone(status: string): "ok" | "warn" | "bad" | "neutral" {
  switch (status) {
    case "CONNECTED":
      return "ok";
    case "ERROR":
      return "bad";
    default:
      return "neutral";
  }
}

function connLabel(ch: NavChannel | undefined): string {
  if (!ch) return "لا قناة";
  switch (ch.status) {
    case "CONNECTED":
      return "متصلة";
    case "ERROR":
      return "خطأ اتصال";
    default:
      return "غير متصلة";
  }
}

export function Sidebar({
  channels,
  currentChannelId,
  user,
}: {
  channels: NavChannel[];
  currentChannelId: string | null;
  user: { displayName: string; email: string };
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const activeChannel = channels.find((c) => c.id === currentChannelId);
  const kickChannel = channels.find((c) => c.kind === "KICK");

  return (
    <>
      {/* شريط الجوال */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-sep bg-surface px-3 py-2 lg:hidden">
        <button
          className="rounded-sm border border-sep-strong p-1.5 text-muted"
          onClick={() => setOpen(true)}
          aria-label="فتح القائمة"
        >
          <Menu className="size-4" />
        </button>
        <div className="text-[13px] font-medium">منصة فعاليات Kick</div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted">
          <Dot tone={connTone(kickChannel?.status ?? "NOT_CONNECTED")} />
          {connLabel(kickChannel)}
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 z-50 flex w-60 flex-col border-e border-sep bg-surface transition-transform",
          "start-0 lg:static lg:z-auto",
          open ? "translate-x-0" : "translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex h-12 items-center justify-between border-b border-sep px-3">
          <Link href="/" className="flex items-center gap-2">
            <div
              aria-hidden
              className="flex size-5 items-center justify-center rounded-xs bg-accent"
            >
              <CircleDot className="size-3 text-[#0b2f00]" />
            </div>
            <span className="text-[13px] font-medium">منصة الفعاليات</span>
          </Link>
          <button
            className="rounded-sm p-1 text-faint lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="إغلاق القائمة"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="border-b border-sep px-3 py-2.5">
          <div className="mb-1 text-[11px] text-faint">القناة</div>
          {kickChannel ? (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[12px]">
                  <span className="ltr-tech">{kickChannel.label}</span>
                </div>
              </div>
              <span className="flex items-center gap-1 text-[11px] text-muted">
                <Dot tone={connTone(kickChannel.status)} />
                {connLabel(kickChannel)}
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] text-muted">لا قناة Kick</span>
              <span className="flex items-center gap-1 text-[11px] text-faint">
                <Dot tone="neutral" />
                غير متصلة
              </span>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto p-2" aria-label="التنقل الرئيسي">
          <ul className="space-y-0.5">
            {ITEMS.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href ||
                    (pathname.startsWith(item.href + "/") && item.href !== "/events");
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-[13px] transition-colors",
                      active
                        ? "bg-elevation text-ink border border-sep-strong"
                        : "text-muted border border-transparent hover:text-ink hover:bg-elevation/60",
                    )}
                  >
                    <span className={cn(active ? "text-accent-ink" : "text-faint")}>
                      {item.icon}
                    </span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <AccountMenu user={user} />
      </aside>
    </>
  );
}

function AccountMenu({
  user,
}: {
  user: { displayName: string; email: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <div className="border-t border-sep p-3">
      <div className="mb-2 truncate text-[12px]" title={user.email}>
        {user.displayName}
      </div>
      <button
        className="flex w-full items-center gap-2 rounded-sm border border-sep-strong px-2 py-1.5 text-[12px] text-muted hover:text-ink"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await fetch("/api/auth/logout", { method: "POST" });
          router.push("/login");
          router.refresh();
        }}
      >
        <LogOut className="size-3.5" />
        {busy ? "جارٍ الخروج…" : "تسجيل الخروج"}
      </button>
    </div>
  );
}
