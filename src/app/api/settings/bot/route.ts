import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/server/db";
import { requireUser, toApiError } from "@/server/api-helpers";
import { eventConfigSchema } from "@/core/config";
import { audit } from "@/server/audit";

const patchSchema = z.object({
  commandPrefix: z.string().max(4).optional(),
  botDisplayName: z.string().trim().max(30).optional(),
  sendType: z.enum(["user", "bot"]).optional(),
  minSendIntervalMs: z.number().int().min(600).max(10_000).optional(),
  replyToCommands: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!user) return NextResponse.json({ error: "جلسة مطلوبة" }, { status: 401 });
    const url = new URL(req.url);
    const channelId = url.searchParams.get("channelId");
    if (!channelId) {
      return NextResponse.json({ error: "channelId مطلوب" }, { status: 422 });
    }
    const state = await db.connectionState.findUnique({ where: { channelId } });
    const settings = await db.botSettings.findUnique({ where: { channelId } });
    return NextResponse.json({ settings, state });
  } catch (e) {
    return toApiError(e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!user) return NextResponse.json({ error: "جلسة مطلوبة" }, { status: 401 });
    const body = patchSchema.parse(await req.json());
    const url = new URL(req.url);
    const channelId = url.searchParams.get("channelId");
    if (!channelId) {
      return NextResponse.json({ error: "channelId مطلوب" }, { status: 422 });
    }
    const channel = await db.channel.findUnique({ where: { id: channelId } });
    if (!channel || channel.ownerUserId !== user.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }
    const settings = await db.botSettings.upsert({
      where: { channelId },
      create: {
        channelId,
        botDisplayName: body.botDisplayName ?? "بوت المنصة",
        commandPrefix: body.commandPrefix ?? "!",
        sendType: body.sendType ?? "user",
        minSendIntervalMs: body.minSendIntervalMs ?? 1200,
        replyToCommands: body.replyToCommands ?? true,
      },
      update: {
        ...(body.botDisplayName !== undefined ? { botDisplayName: body.botDisplayName } : {}),
        ...(body.commandPrefix !== undefined ? { commandPrefix: body.commandPrefix } : {}),
        ...(body.sendType !== undefined ? { sendType: body.sendType } : {}),
        ...(body.minSendIntervalMs !== undefined
          ? { minSendIntervalMs: body.minSendIntervalMs }
          : {}),
        ...(body.replyToCommands !== undefined
          ? { replyToCommands: body.replyToCommands }
          : {}),
      },
    });
    await audit({
      channelId,
      userId: user.id,
      action: "SETTINGS_UPDATE",
      detail: { keys: Object.keys(body) },
    });
    return NextResponse.json({ settings });
  } catch (e) {
    return toApiError(e);
  }
}
