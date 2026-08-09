import { z } from "zod";
import { assertProductionEnv } from "@/lib/env-production";

const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);
const optionalLongSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(32).optional(),
);

const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  DIRECT_URL: z.string().min(1).optional(),
  PAYFAST_MERCHANT_ID: optionalSecret,
  PAYFAST_MERCHANT_KEY: optionalSecret,
  PAYFAST_PASSPHRASE: optionalSecret,
  PAYFAST_SANDBOX: z.enum(["true", "false"]).default("true"),
  // Paddle (PAY-03). Not yet the live rail — see src/services/paddle/catalogue.ts.
  // The client token is designed to sit in the browser, like the Supabase publishable key, so
  // it is NEXT_PUBLIC_ and must not be marked Sensitive in Vercel: sensitive values are absent
  // at build time and a NEXT_PUBLIC_ one would inline as undefined with no error anywhere.
  NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: z.string().min(1).optional(),
  NEXT_PUBLIC_PADDLE_ENVIRONMENT: z.enum(["sandbox", "production"]).default("production"),
  PADDLE_API_KEY: optionalSecret,
  PADDLE_WEBHOOK_SECRET: optionalSecret,
  LIVEKIT_URL: z.string().url().optional(),
  LIVEKIT_API_KEY: optionalSecret,
  LIVEKIT_API_SECRET: optionalSecret,
  RESEND_API_KEY: optionalSecret,
  EMAIL_PROVIDER: z.enum(["resend", "console"]).optional(),
  // Resend accepts plain emails or "Display Name <email@domain>".
  RESEND_FROM_EMAIL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .min(1)
      .refine(
        (value) =>
          z.string().email().safeParse(value).success ||
          /^[^<>]+<\s*[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+\s*>$/.test(value),
        { message: "Invalid From address (use email or Name <email>)" },
      )
      .optional(),
  ),
  LEGAL_ENTITY_NAME: z.string().min(1).default("[REPLACE BEFORE LAUNCH: registered entity name]"),
  LEGAL_REGISTRATION_NUMBER: z
    .string()
    .min(1)
    .default("[REPLACE BEFORE LAUNCH: registration number]"),
  LEGAL_BUSINESS_ADDRESS: z
    .string()
    .min(1)
    .default("[REPLACE BEFORE LAUNCH: registered business address]"),
  LEGAL_SUPPORT_EMAIL: z.email().default("support@example.com"),
  LEGAL_INFORMATION_OFFICER_EMAIL: z.email().default("privacy@example.com"),
  LEGAL_EVIDENCE_SALT: optionalSecret,
  TOKEN_ENCRYPTION_KEY: optionalSecret,
  GOOGLE_CALENDAR_CLIENT_ID: optionalSecret,
  GOOGLE_CALENDAR_CLIENT_SECRET: optionalSecret,
  CRON_SECRET: optionalLongSecret,
  HEALTH_SECRET: optionalLongSecret,
  SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: optionalSecret,
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: optionalSecret,
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const raw: Record<string, string | undefined> = {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
                PAYFAST_MERCHANT_ID: process.env.PAYFAST_MERCHANT_ID,
    PAYFAST_MERCHANT_KEY: process.env.PAYFAST_MERCHANT_KEY,
    PAYFAST_PASSPHRASE: process.env.PAYFAST_PASSPHRASE,
    PAYFAST_SANDBOX: process.env.PAYFAST_SANDBOX,
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
    NEXT_PUBLIC_PADDLE_ENVIRONMENT: process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT,
    PADDLE_API_KEY: process.env.PADDLE_API_KEY,
    PADDLE_WEBHOOK_SECRET: process.env.PADDLE_WEBHOOK_SECRET,
    LIVEKIT_URL: process.env.LIVEKIT_URL,
    LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    LEGAL_ENTITY_NAME: process.env.LEGAL_ENTITY_NAME,
    LEGAL_REGISTRATION_NUMBER: process.env.LEGAL_REGISTRATION_NUMBER,
    LEGAL_BUSINESS_ADDRESS: process.env.LEGAL_BUSINESS_ADDRESS,
    LEGAL_SUPPORT_EMAIL: process.env.LEGAL_SUPPORT_EMAIL,
    LEGAL_INFORMATION_OFFICER_EMAIL: process.env.LEGAL_INFORMATION_OFFICER_EMAIL,
    LEGAL_EVIDENCE_SALT: process.env.LEGAL_EVIDENCE_SALT,
    TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY,
    GOOGLE_CALENDAR_CLIENT_ID: process.env.GOOGLE_CALENDAR_CLIENT_ID,
    GOOGLE_CALENDAR_CLIENT_SECRET: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
    HEALTH_SECRET: process.env.HEALTH_SECRET,
    SENTRY_DSN: process.env.SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT,
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  };

  /**
   * An empty value is NOT an absent one, and every deployment UI produces empty ones.
   *
   * `.optional()` accepts a missing key. It rejects `""`. So a variable someone added in the
   * Vercel dashboard and left blank — or a blank line in a copied .env — fails the parse at
   * module load, inside the Edge middleware bundle, and every route in the application answers
   * MIDDLEWARE_INVOCATION_FAILED. Blank is the normal way to express "not set" in those tools,
   * so treat it as such here rather than making each optional field spell it out.
   */
  const normalised = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, value === "" ? undefined : value]),
  );

  const result = envSchema.safeParse(normalised);
  if (result.success) return result.data;

  /**
   * Fail readably. `envSchema.parse()` threw a raw ZodError, which surfaces as a stack trace
   * naming a field and nothing else — while assertProductionEnv, twenty lines below, exists
   * precisely to list every problem in plain language. The schema running first meant the
   * worse message always won.
   */
  const problems = result.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(unknown)"}: ${issue.message}`)
    .join("\n");
  const count = result.error.issues.length;
  throw new Error(
    [
      `Invalid environment configuration: ${count} problem${count === 1 ? "" : "s"}.`,
      problems,
      "",
      "A variable set to an empty string counts as invalid, not as unset — remove it instead.",
    ].join("\n"),
  );
}

export const env = parseEnv();

// QLT-03: nearly every variable above is optional, so a production deploy missing its most
// important ones boots clean and fails later in pieces — no email sent, every cron 401ing,
// "[REPLACE BEFORE LAUNCH: ...]" rendered on the terms page. Checked here, at module load,
// they are a failed boot instead. Skipped during `next build`, which also runs with
// NODE_ENV=production: a build is not a boot.
assertProductionEnv(env);

/** Publishable (client) key — supports new sb_publishable_* or legacy anon JWT. */
export function getSupabasePublishableKey(): string | undefined {
  return env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export function requireSupabaseEnv(): {
  url: string;
  publishableKey: string;
} {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = getSupabasePublishableKey();

  if (!url || !publishableKey) {
    throw new Error(
      "Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local",
    );
  }

  return { url, publishableKey };
}

export function requireSupabaseAdminEnv(): {
  url: string;
  serviceRoleKey: string;
} {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase admin variables. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
  }

  return { url, serviceRoleKey };
}

export function requireDatabaseEnv(): { databaseUrl: string; directUrl: string } {
  const databaseUrl = env.DATABASE_URL;
  const directUrl = env.DIRECT_URL;

  if (!databaseUrl || !directUrl) {
    throw new Error(
      "Missing database environment variables. Set DATABASE_URL and DIRECT_URL in .env.local",
    );
  }

  return { databaseUrl, directUrl };
}

export function requireLiveKitEnv(): {
  url: string;
  apiKey: string;
  apiSecret: string;
} {
  if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
    throw new Error(
      "Missing LiveKit variables. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.",
    );
  }
  return {
    url: env.LIVEKIT_URL,
    apiKey: env.LIVEKIT_API_KEY,
    apiSecret: env.LIVEKIT_API_SECRET,
  };
}

export function requireGoogleCalendarEnv(): {
  clientId: string;
  clientSecret: string;
} {
  if (!env.GOOGLE_CALENDAR_CLIENT_ID || !env.GOOGLE_CALENDAR_CLIENT_SECRET) {
    throw new Error(
      "Missing Google Calendar variables. Set GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET.",
    );
  }
  return {
    clientId: env.GOOGLE_CALENDAR_CLIENT_ID,
    clientSecret: env.GOOGLE_CALENDAR_CLIENT_SECRET,
  };
}

export function hasGoogleCalendarEnv(): boolean {
  return Boolean(env.GOOGLE_CALENDAR_CLIENT_ID && env.GOOGLE_CALENDAR_CLIENT_SECRET);
}
