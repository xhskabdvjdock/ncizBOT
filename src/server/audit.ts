import { db } from "./db";

/**
 * سجل تدقيق فعل إداري — لا يضمّ أسرارًا إطلاقًا.
 */
export async function audit(input: {
  channelId?: string | null;
  userId?: string | null;
  eventId?: string | null;
  action: string;
  detail?: unknown;
}): Promise<void> {
  let detail: string | undefined;
  if (input.detail !== undefined) {
    try {
      detail = JSON.stringify(input.detail);
    } catch {
      detail = '"تعذر على تسلسل التفاصيل"';
    }
  }
  await db.auditLog.create({
    data: {
      channelId: input.channelId ?? undefined,
      userId: input.userId ?? undefined,
      eventId: input.eventId ?? undefined,
      action: input.action,
      detail,
    },
  });
}
