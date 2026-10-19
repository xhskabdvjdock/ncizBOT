import type { Metadata } from "next";
import "@dawod/thmanyah-font-web";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "منصة فعاليات Kick", template: "%s — منصة فعاليات Kick" },
  description:
    "إدارة فعاليات تفاعلية مباشرة لقناة Kick: أسئلة، تحديات سرعة، ومواجهات فرق — مع بوت محادثة متكامل.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className="min-h-screen bg-bg text-ink antialiased">{children}</body>
    </html>
  );
}
