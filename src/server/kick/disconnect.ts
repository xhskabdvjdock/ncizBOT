import { db } from "@/server/db";
import {
  revokeToken,
  deleteSubscriptions,
  listSubscriptions,
  validAccessToken,
  type ChannelWithCredential,
} from "./client";
import { decryptSecret } from "@/server/crypto";
import { audit } from "@/server/audit";

/** فصل القناة فعليًا: إلغاء إشتراكات الأحداث وعكس الرموز ثم حذف الاعتماد. */
export async function disconnectChannel(
  channelId: string,
  userId: string,
): Promise<void> {
  const channel = (await db.channel.findUnique({
    where: { id: channelId },
    include: { credential: true },
  })) as unknown as ChannelWithCredential | null;
  if (!channel || channel.kind !== "KICK") return;

  // إلغاء إشتراكات الأحداث (أفضل جهد)
  const tokenRes = await validAccessToken(channel);
  if ("token" in tokenRes) {
    const subs = await listSubscriptions(tokenRes.token);
    if (subs.ok && subs.data?.length) {
      await deleteSubscriptions(
        tokenRes.token,
        subs.data.map((s) => s.id),
      ).catch(() => undefined);
    }
  }

  // عكس الرموز لدى Kick (أفضل جهد)
  if (channel.credential) {
    try {
      const refresh = decryptSecret(channel.credential.refreshTokenEnc);
      await revokeToken({ token: refresh, tokenHintType: "refresh_token" });
    } catch {
      /* نرمز للفشل الصامت: الشطب يحدث محليًا مطلقًا */
    }
  }

  await db.connectionState.upsert({
    where: { channelId },
    create: { channelId, status: "NOT_CONNECTED" },
    update: {
      status: "NOT_CONNECTED",
      lastError: null,
      lastHealthyAt: null,
      subscriptionsActive: false,
    },
  });
  await db.kickCredential.deleteMany({ where: { channelId } });

  await audit({
    channelId,
    userId,
    action: "KICK_DISCONNECT",
  });
}
