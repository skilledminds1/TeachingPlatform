"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { escalateRefundRequest, requestBookingRefund } from "@/actions/refunds";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge, statusTone } from "@/features/admin/components/status-badge";
import { formatCurrency, formatStatus } from "@/lib/format";

type RefundSummary = {
  id: string;
  status: string;
  requestedAmountCents: number;
  currency: string;
  reason: string;
  policyEligible: boolean;
  teacherResponse: string | null;
  providerRefundId: string | null;
};

export function RefundRequestPanel({
  targetId,
  request,
}: {
  targetId: string;
  request: RefundSummary | null;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  if (request) {
    return (
      <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">Refund request</p>
            <p className="text-sm text-muted-foreground">
              {formatCurrency(request.requestedAmountCents, request.currency)}
            </p>
          </div>
          <StatusBadge tone={statusTone(request.status)}>
            {formatStatus(request.status)}
          </StatusBadge>
        </div>
        <div className="rounded-lg bg-muted/50 p-4 text-sm">
          <p className="font-medium">Your reason</p>
          <p className="mt-1 text-muted-foreground">{request.reason}</p>
        </div>
        {request.teacherResponse ? (
          <div className="rounded-lg bg-muted/50 p-4 text-sm">
            <p className="font-medium">Teacher response</p>
            <p className="mt-1 text-muted-foreground">{request.teacherResponse}</p>
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {request.policyEligible
            ? "This request falls within the published refund policy."
            : "This request falls outside the standard policy and is at the teacher’s discretion."}
          {" "}The teacher is responsible for issuing any refund directly. Amazing Skills does
          not receive or hold these funds.
        </p>
        {request.providerRefundId ? (
          <p className="text-xs text-muted-foreground">
            Teacher refund reference: {request.providerRefundId}
          </p>
        ) : null}
        {request.status === "teacher_declined" ? (
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() => {
              startTransition(async () => {
                const result = await escalateRefundRequest({ refundRequestId: request.id });
                if (!result.success) {
                  toast.error(result.error);
                  return;
                }
                toast.success("Refund request sent to Amazing Skills for mediation.");
                router.refresh();
              });
            }}
          >
            {isPending ? "Escalating…" : "Request admin mediation"}
          </Button>
        ) : null}
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div>
        <p className="font-medium">Request a refund from the teacher</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Explain your request clearly. The teacher receives the payment directly and is
          responsible for deciding and issuing the refund.
        </p>
      </div>
      <Textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        minLength={20}
        maxLength={2_000}
        rows={4}
        placeholder="Describe why you are requesting a refund…"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-xs text-muted-foreground">
          Amazing Skills can mediate a disagreement and take action against a teacher account,
          but cannot issue or guarantee a refund.
        </p>
        <Button
          variant="outline"
          disabled={isPending || reason.trim().length < 20}
          onClick={() => {
            startTransition(async () => {
              const result = await requestBookingRefund({ targetId, reason });
              if (!result.success) {
                toast.error(result.error);
                return;
              }
              toast.success("Refund request sent to the teacher.");
              setReason("");
              router.refresh();
            });
          }}
        >
          {isPending ? "Sending…" : "Send refund request"}
        </Button>
      </div>
    </section>
  );
}
