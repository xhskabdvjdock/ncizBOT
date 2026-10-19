import { publish } from "@/server/realtime";
import {
  activeEventForChannel,
  processChatMessage,
  type IngestMessage,
} from "./chat-commands";

/**
 * طبقة الدخول الموحدة لرسائل المحادثة — تُستخدم من مسار
 * ويب هوك Kick الحقيقي ومن برنامج وضع الاختبار.
 * بعد المعالجة تنشر إشارة تحديث لدفق لوحة التحكم.
 */
export async function ingestChatMessage(input: {
  channelId: string;
  msg: IngestMessage;
}): Promise<unknown> {
  const event = await activeEventForChannel(input.channelId);
  const outcome = await processChatMessage({ event, msg: input.msg });
  publish(input.channelId, event?.id, { kind: "refresh" }, "patch");
  return outcome;
}
