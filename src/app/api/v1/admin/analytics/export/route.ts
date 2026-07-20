import { parseAnalyticsRange } from "@/features/teacher-dashboard/lib/analytics-range";
import {
  getPlatformAnalytics,
  platformAnalyticsCsv,
} from "@/server/admin/platform-analytics";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const range = parseAnalyticsRange(url.searchParams.get("range"));
  const data = await getPlatformAnalytics(range);
  const csv = platformAnalyticsCsv(data);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="platform-analytics-${range}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
