import { logger } from "@/lib/observability/logger";
import {
  fetchSanctionsList,
  type SanctionsEntry,
  type SanctionsList,
} from "@/services/compliance/sanctions-list";

/**
 * Name screening against the sanctions list (INT-13).
 *
 * The output is a decision about whether a HUMAN should look, never an accusation. A hit
 * means "hold this approval for review", and the reviewer decides. Name matching cannot do
 * better than that: real people share names with sanctioned parties, and the cost of the two
 * errors is wildly asymmetric — a delayed approval versus onboarding a sanctioned party.
 */

export type ScreeningOutcome = {
  status: "clear" | "review_required" | "unavailable";
  source: string | null;
  matches: Array<{ name: string; programme: string; reference: string }>;
  screenedAt: Date;
};

/** Cache the list for an hour: it is republished daily and approvals arrive in bursts. */
const CACHE_TTL_MS = 60 * 60_000;
let cache: { value: SanctionsList; expiresAt: number } | null = null;

export function clearSanctionsCache(): void {
  cache = null;
}

async function currentList(): Promise<SanctionsList | null> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  const list = await fetchSanctionsList();
  if (list) cache = { value: list, expiresAt: Date.now() + CACHE_TTL_MS };
  return list;
}

/**
 * Reduce a name to comparable tokens.
 *
 * Diacritics are folded and punctuation dropped so "Muhammad Al-Qadi" and "Muhammad Al Qadi"
 * compare equal; the list and the registration form will not agree on either.
 */
export function nameTokens(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

/**
 * Whether a candidate name plausibly matches a list entry.
 *
 * Every token of the shorter name must appear in the longer one. That catches middle names
 * and reordering ("Qadi, Muhammad Al") without firing on a single shared common token, which
 * a naive substring check does constantly — "Ali" appears in thousands of SDN rows and would
 * hold every approval on the platform.
 */
export function namesMatch(candidate: string, entry: string): boolean {
  const a = nameTokens(candidate);
  const b = nameTokens(entry);
  if (a.length === 0 || b.length === 0) return false;

  // A single-token name is too weak to match on; require at least two.
  const shorter = a.length <= b.length ? a : b;
  const longer = shorter === a ? b : a;
  if (shorter.length < 2) return false;

  const longerSet = new Set(longer);
  return shorter.every((token) => longerSet.has(token));
}

export function findMatches(candidate: string, entries: SanctionsEntry[]): SanctionsEntry[] {
  const matches: SanctionsEntry[] = [];
  for (const entry of entries) {
    if (namesMatch(candidate, entry.name)) {
      matches.push(entry);
      // A handful is enough for a reviewer to act on; the rest is noise in the audit record.
      if (matches.length >= 10) break;
    }
  }
  return matches;
}

/**
 * Screen a name.
 *
 * A fetch failure returns "unavailable", NOT "clear". The caller must not approve on an
 * unavailable result — a list we could not read is not a list that cleared anyone.
 */
export async function screenName(name: string): Promise<ScreeningOutcome> {
  const screenedAt = new Date();
  const list = await currentList();

  if (!list) {
    logger.error("sanctions_screening_unavailable", { name: name.slice(0, 80) });
    return { status: "unavailable", source: null, matches: [], screenedAt };
  }

  const matches = findMatches(name, list.entries);
  return {
    status: matches.length > 0 ? "review_required" : "clear",
    source: list.source,
    matches: matches.map((match) => ({
      name: match.name,
      programme: match.programme,
      reference: match.reference,
    })),
    screenedAt,
  };
}
