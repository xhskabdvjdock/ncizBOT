import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import {
  assertChannelOwnership,
  requireUser,
  toApiError,
} from "@/server/api-helpers";
import { createEvent } from "@/server/engine/engine";
import { parseDraftInput } from "@/core/config";
import { z } from "zod";

const createSchema = z.object({
  channelId: z.string().min(5),
  action: z.enum(["SAVE_DRAFT", "PREPARE", "START"]).default("SAVE_DRAFT"),
  draft: z.unknown(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!user) return NextResponse.json({ error: "جلسة مطلوبة" }, { status: 401 });

    const body = createSchema.parse(await req.json());
    await assertChannelOwnership(user.id, body.channelId);
    const draft = parseDraftInput(body.draft);

    const event = await createEvent({
      channelId: body.channelId,
      userId: user.id,
      draft,
      action: body.action,
    });

    return NextResponse.json({ event: { id: event.id, status: event.status } }, { status: 201 });
  } catch (e) {
    return toApiError(e);
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!user) return NextResponse.json({ error: "جلسة مطلوبة" }, { status: 401 });
    const events = await db.event.findMany({
      where: { channel: { ownerUserId: user.id } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        _count: { select: { participants: true } },
      },
    });
    return NextResponse.json({
      events: events.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
        status: e.status,
        simulation: e.simulation,
        createdAt: e.createdAt,
        participants: e._count.participants,
      })),
    });
  } catch (e) {
    return toApiError(e);
  }
}
