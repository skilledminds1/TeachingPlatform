export const ANALYTICS_RANGES = ["30d", "90d", "365d", "all"] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export function parseAnalyticsRange(value: unknown): AnalyticsRange {
  if (typeof value === "string" && (ANALYTICS_RANGES as readonly string[]).includes(value)) {
    return value as AnalyticsRange;
  }
  return "30d";
}

export function analyticsRangeLabel(range: AnalyticsRange): string {
  switch (range) {
    case "30d":
      return "Last 30 days";
    case "90d":
      return "Last 90 days";
    case "365d":
      return "Last 12 months";
    case "all":
      return "All time";
  }
}
