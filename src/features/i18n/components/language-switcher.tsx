"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { setLocale } from "@/actions/locale";
import { LOCALES } from "@/i18n/locales";

/**
 * Language switcher (GLO-01).
 *
 * A native `<select>` rather than a styled dropdown, on purpose. It is keyboard operable,
 * screen-reader labelled and touch-friendly for free, and on mobile it opens the platform's
 * own picker — which is exactly what someone who cannot read the current language needs.
 * Building a custom listbox here would mean reimplementing all of that (GLO-03).
 *
 * Each option is written in its own language. A visitor who has landed on the wrong locale
 * cannot read "Spanish", but they can find "Español".
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const current = useLocale();
  const t = useTranslations("language");
  const [isPending, startTransition] = useTransition();

  return (
    <label className={className}>
      <span className="sr-only">{t("change")}</span>
      <select
        value={current}
        disabled={isPending}
        onChange={(event) => {
          const next = event.target.value;
          startTransition(async () => {
            await setLocale(next);
          });
        }}
        className="rounded-md border border-input bg-background px-2 py-1 text-sm disabled:opacity-60"
      >
        {LOCALES.map((locale) => (
          <option key={locale.code} value={locale.code} lang={locale.code}>
            {locale.nativeName}
          </option>
        ))}
      </select>
    </label>
  );
}
