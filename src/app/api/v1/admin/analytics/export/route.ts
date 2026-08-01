import { parseAnalyticsRange } from "@/features/teacher-dashboard/lib/analytics-range";
import { recordAdminAccess } from "@/server/admin/audit";
import { requirePlatformAdmin } from "@/server/auth/session";
import {
  getPlatformAnalytics,
  platformAnalyticsCsv,
} from "@/server/admin/platform-analytics";

export async function GET(request: Request) {
  // getPlatformAnalytics already calls requirePlatformAdmin, but the admin identity is
  // needed here for the audit record, and asserting it at the boundary keeps the check
  // visible in the route itself.
  const admin = await requirePlatformAdmin();

  const url = new URL(request.url);
  const range = parseAnalyticsRange(url.searchParams.get("range"));
  const data = await getPlatformAnalytics(range);
  const csv = platformAnalyticsCsv(data);

  // SEC-13: this exports platform-wide payment and revenue data. No single subject, so the
  // record is filed against the platform with the admin as target.
  await recordAdminAccess({
    adminUserId: admin.id,
    action: "analytics.exported",
    targetType: "platform",
    targetId: admin.id,
    metadata: { range, rows: csv.split("\n").length - 1 },
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="platform-analytics-${range}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
