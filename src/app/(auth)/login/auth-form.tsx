"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Input } from "@/components/ui";
import { CircleDot } from "lucide-react";

export function AuthShell({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          mode === "login"
            ? { email, password }
            : { email, password, displayName: displayName || undefined },
        ),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "حدث خطأ");
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="w-full max-w-sm space-y-3 rounded-md border border-sep bg-surface p-5"
    >
      <div className="mb-4 flex items-center gap-2">
        <div aria-hidden className="flex size-6 items-center justify-center rounded-xs bg-accent">
          <CircleDot className="size-3.5 text-[#0b2f00]" />
        </div>
        <div>
          <div className="text-[14px] font-medium">منصة فعاليات Kick</div>
          <div className="text-[11px] text-faint">إدارة فعاليّات قناتك مباشرة من لوحة واحدة</div>
        </div>
      </div>

      {mode === "register" && (
        <Input
          label="الاسم المعروض (يُطلق في سجل العمليات)"
          name="displayName"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="مثال: مشتاق"
          autoComplete="nickname"
        />
      )}
      <Input
        label="البريد الإلكتروني"
        name="email"
        type="email"
        dir="ltr"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
      />
      <Input
        label="كلمة المرور"
        name="password"
        type="password"
        dir="ltr"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={mode === "register" ? 8 : 1}
        autoComplete={mode === "register" ? "new-password" : "current-password"}
        hint={mode === "register" ? "8 محارف على الأقل — تُخزن مجزّأة بـ bcrypt" : undefined}
      />

      {error && (
        <div className="rounded-xs border border-[#5c2b28] bg-bad-bg px-2.5 py-2 text-[12px] text-bad">
          {error}
        </div>
      )}

      <Button type="submit" variant="primary" loading={busy} className="w-full">
        {mode === "login" ? "دخول" : "إنشاء الحساب"}
      </Button>

      <p className="text-center text-[11.5px] text-muted">
        {mode === "login" ? (
          <>
            لا تملك حسابًا؟{" "}
            <Link href="/register" className="text-info hover:underline">
              إنشاء حساب
            </Link>
          </>
        ) : (
          <>
            لديك حساب؟{" "}
            <Link href="/login" className="text-info hover:underline">
              دخول
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
