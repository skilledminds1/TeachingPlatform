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
        // Sending on a domain does not mean receiving on it. Resend delivers mail FROM
        // amazing-skills.com, but nothing accepts mail TO it unless a mailbox exists — so a
        // reply to the From address bounces silently.
        //
        // That is not cosmetic here: the guardian consent email tells a parent they can
        // withdraw permission for their child by replying. Pointing Reply-To at the operator
        // address makes that true without needing a mailbox on the domain. It is
        // LEGAL_SUPPORT_EMAIL rather than a new variable because that is already "where users
        // write", already rendered on every legal page, and already required at boot — so it
        // cannot be unset in production while this quietly falls back to a black hole.
        replyTo: env.LEGAL_SUPPORT_EMAIL,
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
