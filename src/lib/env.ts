import { z } from "zod";

const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);
const optionalPositiveNumber = z.preprocess(
  (value) => (value === "" || value === undefined ? undefined : value),
  z.coerce.number().positive().optional(),
);

const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  DIRECT_URL: z.string().min(1).optional(),
  PAYPAL_CLIENT_ID: optionalSecret,
  PAYPAL_CLIENT_SECRET: optionalSecret,
  PAYPAL_ENVIRONMENT: z.enum(["sandbox", "live"]).default("sandbox"),
  PAYPAL_WEBHOOK_ID: optionalSecret,
  PAYPAL_PARTNER_MERCHANT_ID: optionalSecret,
  PAYPAL_BN_CODE: optionalSecret,
  PAYFAST_MERCHANT_ID: optionalSecret,
  PAYFAST_MERCHANT_KEY: optionalSecret,
  PAYFAST_PASSPHRASE: optionalSecret,
  PAYFAST_SANDBOX: z.enum(["true", "false"]).default("true"),
  PAYFAST_USD_ZAR_RATE: optionalPositiveNumber,
  LESSON_PAYMENTS_PAYPAL_ENABLED: z.enum(["true", "false"]).default("false"),
  LESSON_PAYMENT_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(30),
  LIVEKIT_URL: z.string().url().optional(),
  LIVEKIT_API_KEY: optionalSecret,
  LIVEKIT_API_SECRET: optionalSecret,
  RESEND_API_KEY: optionalSecret,
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
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  return envSchema.parse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
    PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID,
    PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
    PAYPAL_ENVIRONMENT: process.env.PAYPAL_ENVIRONMENT,
    PAYPAL_WEBHOOK_ID: process.env.PAYPAL_WEBHOOK_ID,
    PAYPAL_PARTNER_MERCHANT_ID: process.env.PAYPAL_PARTNER_MERCHANT_ID,
    PAYPAL_BN_CODE: process.env.PAYPAL_BN_CODE,
    PAYFAST_MERCHANT_ID: process.env.PAYFAST_MERCHANT_ID,
    PAYFAST_MERCHANT_KEY: process.env.PAYFAST_MERCHANT_KEY,
    PAYFAST_PASSPHRASE: process.env.PAYFAST_PASSPHRASE,
    PAYFAST_SANDBOX: process.env.PAYFAST_SANDBOX,
    PAYFAST_USD_ZAR_RATE: process.env.PAYFAST_USD_ZAR_RATE,
    LESSON_PAYMENTS_PAYPAL_ENABLED: process.env.LESSON_PAYMENTS_PAYPAL_ENABLED,
    LESSON_PAYMENT_TIMEOUT_MINUTES: process.env.LESSON_PAYMENT_TIMEOUT_MINUTES,
    LIVEKIT_URL: process.env.LIVEKIT_URL,
    LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
  });
}

export const env = parseEnv();

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
