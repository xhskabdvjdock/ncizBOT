import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { getSessionUser } from "@/server/auth";
import EventWizardClient from "@/components/events/wizard-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "إنشاء فعالية" };

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const session = await getSessionUser((await cookies()).get("kep_session")?.value);
  if (!session) redirect("/login");

  const channels = await db.channel.findMany({
    where: { ownerUserId: session.id },
    include: { state: true },
    orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
  });

  const { draft } = await searchParams;
  const props = {
    channels: channels.map((c) => ({
      id: c.id,
      kind: c.kind === "KICK" ? ("KICK" as const) : ("LOCAL" as const),
      label: c.kind === "LOCAL" ? "قناة الاختبار المحلية" : c.kickUsername,
      connected: c.kind === "LOCAL" ? false : c.state?.status === "CONNECTED",
    })),
    draftId: draft ?? null,
  };
  return <EventWizardClient {...props} />;
}
