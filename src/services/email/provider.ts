export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  idempotencyKey: string;
};

export type EmailSendResult = {
  messageId?: string;
};

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}
