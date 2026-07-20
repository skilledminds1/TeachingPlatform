import { Resend } from "resend";

import { env } from "@/lib/env";
import type { EmailMessage, EmailProvider, EmailSendResult } from "@/services/email/provider";

export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  private readonly client: Resend;

  constructor(apiKey = env.RESEND_API_KEY) {
    if (!apiKey) throw new Error("RESEND_API_KEY is required for the Resend email provider.");
    this.client = new Resend(apiKey);
  }

  async send(input: EmailMessage): Promise<EmailSendResult> {
    const { data, error } = await this.client.emails.send(
      {
        from: env.RESEND_FROM_EMAIL ?? "Amazing Skills <onboarding@resend.dev>",
        to: input.to,
        subject: input.subject,
        html: input.html,
      },
      { idempotencyKey: input.idempotencyKey },
    );
    if (error) throw new Error(error.message);
    return { messageId: data?.id };
  }
}
