import { GraduationCap } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const navLinks = [
  { href: "/courses", label: "Courses" },
  { href: "/find-tutor", label: "Find Tutor" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#for-teachers", label: "For teachers" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 md:px-8">
        <div className="flex items-center gap-10">
          <Link href="/" className="group flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-xl bg-linear-to-br from-primary to-violet-500 text-primary-foreground shadow-sm shadow-primary/30 transition-transform duration-200 group-hover:scale-105">
              <GraduationCap className="size-4" aria-hidden />
            </span>
            <span className="font-heading text-lg font-semibold tracking-tight">Amazing Skills</span>
          </Link>
          <nav className="hidden items-center gap-6 md:flex" aria-label="Main">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <nav className="flex items-center gap-3" aria-label="Account">
          <Button variant="ghost" render={<Link href="/login" />}>
            Sign in
          </Button>
          <Button render={<Link href="/register" />}>Get started</Button>
        </nav>
      </div>
    </header>
  );
}
