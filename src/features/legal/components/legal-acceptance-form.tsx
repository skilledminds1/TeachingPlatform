"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { acceptCurrentLegalDocuments } from "@/actions/legal";
import { Button } from "@/components/ui/button";
import type { RegisterRole } from "@/lib/validations/auth";

export function LegalAcceptanceForm({
  role,
  next,
}: {
  role: RegisterRole;
  next?: string;
}) {
  const router = useRouter();
  const [confirmedAdult, setConfirmedAdult] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [acceptedRefundPolicy, setAcceptedRefundPolicy] = useState(false);
  const [acceptedTeacherAgreement, setAcceptedTeacherAgreement] = useState(false);
  const [isPending, startTransition] = useTransition();
  const complete =
    confirmedAdult &&
    acceptedTerms &&
    acceptedPrivacy &&
    acceptedRefundPolicy &&
    (role !== "teacher" || acceptedTeacherAgreement);

  return (
    <div className="space-y-5">
      <AgreementRow
        checked={confirmedAdult}
        onChange={setConfirmedAdult}
        label="I confirm that I am at least 18 years old."
      />
      <AgreementRow
        checked={acceptedTerms}
        onChange={setAcceptedTerms}
        label={
          <>
            I accept the <LegalLink href="/terms">Terms of Service</LegalLink>.
          </>
        }
      />
      <AgreementRow
        checked={acceptedPrivacy}
        onChange={setAcceptedPrivacy}
        label={
          <>
            I acknowledge the <LegalLink href="/privacy">Privacy Policy</LegalLink>.
          </>
        }
      />
      <AgreementRow
        checked={acceptedRefundPolicy}
        onChange={setAcceptedRefundPolicy}
        label={
          <>
            I accept the{" "}
            <LegalLink href="/refund-policy">Refund and Direct Payment Policy</LegalLink>,
            including that teachers receive payments directly and are responsible for refunds.
          </>
        }
      />
      {role === "teacher" ? (
        <AgreementRow
          checked={acceptedTeacherAgreement}
          onChange={setAcceptedTeacherAgreement}
          label={
            <>
              I accept the{" "}
              <LegalLink href="/teacher-agreement">Teacher Agreement</LegalLink> and understand
              that I am the merchant of record for student payments.
            </>
          }
        />
      ) : null}

      <Button
        className="w-full"
        size="lg"
        disabled={!complete || isPending}
        onClick={() => {
          startTransition(async () => {
            const result = await acceptCurrentLegalDocuments({
              confirmedAdult,
              acceptedTerms,
              acceptedPrivacy,
              acceptedRefundPolicy,
              acceptedTeacherAgreement,
              next,
            });
            if (!result.success) {
              toast.error(result.error);
              return;
            }
            router.push(result.data.redirectTo);
            router.refresh();
          });
        }}
      >
        {isPending ? "Recording acceptance…" : "Accept agreements and continue"}
      </Button>
    </div>
  );
}

function AgreementRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4 text-sm leading-relaxed">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-primary"
      />
      <span>{label}</span>
    </label>
  );
}

function LegalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      target="_blank"
      className="font-medium text-primary underline-offset-4 hover:underline"
    >
      {children}
    </Link>
  );
}
