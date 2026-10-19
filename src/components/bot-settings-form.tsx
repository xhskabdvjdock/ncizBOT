"use client";

import { useState } from "react";
import { Button, Card, Input, Select, Toggle } from "@/components/ui";
import { useRouter } from "next/navigation";

export type BotSettings = {
  botDisplayName: string;
  commandPrefix: string;
  sendType: "user" | "bot";
  minSendIntervalMs: number;
  replyToCommands: boolean;
};

export function BotSettingsForm({
  channelId,
  initial,
}: {
  channelId: string;
  initial: BotSettings;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/settings/bot?channelId=${channelId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          botDisplayName: form.botDisplayName,
          commandPrefix: form.commandPrefix,
          sendType: form.sendType,
          minSendIntervalMs: form.minSendIntervalMs,
          replyToCommands: form.replyToCommands,
        }),
      });
      if (res.ok) {
        setMsg({ ok: true, text: "تم الحفظ في قاعدة البيانات." });
        router.refresh();
      } else {
        const body = (await res.json()) as { error?: string };
        setMsg({ ok: false, text: body.error ?? "فشل الحفظ" });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="سلوك البوت أثناء الفعاليات">
      <div className="grid gap-3">
        <Input
          label="الاسم المعرِّف للبوت (يظهر في ردود المعلومات)"
          name="botDisplayName"
          value={form.botDisplayName}
          onChange={(e) => setForm({ ...form, botDisplayName: e.target.value })}
          maxLength={30}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="بادئة الأوامر الافتراضية للفعاليات الجديدة"
            name="commandPrefix"
            value={form.commandPrefix}
            onChange={(e) => setForm({ ...form, commandPrefix: e.target.value })}
            maxLength={4}
            hint="تُطبق عند إنشاء فعالية — الأوامر الحالية لا تتأثر."
          />
          <Select
            label="نوع الإرسال في كت"
            name="sendType"
            value={form.sendType}
            onChange={(e) => setForm({ ...form, sendType: e.target.value as "user" | "bot" })}
          >
            <option value="user">حساب المستخدم (user)</option>
            <option value="bot">حساب البوت (bot)</option>
          </Select>
        </div>
        <Input
          label="أدنى فاصل بين رسائل البوت (ملي ثانية)"
          name="minSendIntervalMs"
          type="number"
          min={600}
          max={10000}
          step={100}
          value={form.minSendIntervalMs}
          onChange={(e) => setForm({ ...form, minSendIntervalMs: Number(e.target.value) || 1200 })}
          hint="كت لا توثق حدًا رقميًا رسميًا؛ 1200 ملي ثانية حد داخلي آمن يتراجع تلقائيًا عند 429."
        />
        <div className="rounded-sm border border-sep-strong bg-elevation p-3">
          <Toggle
            checked={form.replyToCommands}
            onChange={(v) => setForm({ ...form, replyToCommands: v })}
            label="الرد على أوامر المشاهدين الفردية"
            hint="إيقافه يقلل ضوضاء المحادثة لكن المشاهد لا يرى تأكيدات (التسجيل يعمل دائمًا)."
          />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button variant="primary" loading={busy} onClick={save}>
          حفظ الإعدادات
        </Button>
        {msg && (
          <span className={msg.ok ? "text-[12px] text-ok" : "text-[12px] text-bad"}>{msg.text}</span>
        )}
      </div>
    </Card>
  );
}
