"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { teachingLanguageOptions } from "@/lib/languages";
import { formatCurrency } from "@/lib/format";
import { useTranslations } from "next-intl";

const selectClassName =
  "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none [&>option]:bg-background";

const languageOptions = teachingLanguageOptions();

/** Values are URL parameters — never translated. Cents are formatted per locale at render. */
const maxRateOptions: Array<{ value: string; cents?: number }> = [
  { value: "" },
  { value: "500", cents: 500 },
  { value: "1000", cents: 1000 },
  { value: "2000", cents: 2000 },
  { value: "5000", cents: 5000 },
  { value: "10000", cents: 10000 },
  { value: "15000", cents: 15000 },
  { value: "25000", cents: 25000 },
];

const ratingOptions: Array<{ value: string; stars?: number }> = [
  { value: "" },
  { value: "3", stars: 3 },
  { value: "4", stars: 4 },
  { value: "5", stars: 5 },
];

const sortOptions = [
  { value: "recommended", key: "sortRecommended" },
  { value: "rating", key: "sortRating" },
  { value: "price_asc", key: "sortPriceAsc" },
  { value: "price_desc", key: "sortPriceDesc" },
  { value: "newest", key: "sortNewest" },
] as const;

export function TeacherFilters({
  subjects,
}: {
  subjects: Array<{ slug: string; name: string }>;
}) {
  const t = useTranslations("filters");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const urlQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(urlQuery);
  const [previousUrlQuery, setPreviousUrlQuery] = useState(urlQuery);
  if (urlQuery !== previousUrlQuery) {
    setPreviousUrlQuery(urlQuery);
    setQuery(urlQuery);
  }

  function applyParam(key: string, value: string): void {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  const hasFilters = ["q", "subject", "language", "maxRate", "minRating", "sort"].some((key) =>
    searchParams.get(key),
  );

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <form
        className="relative"
        onSubmit={(event) => {
          event.preventDefault();
          applyParam("q", query.trim());
        }}
      >
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          className="ps-9"
          aria-label={t("searchLabel")}
        />
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className={selectClassName}
          value={searchParams.get("subject") ?? ""}
          onChange={(event) => applyParam("subject", event.target.value)}
          aria-label={t("subjectLabel")}
        >
          <option value="">{t("allSubjects")}</option>
          {subjects.map((subject) => (
            <option key={subject.slug} value={subject.slug}>
              {subject.name}
            </option>
          ))}
        </select>

        {/* INT-10: for an international marketplace this is the filter students reach for
            first — it decides whether a lesson is possible at all. */}
        <select
          className={selectClassName}
          value={searchParams.get("language") ?? ""}
          onChange={(event) => applyParam("language", event.target.value)}
          aria-label={t("languageLabel")}
        >
          <option value="">{t("anyLanguage")}</option>
          {languageOptions.map((option) => (
            <option key={option.code} value={option.code}>
              {option.name}
            </option>
          ))}
        </select>

        <select
          className={selectClassName}
          value={searchParams.get("maxRate") ?? ""}
          onChange={(event) => applyParam("maxRate", event.target.value)}
          aria-label={t("rateLabel")}
        >
          {maxRateOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.cents === undefined
                ? t("anyRate")
                : t("maxRate", { amount: formatCurrency(option.cents, "USD") })}
            </option>
          ))}
        </select>

        <select
          className={selectClassName}
          value={searchParams.get("minRating") ?? ""}
          onChange={(event) => applyParam("minRating", event.target.value)}
          aria-label={t("ratingLabel")}
        >
          {ratingOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.stars === undefined
                ? t("anyRating")
                : option.stars === 5
                  ? t("fiveStarsOnly")
                  : t("ratingAndUp", { stars: option.stars })}
            </option>
          ))}
        </select>

        <select
          className={selectClassName}
          value={searchParams.get("sort") ?? "recommended"}
          onChange={(event) => applyParam("sort", event.target.value)}
          aria-label={t("sortLabel")}
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.key)}
            </option>
          ))}
        </select>

        {hasFilters ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setQuery("");
              startTransition(() => {
                router.replace(pathname, { scroll: false });
              });
            }}
          >
            <X className="size-3.5" aria-hidden />
            {t("clear")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
