import type { Metadata } from "next";
import { headers } from "next/headers";
import { Bricolage_Grotesque, Inter } from "next/font/google";

import { SkipLink } from "@/components/a11y/skip-link";
import { Providers } from "@/components/providers";
import { CSP_NONCE_HEADER } from "@/lib/security/csp";
import { Toaster } from "@/components/ui/sonner";
import "@livekit/components-styles";
import "@/styles/globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-heading",
});

export const metadata: Metadata = {
  title: {
    default: "Amazing Skills — Find Tutors & Book Live Lessons",
    template: "%s | Amazing Skills",
  },
  description:
    "Discover expert tutors, book live video sessions, and buy self-paced courses. Built for teachers and students.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // SEC-12: next-themes injects an inline anti-flicker script. With a nonce-based CSP it
  // needs that nonce or the script is blocked and every visitor sees a flash of the wrong
  // theme. The value is set on the request by src/middleware.ts.
  const nonce = (await headers()).get(CSP_NONCE_HEADER) ?? undefined;

  return (
    <html lang="en" className={`${inter.variable} ${bricolage.variable}`} suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased">
        {/* GLO-03: first focusable element on every page, before any navigation. */}
        <SkipLink />
        <Providers nonce={nonce}>{children}</Providers>
        <Toaster richColors closeButton position="top-right" />
      </body>
    </html>
  );
}
