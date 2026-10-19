import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUser } from "@/server/api-helpers";

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ user: null, channels: [] });
  const channels = await db.channel.findMany({
    where: { ownerUserId: user.id },
    include: { state: true },
  });
  return NextResponse.json({
    user,
    channels: channels.map((c) => ({
      id: c.id,
      kind: c.kind,
      label: c.kind === "LOCAL" ? "قناة الاختبار المحلية" : c.kickUsername,
      slug: c.kickChannelSlug,
      status: c.state?.status ?? "NOT_CONNECTED",
      lastCheckedAt: c.state?.lastCheckedAt ?? null,
      subscriptionsActive: c.state?.subscriptionsActive ?? false,
    })),
  });
}
