import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { getSessionUser } from "@/server/auth";
import { cookies } from "next/headers";
import { Sidebar, type NavChannel } from "@/components/sidebar";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const sessionId = (await cookies()).get("kep_session")?.value;
  const user = await getSessionUser(sessionId);
  if (!user) redirect("/login");

  const channels = await db.channel.findMany({
    where: { ownerUserId: user.id },
    include: { state: true },
    orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
  });

  const navChannels: NavChannel[] = channels.map((c) => ({
    id: c.id,
    kind: c.kind === "KICK" ? "KICK" : "LOCAL",
    label: c.kind === "LOCAL" ? "قناة الاختبار المحلية" : c.kickUsername,
    slug: c.kickChannelSlug,
    status: c.state?.status ?? "NOT_CONNECTED",
  }));

  return (
    <div className="flex min-h-screen">
      <Sidebar
        channels={navChannels}
        currentChannelId={navChannels[0]?.id ?? null}
        user={{ displayName: user.displayName, email: user.email }}
      />
      <main className="min-w-0 flex-1 px-4 py-4 lg:px-6 lg:py-5">{children}</main>
    </div>
  );
}
