import { env } from "@/lib/env";
import { ConsoleEmailProvider } from "@/services/email/console";
import type { EmailProvider } from "@/services/email/provider";
import { ResendEmailProvider } from "@/services/email/resend";

export function getEmailProvider(): EmailProvider {
  const configured = env.EMAIL_PROVIDER;
  if (configured === "console") return new ConsoleEmailProvider();
  if (configured === "resend") return new ResendEmailProvider();
  return env.RESEND_API_KEY
    ? new ResendEmailProvider(env.RESEND_API_KEY)
    : new ConsoleEmailProvider();
}
