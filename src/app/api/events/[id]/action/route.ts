import { NextRequest, NextResponse } from "next/server";
import {
  assertEventOwnership,
  requireUser,
  toApiError,
} from "@/server/api-helpers";
import {
  performAction,
  pauseEvent,
  resumeEvent,
  advanceRound,
} from "@/server/engine/engine";
import { buildEventSnapshot } from "@/server/snapshot";
import { z } from "zod";
import { publish } from "@/server/realtime";

const actionSchema = z.object({
  action: z.enum([
    "PREPARE",
    "PREPARE_EDIT",
    "OPEN_REGISTRATION",
    "CLOSE_REGISTRATION",
    "START",
    "FINISH",
    "CANCEL",
    "PAUSE",
    "RESUME",
    "ADVANCE_ROUND",
  ]),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireUser(req);
    if (!user) return NextResponse.json({ error: "جلسة مطلوبة" }, { status: 401 });
    const { id } = await ctx.params;
    const event = await assertEventOwnership(user.id, id);
    const { action } = actionSchema.parse(await req.json());

    let message: string | undefined;
    switch (action) {
      case "PAUSE":
        await pauseEvent(id, user.id);
        break;
      case "RESUME":
        await resumeEvent(id, user.id);
        break;
      case "ADVANCE_ROUND":
        await advanceRound(id, user.id);
        break;
      default:
        await performAction(id, user.id, action);
        break;
    }

    publish(event.channelId, id, { kind: "refresh" }, "patch");
    const snapshot = await buildEventSnapshot(id);
    return NextResponse.json({ ok: true, snapshot, message });
  } catch (e) {
    return toApiError(e);
  }
}
