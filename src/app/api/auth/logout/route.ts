import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { clearSessionCookie, requireUser } from "@/server/api-helpers";
import { destroySession } from "@/server/auth";

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  const sessionId = req.cookies.get("kep_session")?.value;
  if (sessionId) {
    await destroySession(sessionId).catch(() => undefined);
  }
  void user;
  return clearSessionCookie(NextResponse.json({ ok: true }));
}
