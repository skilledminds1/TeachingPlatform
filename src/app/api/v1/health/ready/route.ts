import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { isAuthorizedBearer } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.HEALTH_SECRET ?? process.env.CRON_SECRET;
  if (!isAuthorizedBearer(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dependencies = {
    database: false,
    supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    redis: Boolean(
      process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
    ),
    sentry: Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
  };
  try {
    await db.$queryRaw`SELECT 1`;
    dependencies.database = true;
  } catch {
    return NextResponse.json(
      { ok: false, service: "amazing-skills", dependencies },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, service: "amazing-skills", dependencies });
}
