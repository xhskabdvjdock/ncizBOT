import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSessionUser } from "@/server/auth";

export const metadata = { title: "حساب جديد" };

export default async function RegisterPage() {
  const sessionId = (await cookies()).get("kep_session")?.value;
  const user = await getSessionUser(sessionId);
  if (user) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <AuthShell mode="register" />
    </main>
  );
}

import { AuthShell } from "../login/auth-form";
