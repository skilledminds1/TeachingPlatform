"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const selectClassName =
  "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none [&>option]:bg-background";

const levelOptions = [
  { value: "", label: "Any level" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "all_levels", label: "All levels" },
];

const maxPriceOptions = [
  { value: "", label: "Any price" },
  { value: "2500", label: "Up to $25" },
  { value: "5000", label: "Up to $50" },
  { value: "10000", label: "Up to $100" },
  { value: "20000", label: "Up to $200" },
];

const sortOptions = [
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Most popular" },
  { value: "rating", label: "Highest rated" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

export function CourseFilters({
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

  const hasFilters = ["q", "subject", "level", "maxPrice", "minRating", "sort"].some((key) =>
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
          placeholder="Search courses by title, teacher, or keyword…"
          className="pl-9"
          aria-label="Search courses"
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

        <select
          className={selectClassName}
          value={searchParams.get("minRating") ?? ""}
          onChange={(event) => applyParam("minRating", event.target.value)}
          aria-label="Filter by course rating"
        >
          <option value="">Any rating</option>
          <option value="4">4+ stars</option>
          <option value="3">3+ stars</option>
        </select>

        <select
          className={selectClassName}
          value={searchParams.get("level") ?? ""}
          onChange={(event) => applyParam("level", event.target.value)}
          aria-label="Filter by level"
        >
          {levelOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          className={selectClassName}
          value={searchParams.get("maxPrice") ?? ""}
          onChange={(event) => applyParam("maxPrice", event.target.value)}
          aria-label="Filter by price"
        >
          {maxPriceOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          className={selectClassName}
          value={searchParams.get("sort") ?? "newest"}
          onChange={(event) => applyParam("sort", event.target.value)}
          aria-label="Sort courses"
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
