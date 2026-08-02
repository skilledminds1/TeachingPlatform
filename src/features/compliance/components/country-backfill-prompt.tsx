import { Globe } from "lucide-react";
import Link from "next/link";

/**
 * Prompt an account created before country existed to supply one (INT-13).
 *
 * The column is nullable because a NOT NULL migration would either fail or invent a country
 * for real people. That makes this banner the other half of the change: without it, every
 * pre-existing account stays permanently unscreened and unpayable, and nothing says why.
 *
 * Renders nothing once a country is set, so it can be mounted unconditionally.
 */
export function CountryBackfillPrompt({ country }: { country: string | null }) {
  if (country) return null;

  return (
    <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <Globe className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
          <div>
            <p className="text-sm font-medium">Add the country you live in</p>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              Your account predates this field. We need it to work out how you can be paid
              and which taxes apply — it takes a moment and you only do it once.
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/settings"
          className="shrink-0 rounded-lg border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent"
        >
          Add country
        </Link>
      </div>
    </div>
  );
}
