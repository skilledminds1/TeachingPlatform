import { readFileSync } from "node:fs";

function loadEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const i = trimmed.indexOf("=");
    const key = trimmed.slice(0, i).trim();
    let value = trimmed.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const env = loadEnv(".env.local");
const base =
  env.PAYPAL_ENVIRONMENT === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

const webhookUrl =
  process.argv[2] ?? "https://amazing-skills.vercel.app/api/v1/webhooks/paypal";

async function main() {
  const basic = Buffer.from(
    `${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`,
  ).toString("base64");

  const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    error?: string;
  };
  if (!tokenRes.ok || !tokenJson.access_token) {
    console.error("token_failed", tokenRes.status, tokenJson);
    process.exit(1);
  }

  const listRes = await fetch(`${base}/v1/notifications/webhooks`, {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  const listJson = (await listRes.json()) as {
    webhooks?: Array<{ id: string; url: string }>;
  };
  const existing = (listJson.webhooks ?? []).find((w) => w.url === webhookUrl);
  if (existing) {
    console.log(`EXISTING_WEBHOOK_ID=${existing.id}`);
    console.log(`URL=${existing.url}`);
    return;
  }

  const createRes = await fetch(`${base}/v1/notifications/webhooks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenJson.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: webhookUrl,
      event_types: [
        { name: "CHECKOUT.ORDER.APPROVED" },
        { name: "PAYMENT.CAPTURE.COMPLETED" },
        { name: "PAYMENT.CAPTURE.DENIED" },
        { name: "PAYMENT.CAPTURE.REFUNDED" },
      ],
    }),
  });
  const createJson = (await createRes.json()) as {
    id?: string;
    message?: string;
    details?: unknown;
  };
  if (!createRes.ok || !createJson.id) {
    console.error("create_failed", createRes.status, JSON.stringify(createJson));
    process.exit(1);
  }
  console.log(`CREATED_WEBHOOK_ID=${createJson.id}`);
  console.log(`URL=${webhookUrl}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
