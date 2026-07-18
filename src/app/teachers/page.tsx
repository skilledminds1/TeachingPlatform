import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Find tutors",
  description: "Browse verified teachers on TeachingPlatform.",
};

export default function TeachersPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center space-y-6 px-6 py-16 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Tutor marketplace</h1>
      <p className="text-muted-foreground">
        Search, filters, and teacher profiles ship in Phase 3. Authentication is ready — create an
        account to get started.
      </p>
      <div className="flex justify-center gap-3">
        <Button render={<Link href="/register" />}>Get started</Button>
        <Button variant="outline" render={<Link href="/" />}>
          Home
        </Button>
      </div>
    </div>
  );
}
