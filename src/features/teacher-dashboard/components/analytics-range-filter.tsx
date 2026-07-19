"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  ANALYTICS_RANGES,
  analyticsRangeLabel,
  type AnalyticsRange,
} from "@/features/teacher-dashboard/lib/analytics-range";
import { cn } from "@/lib/utils";

export function AnalyticsRangeFilter({ range }: { range: AnalyticsRange }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Analytics date range">
      {ANALYTICS_RANGES.map((value) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("range", value);
        const href = `${pathname}?${params.toString()}`;
        const active = range === value;

        return (
          <Button
            key={value}
            size="sm"
            variant={active ? "default" : "outline"}
            className={cn(!active && "bg-background")}
            render={<Link href={href} replace scroll={false} />}
            aria-current={active ? "page" : undefined}
          >
            {analyticsRangeLabel(value)}
          </Button>
        );
      })}
    </div>
  );
}
