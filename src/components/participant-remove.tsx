"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { UserMinus } from "lucide-react";

/** إزالة مشارك — نافذة تأكيد تكسر الإيموجي بلا تحققات وهمية. */
export function RemoveParticipantButton({
  eventId,
  participantId,
  username,
}: {
  eventId: string;
  participantId: string;
  username: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "confirm" | "busy">("idle");
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setState("busy");
    setError(null);
    const res = await fetch(`/api/events/${eventId}/participants`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ participantId }),
    });
    if (res.ok) {
      setState("idle");
      router.refresh();
    } else {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? "فشل الإزالة");
      setState("confirm");
    }
  };

  if (state === "idle") {
    return (
      <Button size="sm" variant="ghost" onClick={() => setState("confirm")} title="إزالة من الفعالية">
        <UserMinus className="size-3.5" />
      </Button>
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-[11px]">
      <span className="text-bad">إزالة {username}؟</span>
      <Button size="sm" variant="danger" loading={state === "busy"} onClick={remove}>
        تأكيد
      </Button>
      {error && <span className="text-bad">{error}</span>}
      <Button size="sm" variant="ghost" onClick={() => setState("idle")}>
        تراجع
      </Button>
    </span>
  );
}
