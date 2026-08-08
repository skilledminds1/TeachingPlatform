import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { LanguageSwitcher } from "@/features/i18n/components/language-switcher";

const footerColumns = [
  {
    key: 'platform',
    links: [
      { href: '/find-tutor', key: 'findTutors' },
      { href: '/register?role=teacher', key: 'becomeTeacher' },
      { href: '/#pricing', key: 'pricing' },
      { href: '/#faq', key: 'faq' },
    ],
  },
  {
    key: 'account',
    links: [
      { href: '/login', key: 'signIn' },
      { href: '/register', key: 'createAccount' },
      { href: '/forgot-password', key: 'resetPassword' },
    ],
  },
  {
    key: 'legal',
    links: [
      { href: '/terms', key: 'terms' },
      { href: '/privacy', key: 'privacy' },
      { href: '/refund-policy', key: 'refundPolicy' },
      { href: '/teacher-agreement', key: 'teacherAgreement' },
      // GLO-03: discoverable from every page, which is where someone blocked by a barrier
      // will look for it.
      { href: '/accessibility', key: 'accessibility' },
    ],
  },
] as const;

export async function SiteFooter() {
  const t = await getTranslations("footer");

  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-6 py-12 md:px-8 md:py-16">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="space-y-3">
            <p className="text-lg font-semibold tracking-tight">Amazing Skills</p>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              The online tutoring platform connecting students with expert teachers for live
              1-on-1 video lessons.
            </p>
            {/*
              GLO-01: in the footer because it is on every page and it is where people look
              for it. A visitor who landed on the wrong language should not have to read that
              language to escape it — the options are written in their own scripts.
            */}
            <LanguageSwitcher className="inline-block pt-1" />
          </div>
          {footerColumns.map((column) => (
            <nav key={column.key} aria-label={t(column.key)} className="space-y-3">
              <p className="text-sm font-semibold">{t(column.key)}</p>
              <ul className="space-y-2">
                {column.links.map((link) => (
                  <li key={link.key}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
                    >
                      {t(link.key)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-12 border-t border-border/60 pt-6">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Amazing Skills. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
