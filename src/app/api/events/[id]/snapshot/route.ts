import { NextRequest, NextResponse } from "next/server";
import { assertEventOwnership, requireUser, toApiError } from "@/server/api-helpers";
import { buildEventSnapshot } from "@/server/snapshot";

type Ctx = { params: Promise<{ id: string }> };

/** بديل الاستطلاع لدفق SSE — لقطة كاملة عند الطلب. */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireUser(req);
    if (!user) return NextResponse.json({ error: "جلسة مطلوبة" }, { status: 401 });
    const { id } = await ctx.params;
    await assertEventOwnership(user.id, id);
    const snapshot = await buildEventSnapshot(id);
    if (!snapshot) return NextResponse.json({ error: "غير موجودة" }, { status: 404 });
    return NextResponse.json({ snapshot });
  } catch (e) {
    return toApiError(e);
  }
}
