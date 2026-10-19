import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertChannelOwnership,
  requireUser,
  toApiError,
} from "@/server/api-helpers";
import { db } from "@/server/db";
import { healthSweep } from "@/server/engine/scheduler";
import { publish } from "@/server/realtime";
import { audit } from "@/server/audit";
import { REQUIRED_SCOPES } from "@/server/kick/client";

const bodySchema = z.object({
  action: z.enum(["HEALTH", "CHECK", "DISCONNECT"]),
  channelId: z.string().min(5),
});

/** فحص الاتصال أو قطعه فعلًا. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!user) return NextResponse.json({ error: "جلسة مطلوبة" }, { status: 401 });
    const { action, channelId } = bodySchema.parse(await req.json());
    await assertChannelOwnership(user.id, channelId);

    if (action === "DISCONNECT") {
      const { disconnectChannel } = await import("@/server/kick/disconnect");
      await disconnectChannel(channelId, user.id);
      publish(channelId, undefined, { kind: "connection" }, "patch");
      return NextResponse.json({ ok: true });
    }

    // فحص فعلي فوري (يستخدم نفس مسار الفحص الدوري)
    await healthSweep();
    await audit({
      channelId,
      userId: user.id,
      action: "KICK_HEALTH_CHECK",
    });
    const state = await db.connectionState.findUnique({ where: { channelId } });
    const channel = await db.channel.findUnique({
      where: { id: channelId },
      include: { credential: true },
    });
    const scopes = channel?.credential?.scopes?.split(" ").filter(Boolean) ?? [];
    const missing = REQUIRED_SCOPES.filter((s) => !scopes.includes(s));
    publish(channelId, undefined, { kind: "connection" }, "patch");
    return NextResponse.json({
      state: state?.status ?? "NOT_CONNECTED",
      lastCheck: state?.lastCheckedAt ?? null,
      lastHealthy: state?.lastHealthyAt ?? null,
      lastError: state?.lastError ?? null,
      subscriptionsActive: state?.subscriptionsActive ?? false,
      grantedScopes: scopes,
      missingScopes: missing,
    });
  } catch (e) {
    return toApiError(e);
  }
}
