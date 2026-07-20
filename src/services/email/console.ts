import { logger } from "@/lib/observability/logger";
import type { EmailMessage, EmailProvider, EmailSendResult } from "@/services/email/provider";

export class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console";

  async send(message: EmailMessage): Promise<EmailSendResult> {
    logger.info("email_console_delivery", {
      to: message.to,
      subject: message.subject,
      idempotencyKey: message.idempotencyKey,
    });
    return { messageId: `console:${message.idempotencyKey}` };
  }
}
