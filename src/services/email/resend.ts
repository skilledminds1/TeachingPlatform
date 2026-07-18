import { Resend } from "resend";

import { env } from "@/lib/env";

export function isEmailConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY);
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ sent: boolean; skipped?: boolean }> {
  if (!env.RESEND_API_KEY) {
    return { sent: false, skipped: true };
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const from = env.RESEND_FROM_EMAIL ?? "Amazing Skills <onboarding@resend.dev>";
  await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
  });
  return { sent: true };
}
