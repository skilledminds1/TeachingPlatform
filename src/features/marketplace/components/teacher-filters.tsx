"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { teachingLanguageOptions } from "@/lib/languages";

const selectClassName =
  "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none [&>option]:bg-background";

const languageOptions = teachingLanguageOptions();

const maxRateOptions = [
  { value: "", label: "Any rate" },
  { value: "500", label: "Up to $5/hour" },
  { value: "1000", label: "Up to $10/hour" },
  { value: "2000", label: "Up to $20/hour" },
  { value: "5000", label: "Up to $50/hour" },
  { value: "10000", label: "Up to $100/hour" },
  { value: "15000", label: "Up to $150/hour" },
  { value: "25000", label: "Up to $250/hour" },
];

const ratingOptions = [
  { value: "", label: "Any rating" },
  { value: "3", label: "3 stars & up" },
  { value: "4", label: "4 stars & up" },
  { value: "5", label: "5 stars only" },
];

const sortOptions = [
  { value: "recommended", label: "Recommended" },
  { value: "rating", label: "Highest rated" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "newest", label: "Newest teachers" },
];

export function TeacherFilters({
  subjects,
}: {
  subjects: Array<{ slug: string; name: string }>;
}) {
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
          placeholder="Search by name, subject, or keyword…"
          className="pl-9"
          aria-label="Search teachers"
        />
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className={selectClassName}
          value={searchParams.get("subject") ?? ""}
          onChange={(event) => applyParam("subject", event.target.value)}
          aria-label="Filter by subject"
        >
          <option value="">All subjects</option>
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
          aria-label="Filter by teaching language"
        >
          <option value="">Any language</option>
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
          aria-label="Filter by hourly rate"
        >
          {maxRateOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          className={selectClassName}
          value={searchParams.get("minRating") ?? ""}
          onChange={(event) => applyParam("minRating", event.target.value)}
          aria-label="Filter by rating"
        >
          {ratingOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          className={selectClassName}
          value={searchParams.get("sort") ?? "recommended"}
          onChange={(event) => applyParam("sort", event.target.value)}
          aria-label="Sort teachers"
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
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
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}
