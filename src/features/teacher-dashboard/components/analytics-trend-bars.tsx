import { formatCurrency, formatNumber } from "@/lib/format";

export function AnalyticsTrendBars({
  points,
  metric,
  currency,
}: {
  points: Array<{
    key: string;
    label: string;
    enrollments: number;
    completedLessons: number;
    netCents: number;
  }>;
  metric: "netCents" | "enrollments" | "completedLessons";
  currency: string;
}) {
  const max = Math.max(1, ...points.map((point) => point[metric]));
  const dense = points.length > 40;

  if (points.length === 0 || points.every((point) => point[metric] === 0)) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No activity in this period yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div
        className="flex h-40 items-end gap-1 sm:gap-1.5"
        role="img"
        aria-label={`Trend for ${metric === "netCents" ? "net collected" : metric}`}
      >
        {points.map((point) => {
          const value = point[metric];
          const height = Math.max(value > 0 ? 8 : 2, Math.round((value / max) * 100));
          const valueLabel =
            metric === "netCents"
              ? formatCurrency(value, currency)
              : formatNumber(value);

          return (
            <div key={point.key} className="group relative flex min-w-0 flex-1 flex-col justify-end">
              <div
                className="w-full rounded-t-sm bg-primary/80 transition-colors group-hover:bg-primary"
                style={{ height: `${height}%` }}
                title={`${point.label}: ${valueLabel}`}
              />
              <span className="sr-only">
                {point.label}: {valueLabel}
              </span>
            </div>
          );
        })}
      </div>
      {!dense ? (
        <div className="flex justify-between gap-2 text-[10px] text-muted-foreground sm:text-xs">
          <span>{points[0]?.label}</span>
          <span>{points[points.length - 1]?.label}</span>
        </div>
      ) : (
        <div className="flex justify-between gap-2 text-xs text-muted-foreground">
          <span>{points[0]?.label}</span>
          <span>{points[Math.floor(points.length / 2)]?.label}</span>
          <span>{points[points.length - 1]?.label}</span>
        </div>
      )}
    </div>
  );
}
