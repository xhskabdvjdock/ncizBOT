"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { Plug, RefreshCw, Unplug } from "lucide-react";

export function KickActions({
  channelId,
  connected,
  subscriptionsActive,
  kickoff,
}: {
  channelId: string;
  connected: boolean;
  subscriptionsActive: boolean;
  kickoff: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);

  const health = async () => {
    setBusy("health");
    setNotes(null);
    try {
      const res = await fetch("/api/kick/connection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "HEALTH", channelId }),
      });
      const body = (await res.json()) as {
        state?: string;
        missingScopes?: string[];
        subscriptionsActive?: boolean;
        lastError?: string | null;
        error?: string;
      };
      if (!res.ok) {
        setNotes(body.error ?? "فشل الفحص — تحقق أن القناة مرتبطة.");
      } else {
        setNotes(
          body.state === "CONNECTED"
            ? body.subscriptionsActive && !body.missingScopes?.length
              ? "الاتصال سليم والاشتراك مفعّل."
              : `متصلة لكن:${body.missingScopes?.length ? " نطاقات ناقصة " + body.missingScopes.join("،") : ""}${body.subscriptionsActive ? "" : " · اشتراك الأحداث غير مؤكد"}`
            : body.error ?? body.lastError ?? `الحالة: ${body.state}`,
        );
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    if (!channelId) return;
    setBusy("disconnect");
    try {
      const res = await fetch("/api/kick/connection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "DISCONNECT", channelId }),
      });
      const body = (await res.json()) as { error?: string };
      setNotes(res.ok ? "تم قطع الاتصال وعكس الرموز لدى Kick (أفضل جهد)." : body.error ?? "فشل الطلب");
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {kickoff && (
          <a
            href="/api/kick/authorize"
            className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-accent px-3 text-[12px] font-medium text-[#0b2f00]"
          >
            <Plug className="size-3.5" /> {connected ? "إعادة الربط / تحديث الرمز" : "ربط قناة Kick"}
          </a>
        )}
        <Button size="sm" variant="default" loading={busy === "health"} onClick={health}>
          <RefreshCw className="size-3.5" /> فحص الاتصال الآن
        </Button>
        {connected && (
          <Button size="sm" variant="danger" loading={busy === "disconnect"} onClick={disconnect}>
            <Unplug className="size-3.5" /> قطع الاتصال
          </Button>
        )}
      </div>
      {notes && (
        <div className="rounded-xs border border-sep-strong bg-elevation px-2 py-1.5 text-[11.5px] text-muted">
          {notes}
        </div>
      )}
      {!subscriptionsActive && connected && (
        <div className="rounded-xs border border-[#5a4520] bg-warn-bg px-2 py-1.5 text-[11.5px] text-warn">
          اشتراك الأحداث (رسائل المحادثة) غير مؤكد — تأكد من ضبط Webhook URL في تطبيق Kick ثم اضغط
          «فحص الاتصال» لإعادة المحاولة.
        </div>
      )}
    </div>
  );
}
