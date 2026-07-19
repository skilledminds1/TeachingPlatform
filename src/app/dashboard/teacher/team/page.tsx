import { Users } from "lucide-react";
import { redirect } from "next/navigation";

import { RevokeInviteButton } from "@/features/organizations/components/revoke-invite-button";
import { TeamInviteForm } from "@/features/organizations/components/team-invite-form";
import { formatDate, formatStatus } from "@/lib/format";
import { getTeacherTeamData } from "@/server/organizations/team";

export default async function TeacherTeamPage() {
  const data = await getTeacherTeamData();
  if (!data) redirect("/dashboard/teacher");

  return (
    <div className="min-h-screen bg-muted/20">
      <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Team</h1>
          <p className="text-muted-foreground">
            Manage teachers in {data.organization.name}.
          </p>
        </div>

        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="font-semibold">Invite a teacher</h2>
          <p className="mt-1 mb-5 text-sm text-muted-foreground">
            Invite links are tied to the recipient email and expire automatically.
          </p>
          <TeamInviteForm
            organizationId={data.organization.id}
            canInviteTeachers={data.canInviteTeachers}
          />
        </section>

        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-semibold">Members</h2>
          </div>
          <ul className="divide-y divide-border">
            {data.organization.members.map((member) => (
              <li
                key={member.user.id}
                className="flex items-center justify-between gap-4 px-5 py-4"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Users className="size-4" aria-hidden />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{member.user.name}</p>
                    <p className="text-xs text-muted-foreground">{member.user.email}</p>
                  </div>
                </div>
                <span className="text-xs capitalize text-muted-foreground">
                  {formatStatus(member.role)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {data.organization.invitations.length > 0 ? (
          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-semibold">Pending invitations</h2>
            </div>
            <ul className="divide-y divide-border">
              {data.organization.invitations.map((invitation) => (
                <li
                  key={invitation.id}
                  className="flex items-center justify-between gap-4 px-5 py-4"
                >
                  <div>
                    <p className="text-sm font-medium">{invitation.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Expires {formatDate(invitation.expiresAt)}
                    </p>
                  </div>
                  <RevokeInviteButton invitationId={invitation.id} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}
