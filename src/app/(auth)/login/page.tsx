import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { getSessionUser } from "@/server/auth";

export const metadata = { title: "الدخول" };

export default async function LoginPage() {
  const sessionId = (await cookies()).get("kep_session")?.value;
  const user = await getSessionUser(sessionId);
  if (user) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <AuthShell mode="login" />
    </main>
  );
}

import { AuthShell } from "./auth-form";
