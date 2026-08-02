"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

interface ProvidersProps {
  children: ReactNode;
  /** Per-request CSP nonce, applied to next-themes' inline anti-flicker script (SEC-12). */
  nonce?: string;
}

// next-themes injects an inline <script> to prevent theme flicker before hydration.
// React 19 warns about script tags inside client components; the warning is a false
// positive for this SSR use case (shadcn/ui Next.js dark-mode guide).
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("Encountered a script tag while rendering React component")
    ) {
      return;
    }
    originalError.apply(console, args);
  };
}

/**
 * QLT-11: QueryClientProvider used to be mounted here, putting @tanstack/react-query in the
 * client bundle of every page — while a repo-wide search found zero useQuery, useMutation
 * or useInfiniteQuery call sites. The app is server components plus server actions plus
 * router.refresh throughout, which is a coherent choice; it simply never used the library it
 * was shipping. Removed rather than kept "in case", because a provider nothing consumes is
 * indistinguishable from one whose consumers were deleted by mistake.
 */
export function Providers({ children, nonce }: ProvidersProps): ReactNode {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      nonce={nonce}
    >
      {children}
    </ThemeProvider>
  );
}
