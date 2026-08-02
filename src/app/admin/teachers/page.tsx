import { ClipboardCheck, CreditCard, GraduationCap } from "lucide-react";

import { AdminPageHeader } from "@/features/admin/components/admin-page-header";
import { EmptyState } from "@/features/admin/components/empty-state";
import { StatusBadge, statusTone } from "@/features/admin/components/status-badge";
import { TeacherModerationActions } from "@/features/admin/components/teacher-moderation-actions";
import { formatCurrency, formatDate, formatStatus } from "@/lib/format";
import { getTeacherModerationQueue } from "@/server/admin/dashboard";

export default async function AdminTeachersPage() {
  const profiles = await getTeacherModerationQueue();
  const pendingCount = profiles.filter((profile) => profile.status === "pending_approval").length;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <AdminPageHeader
        title="Teacher approvals"
        description={`${pendingCount} profile${pendingCount === 1 ? "" : "s"} waiting for review`}
      />

      {profiles.length === 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <EmptyState
            icon={ClipboardCheck}
            title="No teacher profiles"
            description="Teacher applications will appear here after profiles are submitted."
          />
        </div>
      ) : (
        <div className="space-y-4">
          {profiles.map((profile) => (
            <article
              key={profile.id}
              className="rounded-xl border border-border bg-card p-5 shadow-sm md:p-6"
            >
              <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {profile.user.name
                        .split(" ")
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div>
                      <h2 className="font-semibold">{profile.user.name}</h2>
                      <p className="text-sm text-muted-foreground">{profile.user.email}</p>
                    </div>
                    <StatusBadge tone={statusTone(profile.status)}>
                      {formatStatus(profile.status)}
                    </StatusBadge>
                  </div>

                  <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Organization</p>
                      <p className="font-medium">{profile.organization.name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Hourly rate</p>
                      <p className="font-medium">
                        {formatCurrency(profile.hourlyRateCents, profile.currency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Submitted</p>
                      <p className="font-medium">
                        {profile.submittedAt ? formatDate(profile.submittedAt) : "Not submitted"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Payment account</p>
                      <p className="flex items-center gap-1.5 font-medium capitalize">
                        <CreditCard className="size-3.5" aria-hidden />
                        {profile.user.teacherPaymentAccounts[0]?.provider ?? "Not linked"}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      {profile.headline || "No headline provided"}
                    </p>
                    <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                      {profile.bio || "No biography provided."}
                    </p>
                  </div>

                  {profile.introVideoUrl ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Introduction video
                      </p>
                      <div className="max-w-xl overflow-hidden rounded-xl bg-black">
                        <video
                          src={profile.introVideoUrl}
                          controls
                          playsInline
                          preload="metadata"
                          className="aspect-video w-full"
                        >
                          Your browser does not support embedded video.
                        </video>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-destructive">No introduction video uploaded</p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {profile.subjects.length > 0 ? (
                      profile.subjects.map(({ subject }) => (
                        <span
                          key={subject.name}
                          className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs"
                        >
                          <GraduationCap className="size-3" aria-hidden />
                          {subject.name}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">No subjects selected</span>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Qualifications
                    </p>
                    {profile.qualifications.length > 0 ? (
                      <ul className="space-y-2">
                        {profile.qualifications.map((qualification) => (
                          <li
                            key={`${qualification.title}-${qualification.issuedYear}`}
                            className="text-sm"
                          >
                            <span className="font-medium">{qualification.title}</span>
                            <span className="text-muted-foreground">
                              {" "}
                              · {qualification.institution} · {qualification.issuedYear}
                            </span>
                            <span className="ms-2 text-xs capitalize text-muted-foreground">
                              ({formatStatus(qualification.status)})
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-destructive">No qualifications provided</p>
                    )}
                  </div>

                  {profile.rejectionReason ? (
                    <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      Previous rejection: {profile.rejectionReason}
                    </p>
                  ) : null}
                </div>

                <TeacherModerationActions
                  profileId={profile.id}
                  currentStatus={profile.status}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
