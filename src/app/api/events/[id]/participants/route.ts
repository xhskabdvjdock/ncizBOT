import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import {
  assertEventOwnership,
  requireUser,
  toApiError,
} from "@/server/api-helpers";
import { removeParticipant } from "@/server/engine/engine";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireUser(req);
    if (!user) return NextResponse.json({ error: "جلسة مطلوبة" }, { status: 401 });
    const { id } = await ctx.params;
    await assertEventOwnership(user.id, id);
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const q = url.searchParams.get("q")?.toLowerCase();

    const rows = await db.participant.findMany({
      where: {
        eventId: id,
        ...(status ? { status } : {}),
      },
      orderBy: [{ score: "desc" }, { joinedAt: "asc" }],
    });
    const filtered = q
      ? rows.filter(
          (r) =>
            r.kickUsername.toLowerCase().includes(q) ||
            String(r.kickUserId).includes(q),
        )
      : rows;
    return NextResponse.json({
      participants: filtered.map((p) => ({
        id: p.id,
        kickUserId: p.kickUserId,
        username: p.kickUsername,
        team: p.teamName,
        status: p.status,
        score: p.score,
        correct: p.correctCount,
        attempts: p.totalAttempts,
        joinedAt: p.joinedAt,
      })),
    });
  } catch (e) {
    return toApiError(e);
  }
}

const deleteSchema = z.object({ participantId: z.string().min(5) });

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireUser(req);
    if (!user) return NextResponse.json({ error: "جلسة مطلوبة" }, { status: 401 });
    const { id } = await ctx.params;
    await assertEventOwnership(user.id, id);
    const body = deleteSchema.parse(await req.json());
    await removeParticipant(id, body.participantId, user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toApiError(e);
  }
}
