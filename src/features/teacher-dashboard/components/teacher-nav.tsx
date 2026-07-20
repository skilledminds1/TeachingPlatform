"use client";

import { GraduationCap } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { signOut } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard/teacher", label: "Home", exact: true },
  { href: "/dashboard/teacher/analytics", label: "Analytics" },
  { href: "/dashboard/messages", label: "Messages" },
  { href: "/dashboard/teacher/bookings", label: "Calendar" },
  { href: "/dashboard/teacher/students", label: "Students" },
  { href: "/dashboard/teacher/refunds", label: "Refunds" },
  { href: "/dashboard/cases", label: "Cases" },
  { href: "/dashboard/safety", label: "Safety" },
  { href: "/dashboard/classroom", label: "Classroom" },
  { href: "/dashboard/teacher/courses", label: "My Courses" },
  { href: "/dashboard/teacher/profile", label: "My profile" },
  { href: "/dashboard/teacher/settings", label: "Settings" },
] as const;

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TeacherNav({ notificationSlot }: { notificationSlot: ReactNode }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="size-4" aria-hidden />
          </span>
          <span className="hidden sm:inline">Amazing Skills</span>
        </Link>

        <nav aria-label="Teacher navigation" className="min-w-0 flex-1">
          <ul className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {items.map((item) => {
              const exact = "exact" in item && item.exact;
              const active = isActive(pathname, item.href, exact);

              return (
                <li key={item.href} className="shrink-0">
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {notificationSlot}
          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
