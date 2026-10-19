/**
 * ناقل حالات داخلي للتحديث الحي (SSE) في العملية الحالية.
 * إرسال التحديثات سريع ومحصور؛ لا يتضمن أسرارًا.
 */

export type RealtimeEnvelope = {
  type: "snapshot" | "patch";
  channel: string;
  event?: string;
  data: unknown;
  at: number;
};

type Listener = (msg: RealtimeEnvelope) => void;

const globalBus = globalThis as unknown as {
  __kep_listeners?: Set<Listener>;
};

function listeners(): Set<Listener> {
  if (!globalBus.__kep_listeners) globalBus.__kep_listeners = new Set();
  return globalBus.__kep_listeners;
}

export function subscribe(fn: Listener): () => void {
  const set = listeners();
  set.add(fn);
  return () => set.delete(fn);
}

export function publish(
  channel: string,
  event: string | undefined,
  data: unknown,
  type: "snapshot" | "patch" = "patch",
): void {
  const msg: RealtimeEnvelope = {
    type,
    channel,
    event,
    data,
    at: Date.now(),
  };
  for (const fn of listeners()) {
    try {
      fn(msg);
    } catch {
      /* مستمع تالف — تجاهل وحرّر لاحقًا */
    }
  }
}
