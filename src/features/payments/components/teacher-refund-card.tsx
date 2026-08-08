"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { TransitionStartFunction } from "react";
import { toast } from "sonner";

import { markRefundSent, respondToRefundRequest } from "@/actions/refunds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge, statusTone } from "@/features/admin/components/status-badge";
import { formatCurrency, formatStatus } from "@/lib/format";

export function TeacherRefundCard({
  request,
}: {
  request: {
    id: string;
    status: string;
    requestedAmountCents: number;
    currency: string;
    reason: string;
    policyEligible: boolean;
    teacherResponse: string | null;
    providerRefundId: string | null;
    studentName: string;
    targetLabel: string;
    moderationCaseId: string | null;
  };
}) {
  const router = useRouter();
  const [response, setResponse] = useState(request.teacherResponse ?? "");
  const [reference, setReference] = useState(request.providerRefundId ?? "");
  const [isPending, startTransition] = useTransition();

  return (
    <article className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">{request.targetLabel}</p>
          <p className="text-sm text-muted-foreground">
            {request.studentName} · {formatCurrency(request.requestedAmountCents, request.currency)}
          </p>
        </div>
        <StatusBadge tone={statusTone(request.status)}>
          {formatStatus(request.status)}
        </StatusBadge>
      </div>

      <div className="rounded-lg bg-muted/50 p-4 text-sm">
        <p className="font-medium">Student’s reason</p>
        <p className="mt-1 text-muted-foreground">{request.reason}</p>
      </div>

      <p className="text-xs text-muted-foreground">
        {request.policyEligible
          ? "This request falls within the published refund policy."
          : "This request falls outside the standard policy and is at your discretion."}
        {" "}You received the payment directly and are responsible for issuing any refund.
      </p>

      {request.moderationCaseId ? (
        <Button variant="outline" render={<Link href={`/dashboard/cases/${request.moderationCaseId}`} />}>
          Open shared mediation
        </Button>
      ) : null}

      {["requested", "escalated"].includes(request.status) ? (
        <div className="space-y-3">
          <Textarea
            value={response}
            onChange={(event) => setResponse(event.target.value)}
            minLength={10}
            maxLength={2_000}
            rows={3}
            placeholder="Explain your decision to the student…"
          />
          <div className="flex flex-wrap gap-2">
            <DecisionButton
              decision="approve"
              label="Approve request"
              requestId={request.id}
              response={response}
              disabled={isPending || response.trim().length < 10}
              run={startTransition}
              onComplete={() => router.refresh()}
            />
            <DecisionButton
              decision="decline"
              label="Decline with reason"
              requestId={request.id}
              response={response}
              disabled={isPending || response.trim().length < 10}
              run={startTransition}
              onComplete={() => router.refresh()}
              variant="outline"
            />
          </div>
        </div>
      ) : null}

      {request.status === "teacher_approved" ? (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <div>
            <p className="text-sm font-medium">Confirm the refund after sending it</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Issue the refund from your payment account, then enter the provider reference. This
              records your confirmation; Amazing Skills does not move the funds.
            </p>
          </div>
          <Input
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="Reference from wherever you sent the refund"
          />
          <Button
            disabled={isPending || reference.trim().length < 3}
            onClick={() => {
              startTransition(async () => {
                const result = await markRefundSent({
                  refundRequestId: request.id,
                  providerReference: reference,
                });
                if (!result.success) {
                  toast.error(result.error);
                  return;
                }
                toast.success("Refund marked as sent.");
                router.refresh();
              });
            }}
          >
            {isPending ? "Saving…" : "Mark refund as sent"}
          </Button>
        </div>
      ) : null}

      {request.providerRefundId ? (
        <p className="text-xs text-muted-foreground">
          Refund reference: {request.providerRefundId}
        </p>
      ) : null}
    </article>
  );
}

function DecisionButton({
  decision,
  label,
  requestId,
  response,
  disabled,
  run,
  onComplete,
  variant,
}: {
  decision: "approve" | "decline";
  label: string;
  requestId: string;
  response: string;
  disabled: boolean;
  run: TransitionStartFunction;
  onComplete: () => void;
  variant?: "outline";
}) {
  return (
    <Button
      variant={variant}
      disabled={disabled}
      onClick={() => {
        run(async () => {
          const result = await respondToRefundRequest({
            refundRequestId: requestId,
            decision,
            response,
          });
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          toast.success(decision === "approve" ? "Refund request approved." : "Response sent.");
          onComplete();
        });
      }}
    >
      {label}
    </Button>
  );
}
