import { fetchExtern } from "@/lib/extern";
import type { Connector, RegelingNormaal } from "../connectors";

// RVO open-data connector. Gratis, CC-0, JSON. ~47 records.
// LET OP: de feed bevat GEEN deadlines en GEEN open/dicht-status — die komen
// later uit AI-verrijking (verrijkRegeling). subjects/tags/targets/sectors zijn
// de matching-haakjes.

const FEED_URL = "https://www.rvo.nl/api/v1/opendata/subsidies";

type RvoRecord = {
  id: string;
  url?: string;
  title?: string;
  intro?: string;
  subjects?: string[];
  tags?: string[];
  targets?: string[];
  sectors?: string[];
  type?: string;
};

function tekst(v: unknown): string | null {
  if (typeof v !== "string") return null;
  // intro kan HTML bevatten — strip grof, laat verrijking de details doen.
  const schoon = v.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return schoon || null;
}

function lijst(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const items = v.filter((x): x is string => typeof x === "string" && x.trim() !== "");
  return items.length ? items : null;
}

export const rvoConnector: Connector = {
  bronSleutel: "rvo_opendata",
  async haalOp(): Promise<RegelingNormaal[]> {
    const res = await fetchExtern(
      FEED_URL,
      { headers: { accept: "application/json" }, cache: "no-store" },
      20000,
    );
    if (!res.ok) {
      throw new Error(`RVO-feed gaf status ${res.status}`);
    }
    const data = await res.json();
    const records: RvoRecord[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.results)
          ? data.results
          : [];

    return records
      .filter((r) => r && r.id)
      .map((r): RegelingNormaal => {
        const subjects = lijst(r.subjects) ?? [];
        const tags = lijst(r.tags) ?? [];
        const themas = [...new Set([...subjects, ...tags])];
        return {
          extern_id: String(r.id),
          naam: tekst(r.title) ?? "(zonder titel)",
          samenvatting: tekst(r.intro),
          bron_url: r.url
            ? r.url.startsWith("http")
              ? r.url
              : `https://www.rvo.nl${r.url}`
            : null,
          categorie: "subsidie",
          scope: "nationaal",
          themas: themas.length ? themas : null,
          trefwoorden: tags.length ? tags : null,
          doelgroepen: lijst(r.targets),
          sectoren: lijst(r.sectors),
          // Geen deadline-info in de feed.
          ruw: r,
        };
      });
  },
};
