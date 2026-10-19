import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { getSessionUser } from "@/server/auth";
import { ControlRoom } from "@/components/control/control-room";
import { buildEventSnapshot } from "@/server/snapshot";

export const dynamic = "force-dynamic";

export default async function EventControlPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSessionUser((await cookies()).get("kep_session")?.value);
  if (!session) redirect("/login");

  const event = await db.event.findUnique({
    where: { id },
    include: { channel: { include: { state: true } } },
  });
  if (!event || event.channel.ownerUserId !== session.id) notFound();

  const snapshot = await buildEventSnapshot(id);
  if (!snapshot) notFound();

  return (
    <ControlRoom
      eventId={id}
      initialSnapshot={snapshot}
      channelConnected={
        event.channel.kind === "KICK" ? event.channel.state?.status === "CONNECTED" : false
      }
      channelKind={event.channel.kind === "KICK" ? "KICK" : "LOCAL"}
    />
  );
}
