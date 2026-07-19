import { NextResponse } from "next/server";

import { expireAbandonedPayments } from "@/server/payments/confirm";

/** Cron-friendly expiry for unpaid lesson bookings. */
export async function POST() {
  const expired = await expireAbandonedPayments();
  return NextResponse.json({ expired });
}

export async function GET() {
  const expired = await expireAbandonedPayments();
  return NextResponse.json({ expired });
}
