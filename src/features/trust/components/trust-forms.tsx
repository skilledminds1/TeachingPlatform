"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  addCaseNote,
  blockUser,
  createSafetyReport,
  issueSanction,
  reviewAppeal,
  reviewSafetyReport,
  sendCaseMessage,
  submitAppeal,
  submitPrivacyRequest,
  unblockUser,
  updateModerationCase,
  updatePrivacyRequest,
} from "@/actions/trust";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Feedback = { tone: "error" | "success"; text: string } | null;

function FeedbackMessage({ value }: { value: Feedback }) {
  if (!value) return null;
  return (
    <p className={value.tone === "error" ? "text-sm text-destructive" : "text-sm text-emerald-700"}>
      {value.text}
    </p>
  );
}

export function SafetyReportForm({ subjectId }: { subjectId?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        start(async () => {
          const result = await createSafetyReport({
            subjectId,
            category: data.get("category"),
            description: data.get("description"),
          });
          setFeedback(result.success
            ? { tone: "success", text: "Report submitted. Our trust team will review it." }
            : { tone: "error", text: result.error });
          if (result.success) {
            form.reset();
            router.refresh();
          }
        });
      }}
    >
      <Select name="category" aria-label="Report category" defaultValue="unsafe_conduct">
        <option value="harassment">Harassment</option>
        <option value="fraud">Fraud or misrepresentation</option>
        <option value="unsafe_conduct">Unsafe conduct</option>
        <option value="privacy">Privacy concern</option>
        <option value="other">Other</option>
      </Select>
      <Textarea
        name="description"
        required
        minLength={20}
        maxLength={4000}
        placeholder="Describe what happened, when it happened, and any relevant booking or course."
      />
      <FeedbackMessage value={feedback} />
      <Button type="submit" disabled={pending}>{pending ? "Submitting…" : "Submit report"}</Button>
    </form>
  );
}

export function BlockUserButton({
  userId,
  blocked = false,
}: {
  userId: string;
  blocked?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  return (
    <div className="space-y-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => start(async () => {
          const result = blocked ? await unblockUser({ userId }) : await blockUser({ userId });
          setFeedback(result.success
            ? { tone: "success", text: blocked ? "User unblocked." : "User blocked." }
            : { tone: "error", text: result.error });
          if (result.success) router.refresh();
        })}
      >
        {pending ? "Saving…" : blocked ? "Unblock" : "Block user"}
      </Button>
      <FeedbackMessage value={feedback} />
    </div>
  );
}

export function SafetyReportReviewForm({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  return (
    <form
      className="mt-3 grid gap-2 sm:grid-cols-[180px_1fr_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        start(async () => {
          const result = await reviewSafetyReport({
            reportId,
            status: data.get("status"),
            resolution: data.get("resolution") || undefined,
          });
          setFeedback(result.success ? { tone: "success", text: "Report updated and audited." } : { tone: "error", text: result.error });
          if (result.success) router.refresh();
        });
      }}
    >
      <Select name="status" defaultValue="investigating">
        <option value="triaged">Triaged</option>
        <option value="investigating">Investigating</option>
        <option value="resolved">Resolved</option>
        <option value="dismissed">Dismissed</option>
      </Select>
      <Input name="resolution" maxLength={4000} placeholder="Resolution required to close" />
      <Button type="submit" size="sm" disabled={pending}>Save</Button>
      <div className="sm:col-span-3"><FeedbackMessage value={feedback} /></div>
    </form>
  );
}

export function CaseMessageForm({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const body = new FormData(form).get("body");
        start(async () => {
          const result = await sendCaseMessage({ caseId, body });
          setFeedback(result.success ? null : { tone: "error", text: result.error });
          if (result.success) {
            form.reset();
            router.refresh();
          }
        });
      }}
    >
      <Textarea name="body" required maxLength={4000} placeholder="Write to everyone in this case…" />
      <FeedbackMessage value={feedback} />
      <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send to case"}</Button>
    </form>
  );
}

export function PrivateCaseNoteForm({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const body = new FormData(form).get("body");
        start(async () => {
          const result = await addCaseNote({ caseId, body });
          setFeedback(result.success ? null : { tone: "error", text: result.error });
          if (result.success) {
            form.reset();
            router.refresh();
          }
        });
      }}
    >
      <Textarea name="body" required minLength={20} maxLength={4000} placeholder="Private admin note…" />
      <p className="text-xs text-muted-foreground">Only platform admins can see private notes.</p>
      <FeedbackMessage value={feedback} />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Add private note"}
      </Button>
    </form>
  );
}

export function AdminCaseControls({
  caseId,
  subjectId,
  initialStatus,
  initialPriority,
  initialAssignee,
  admins,
}: {
  caseId: string;
  subjectId?: string | null;
  initialStatus: string;
  initialPriority: string;
  initialAssignee?: string | null;
  admins: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  return (
    <div className="space-y-6">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          start(async () => {
            const assigned = String(data.get("assignedAdminId") ?? "");
            const result = await updateModerationCase({
              caseId,
              status: data.get("status"),
              priority: data.get("priority"),
              assignedAdminId: assigned || null,
              resolution: data.get("resolution") || undefined,
            });
            setFeedback(result.success
              ? { tone: "success", text: "Case updated and audited." }
              : { tone: "error", text: result.error });
            if (result.success) router.refresh();
          });
        }}
      >
        <h3 className="font-semibold">Case management</h3>
        <Select name="status" defaultValue={initialStatus}>
          {["open", "under_review", "awaiting_response", "resolved", "closed"].map((value) => (
            <option key={value} value={value}>{value.replaceAll("_", " ")}</option>
          ))}
        </Select>
        <Select name="priority" defaultValue={initialPriority}>
          {["low", "normal", "high", "urgent"].map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </Select>
        <Select name="assignedAdminId" defaultValue={initialAssignee ?? ""}>
          <option value="">Unassigned</option>
          {admins.map((admin) => <option key={admin.id} value={admin.id}>{admin.name}</option>)}
        </Select>
        <Textarea name="resolution" maxLength={4000} placeholder="Required when resolving or closing" />
        <FeedbackMessage value={feedback} />
        <Button type="submit" disabled={pending}>Update case</Button>
      </form>

      {subjectId ? (
        <form
          className="space-y-3 border-t border-border pt-5"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const scopes = data.getAll("scopes").map(String);
            start(async () => {
              const result = await issueSanction({
                caseId,
                userId: subjectId,
                type: data.get("type"),
                scopes,
                reason: data.get("reason"),
                evidence: data.get("evidence") || undefined,
                endsAt: data.get("endsAt") ? new Date(String(data.get("endsAt"))).toISOString() : undefined,
              });
              setFeedback(result.success
                ? { tone: "success", text: "Sanction applied and audited. It can be appealed." }
                : { tone: "error", text: result.error });
              if (result.success) router.refresh();
            });
          }}
        >
          <h3 className="font-semibold">Teacher enforcement</h3>
          <Select name="type" defaultValue="warning">
            <option value="warning">Warning</option>
            <option value="restriction">Scoped restriction</option>
            <option value="suspension">Suspend account</option>
            <option value="delist">Delist teacher</option>
            <option value="removal">Remove account</option>
          </Select>
          <fieldset className="grid grid-cols-2 gap-2 text-sm">
            <legend className="col-span-2 text-xs text-muted-foreground">Restriction scopes</legend>
            {["messaging", "booking", "selling", "publishing"].map((scope) => (
              <label key={scope} className="flex items-center gap-2">
                <input type="checkbox" name="scopes" value={scope} /> {scope}
              </label>
            ))}
          </fieldset>
          <Input name="endsAt" type="datetime-local" aria-label="Restriction end date" />
          <Textarea name="reason" required minLength={20} maxLength={4000} placeholder="Reason shown to the teacher" />
          <Textarea name="evidence" maxLength={4000} placeholder="Evidence references and review findings" />
          <p className="text-xs text-muted-foreground">
            These controls never move, capture, or refund teacher funds.
          </p>
          <Button type="submit" variant="destructive" disabled={pending}>Apply sanction</Button>
        </form>
      ) : null}
    </div>
  );
}

export function AppealForm({ sanctionId }: { sanctionId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        start(async () => {
          const result = await submitAppeal({
            sanctionId,
            reason: data.get("reason"),
            evidence: data.get("evidence") || undefined,
          });
          setFeedback(result.success
            ? { tone: "success", text: "Appeal submitted for independent admin review." }
            : { tone: "error", text: result.error });
          if (result.success) router.refresh();
        });
      }}
    >
      <Textarea name="reason" required minLength={20} maxLength={4000} placeholder="Explain why this action should be changed…" />
      <Input name="evidence" maxLength={4000} placeholder="Optional evidence references" />
      <FeedbackMessage value={feedback} />
      <Button type="submit" variant="outline" disabled={pending}>Submit appeal</Button>
    </form>
  );
}

export function AppealReviewForm({ appealId }: { appealId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        start(async () => {
          const result = await reviewAppeal({
            appealId,
            status: data.get("status"),
            decision: data.get("decision"),
          });
          setFeedback(result.success ? { tone: "success", text: "Appeal decided and audited." } : { tone: "error", text: result.error });
          if (result.success) router.refresh();
        });
      }}
    >
      <Select name="status" defaultValue="upheld">
        <option value="upheld">Uphold</option>
        <option value="overturned">Overturn</option>
      </Select>
      <Textarea name="decision" required minLength={20} maxLength={4000} placeholder="Reasoned decision…" />
      <FeedbackMessage value={feedback} />
      <Button type="submit" disabled={pending}>Record decision</Button>
    </form>
  );
}

export function PrivacyRequestForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        start(async () => {
          const result = await submitPrivacyRequest({ type: data.get("type"), details: data.get("details") || undefined });
          setFeedback(result.success
            ? { tone: "success", text: "Privacy request submitted." }
            : { tone: "error", text: result.error });
          if (result.success) {
            form.reset();
            router.refresh();
          }
        });
      }}
    >
      <Select name="type" defaultValue="export">
        <option value="export">Access / export my data</option>
        <option value="deletion">Delete my account data</option>
        <option value="correction">Correct my data</option>
        <option value="objection">Object to processing</option>
      </Select>
      <Textarea name="details" maxLength={4000} placeholder="Describe the data or processing involved (optional)." />
      <p className="text-xs text-muted-foreground">
        Required payment, legal acceptance, audit, and safety records may be retained under applicable law.
      </p>
      <FeedbackMessage value={feedback} />
      <Button type="submit" disabled={pending}>Submit privacy request</Button>
    </form>
  );
}

export function PrivacyAdminForm({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        start(async () => {
          const result = await updatePrivacyRequest({
            requestId,
            status: data.get("status"),
            response: data.get("response"),
          });
          setFeedback(result.success ? { tone: "success", text: "Request updated and audited." } : { tone: "error", text: result.error });
          if (result.success) router.refresh();
        });
      }}
    >
      <Select name="status" defaultValue="in_progress">
        <option value="verifying">Verifying identity</option>
        <option value="in_progress">In progress</option>
        <option value="completed">Completed</option>
        <option value="denied">Denied</option>
        <option value="cancelled">Cancelled</option>
      </Select>
      <Textarea name="response" required minLength={10} maxLength={4000} placeholder="Response and retention explanation…" />
      <FeedbackMessage value={feedback} />
      <Button type="submit" size="sm" disabled={pending}>Save</Button>
    </form>
  );
}
