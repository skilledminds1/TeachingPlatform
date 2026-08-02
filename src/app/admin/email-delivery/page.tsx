import type { Metadata } from "next";

import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/server/auth/session";

export const metadata: Metadata = { title: "Email delivery" };

export default async function EmailDeliveryPage() {
  await requirePlatformAdmin();
  const deliveries = await db.emailOutbox.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      recipient: true,
      subject: true,
      category: true,
      status: true,
      attempts: true,
      lastError: true,
      sentAt: true,
      createdAt: true,
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">Email delivery</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Recent queued, delivered, retried, and terminally failed messages.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[800px] text-start text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Recipient</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Attempts</th>
              <th className="px-4 py-3">Last error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {deliveries.map((delivery) => (
              <tr key={delivery.id}>
                <td className="whitespace-nowrap px-4 py-3">
                  {delivery.createdAt.toLocaleString()}
                </td>
                <td className="px-4 py-3">{delivery.recipient}</td>
                <td className="max-w-xs truncate px-4 py-3">{delivery.subject}</td>
                <td className="px-4 py-3">{delivery.category}</td>
                <td className="px-4 py-3 font-medium">{delivery.status}</td>
                <td className="px-4 py-3">{delivery.attempts}</td>
                <td className="max-w-sm truncate px-4 py-3 text-muted-foreground">
                  {delivery.lastError ?? "—"}
                </td>
              </tr>
            ))}
            {!deliveries.length ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  No email deliveries yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
