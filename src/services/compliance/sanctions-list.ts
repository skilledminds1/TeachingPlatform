import { logger } from "@/lib/observability/logger";

/**
 * Sanctions list feeds for name screening (INT-13).
 *
 * ONLY OFAC IS IMPLEMENTED, and that is a finding rather than a shortcut. INT-13 called for
 * "the free OFAC SDN and EU consolidated feeds". OFAC publishes SDN.CSV with no key and no
 * registration, from two independent hosts. The EU consolidated list does not: every public
 * entry point was checked on 2026-08-02 and the long-standing anonymous token endpoint
 * (`webgate.ec.europa.eu/fsd/fsf/public/files/...?token=dG9rZW4tMjAxNw`) now answers 500 for
 * both the CSV and XML variants, and the data.europa.eu dataset path 404s. The EU list is
 * behind a registered account. Adding a source that cannot fetch would report "screened"
 * while checking nothing, which is worse than one honest source.
 *
 * When an EU credential exists, add a second entry to SOURCES; nothing else changes.
 */

export type SanctionsEntry = {
  /** Primary name as published. */
  name: string;
  /** Programme, e.g. "CUBA" — kept for the audit record. */
  programme: string;
  /** Publisher's own record id. */
  reference: string;
};

export type SanctionsList = {
  entries: SanctionsEntry[];
  source: string;
  fetchedAt: Date;
};

const FETCH_TIMEOUT_MS = 20_000;

/**
 * Two hosts for the same OFAC data. The modern service is primary; the legacy path has been
 * stable for years and covers a service migration or outage.
 */
const SOURCES = [
  {
    name: "OFAC SDN (sanctionslistservice)",
    url: "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.CSV",
  },
  {
    name: "OFAC SDN (treasury.gov legacy)",
    url: "https://www.treasury.gov/ofac/downloads/sdn.csv",
  },
] as const;

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Split one CSV line, honouring quoted fields.
 *
 * The SDN file quotes names that contain commas — "ANGLO-CARIBBEAN CO., LTD." — so a naive
 * split on comma truncates exactly the entries most likely to matter.
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (character === "," && !inQuotes) {
      fields.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  fields.push(current);
  return fields.map((field) => field.trim());
}

/** OFAC writes "-0-" where a field is absent. */
function cell(value: string | undefined): string {
  const text = (value ?? "").trim();
  return text === "-0-" ? "" : text;
}

export function parseSdnCsv(csv: string): SanctionsEntry[] {
  const entries: SanctionsEntry[] = [];
  for (const line of csv.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const fields = parseCsvLine(line);
    // Column order: ent_num, SDN_Name, SDN_Type, Program, ...
    const name = cell(fields[1]);
    if (!name) continue;
    entries.push({
      name,
      programme: cell(fields[3]),
      reference: cell(fields[0]),
    });
  }
  return entries;
}

/**
 * Fetch the current list, trying each source in turn.
 *
 * Returns null when every source fails. The caller must treat that as "could not screen"
 * and hold the decision — never as "clear".
 */
export async function fetchSanctionsList(): Promise<SanctionsList | null> {
  for (const source of SOURCES) {
    try {
      const csv = await fetchText(source.url);
      const entries = parseSdnCsv(csv);
      // A near-empty parse means the format moved under us. Treating that as a clean list
      // would silently pass everyone.
      if (entries.length < 100) {
        throw new Error(`implausible entry count ${entries.length}`);
      }
      return { entries, source: source.name, fetchedAt: new Date() };
    } catch (error) {
      logger.warn("sanctions_source_failed", { source: source.name, error: String(error) });
    }
  }

  logger.error("sanctions_all_sources_failed", { sources: SOURCES.map((s) => s.name) });
  return null;
}
