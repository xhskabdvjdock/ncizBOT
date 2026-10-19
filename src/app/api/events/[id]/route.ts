import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import {
  assertEventOwnership,
  requireUser,
  toApiError,
} from "@/server/api-helpers";
import { updateDraft, deleteDraft } from "@/server/engine/engine";
import { parseDraftInput, type QuestionInput } from "@/core/config";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireUser(req);
    if (!user) return NextResponse.json({ error: "جلسة مطلوبة" }, { status: 401 });
    const { id } = await ctx.params;
    const event = await assertEventOwnership(user.id, id);
    const questions = await db.question.findMany({
      where: { eventId: id },
      orderBy: { index: "asc" },
    });
    return NextResponse.json({
      event: {
        id: event.id,
        name: event.name,
        description: event.description,
        type: event.type,
        status: event.status,
        simulation: event.simulation,
        channelId: event.channelId,
        config: JSON.parse(event.config || "{}"),
        commands: {
          registration: event.registrationCommand,
          leave: event.leaveCommand,
          answer: event.answerCommand,
          team: event.teamCommand,
          score: event.scoreCommand,
          help: event.helpCommand,
          eventInfo: event.eventCommand,
        },
      },
      questions: questions.map((q): QuestionInput => ({
        prompt: q.prompt,
        options: q.options ? (JSON.parse(q.options) as string[]) : null,
        correctAnswers: JSON.parse(q.correctAnswers) as string[],
        timeLimitSec: q.timeLimitSec,
        points: q.points,
        speedBonus: q.speedBonus,
        explanation: q.explanation,
      })),
    });
  } catch (e) {
    return toApiError(e);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireUser(req);
    if (!user) return NextResponse.json({ error: "جلسة مطلوبة" }, { status: 401 });
    const { id } = await ctx.params;
    await assertEventOwnership(user.id, id);
    const body = (await req.json()) as { draft: unknown };
    const draft = parseDraftInput(body.draft);
    const updated = await updateDraft(id, draft, user.id);
    return NextResponse.json({ event: { id: updated.id } });
  } catch (e) {
    return toApiError(e);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireUser(req);
    if (!user) return NextResponse.json({ error: "جلسة مطلوبة" }, { status: 401 });
    const { id } = await ctx.params;
    await assertEventOwnership(user.id, id);
    await deleteDraft(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toApiError(e);
  }
}
