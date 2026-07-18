import Link from "next/link";

const footerColumns = [
  {
    heading: "Platform",
    links: [
      { href: "/teachers", label: "Find tutors" },
      { href: "/register?role=teacher", label: "Become a teacher" },
      { href: "/#pricing", label: "Pricing" },
      { href: "/#faq", label: "FAQ" },
    ],
  },
  {
    heading: "Account",
    links: [
      { href: "/login", label: "Sign in" },
      { href: "/register", label: "Create account" },
      { href: "/forgot-password", label: "Reset password" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-6 py-12 md:px-8 md:py-16">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr]">
          <div className="space-y-3">
            <p className="text-lg font-semibold tracking-tight">TeachingPlatform</p>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              The online tutoring marketplace connecting students with expert teachers for live
              video lessons.
            </p>
          </div>
          {footerColumns.map((column) => (
            <nav key={column.heading} aria-label={column.heading} className="space-y-3">
              <p className="text-sm font-semibold">{column.heading}</p>
              <ul className="space-y-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-12 border-t border-border/60 pt-6">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} TeachingPlatform. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
