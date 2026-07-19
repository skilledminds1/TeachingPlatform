"use client";

import { Mail, Share2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ChangePasswordForm } from "@/features/auth/components/change-password-form";
import { cn } from "@/lib/utils";

const sections = [
  { id: "password", label: "Password" },
  { id: "notifications", label: "Notifications" },
  { id: "promotion", label: "Profile promotion" },
  { id: "permissions", label: "Permissions" },
  { id: "billing", label: "Plans & billing" },
  { id: "payments", label: "Student payments" },
  { id: "delete", label: "Delete account" },
] as const;

type SectionId = (typeof sections)[number]["id"];

function Toggle({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
        checked ? "border-foreground bg-foreground" : "border-border bg-muted",
      )}
    >
      <span
        className={cn(
          "pointer-events-none block size-5 rounded-full bg-background shadow-sm transition-transform",
          checked ? "translate-x-[1.375rem]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export function SettingsEditor({
  email,
  profileSlug,
  profilePublic,
  appOrigin,
}: {
  email: string;
  profileSlug: string | null;
  profilePublic: boolean;
  appOrigin: string;
}) {
  const [section, setSection] = useState<SectionId>("password");
  const [tipsEnabled, setTipsEnabled] = useState(false);
  const [surveysEnabled, setSurveysEnabled] = useState(false);
  const [transcriptionEnabled, setTranscriptionEnabled] = useState(true);
  const [improveEnabled, setImproveEnabled] = useState(true);
  const [deleteEmail, setDeleteEmail] = useState("");

  async function shareProfile(): Promise<void> {
    if (!profileSlug) {
      toast.error("Complete your profile before sharing it.");
      return;
    }
    const url = `${appOrigin}/find-tutor/${profileSlug}`;
    await navigator.clipboard.writeText(url);
    toast.success("Profile link copied to clipboard.");
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <nav aria-label="Settings sections">
        <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none] lg:flex-col lg:overflow-visible [&::-webkit-scrollbar]:hidden">
          {sections.map((item) => {
            const active = item.id === section;
            return (
              <li key={item.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setSection(item.id)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "relative w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  {active ? (
                    <span
                      aria-hidden
                      className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-primary lg:block"
                    />
                  ) : null}
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="min-w-0">
        {section === "password" ? (
          <div className="space-y-6">
            <h2 className="font-heading text-2xl font-semibold tracking-tight">
              Change Password
            </h2>
            <ChangePasswordForm />
          </div>
        ) : null}

        {section === "notifications" ? (
          <div className="space-y-6">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Mail className="size-4" aria-hidden />
              </span>
              <div>
                <h2 className="font-heading text-2xl font-semibold tracking-tight">
                  Email notifications
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Manage the emails you receive from us.
                </p>
              </div>
            </div>

            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              <li className="flex items-start justify-between gap-4 px-5 py-5">
                <div className="min-w-0">
                  <p className="font-medium">Transactional</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Important updates about your lessons and new messages.
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  Always active
                </span>
              </li>
              <li className="flex items-start justify-between gap-4 px-5 py-5">
                <div className="min-w-0">
                  <p className="font-medium">Tips and advice</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Get tips to grow your tutoring business.
                  </p>
                </div>
                <Toggle
                  checked={tipsEnabled}
                  onCheckedChange={setTipsEnabled}
                  label="Tips and advice"
                />
              </li>
              <li className="flex items-start justify-between gap-4 px-5 py-5">
                <div className="min-w-0">
                  <p className="font-medium">Surveys and interviews</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Take part in research studies to help us improve Amazing Skills.
                  </p>
                </div>
                <Toggle
                  checked={surveysEnabled}
                  onCheckedChange={setSurveysEnabled}
                  label="Surveys and interviews"
                />
              </li>
            </ul>

            <Button type="button" size="lg" className="w-full" disabled>
              Save changes
            </Button>
          </div>
        ) : null}

        {section === "promotion" ? (
          <div className="space-y-6">
            <div>
              <h2 className="font-heading text-2xl font-semibold tracking-tight">
                Profile promotion
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Share your public tutor profile so students can find and book you.
              </p>
            </div>

            <div className="space-y-4 rounded-xl border border-border bg-card p-5">
              <div>
                <p className="text-sm font-medium">Public profile link</p>
                <p className="mt-1 break-all text-sm text-muted-foreground">
                  {profileSlug
                    ? `${appOrigin}/find-tutor/${profileSlug}`
                    : "Your public profile will appear here once it is set up."}
                </p>
                {profileSlug && !profilePublic ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Your profile is not publicly listed yet. Finish approval to appear in Find
                    tutor.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-3">
                <Button type="button" onClick={() => void shareProfile()} disabled={!profileSlug}>
                  <Share2 className="size-4" aria-hidden />
                  Copy profile link
                </Button>
                {profileSlug ? (
                  <Button
                    variant="outline"
                    render={<Link href={`/find-tutor/${profileSlug}`} target="_blank" />}
                  >
                    View public profile
                  </Button>
                ) : (
                  <Button variant="outline" render={<Link href="/dashboard/teacher/profile" />}>
                    Complete profile
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {section === "permissions" ? (
          <div className="space-y-6">
            <h2 className="font-heading text-2xl font-semibold tracking-tight">Permissions</h2>

            <div className="space-y-1">
              <h3 className="text-sm font-semibold">Lesson Insights</h3>
              <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                <li className="flex items-start justify-between gap-4 px-5 py-5">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">Allow lesson transcription</p>
                    <p className="text-sm text-muted-foreground">
                      This is needed to create Lesson Insights. Data may also be shared with
                      third-party tools. By turning this on, you agree to our AI additional
                      terms. To learn more, check Amazing Skills&apos; Privacy Policy.
                    </p>
                  </div>
                  <Toggle
                    checked={transcriptionEnabled}
                    onCheckedChange={setTranscriptionEnabled}
                    label="Allow lesson transcription"
                  />
                </li>
                <li className="flex items-start justify-between gap-4 px-5 py-5">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">Help improve Amazing Skills</p>
                    <p className="text-sm text-muted-foreground">
                      Allow Amazing Skills to use audio recordings and transcriptions for future
                      product development. You can manage this preference at any time.
                    </p>
                  </div>
                  <Toggle
                    checked={improveEnabled}
                    onCheckedChange={setImproveEnabled}
                    label="Help improve Amazing Skills"
                  />
                </li>
              </ul>
            </div>

            <div className="flex justify-end">
              <Button type="button" size="lg" disabled>
                Save changes
              </Button>
            </div>
          </div>
        ) : null}

        {section === "billing" ? (
          <div className="space-y-6">
            <div>
              <h2 className="font-heading text-2xl font-semibold tracking-tight">
                Plans &amp; billing
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage your Amazing Skills subscription and invoices.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-sm text-muted-foreground">
                Choose a plan, update billing details, and review your subscription status.
              </p>
              <Button className="mt-4" render={<Link href="/dashboard/teacher/billing" />}>
                Open plans &amp; billing
              </Button>
            </div>
          </div>
        ) : null}

        {section === "payments" ? (
          <div className="space-y-6">
            <div>
              <h2 className="font-heading text-2xl font-semibold tracking-tight">
                Student payments
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Set up how students pay you for lessons.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-sm text-muted-foreground">
                Connect or update your payout method and review student payment settings.
              </p>
              <Button className="mt-4" render={<Link href="/dashboard/teacher/payments" />}>
                Open student payments
              </Button>
            </div>
          </div>
        ) : null}

        {section === "delete" ? (
          <div className="space-y-6">
            <div>
              <h2 className="font-heading text-2xl font-semibold tracking-tight">
                Delete account
              </h2>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                Deleting your account is permanent and all your account information will be
                deleted along with it. If you&apos;re sure you want to proceed, enter your email
                address below.
              </p>
            </div>
            <Field className="max-w-md">
              <FieldLabel htmlFor="delete-email">Email</FieldLabel>
              <Input
                id="delete-email"
                type="email"
                autoComplete="email"
                value={deleteEmail}
                onChange={(event) => setDeleteEmail(event.target.value)}
                placeholder={email}
              />
            </Field>
            <div className="flex justify-end">
              <Button type="button" variant="secondary" disabled>
                <Trash2 className="size-4" aria-hidden />
                Delete account
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
