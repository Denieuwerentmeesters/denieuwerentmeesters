import { fetchExtern } from "@/lib/extern";
// Lichte SRU 2.0-client voor KOOP (CVDR + officiële publicaties).
// Dependency-vrij: het recordschema (gzd) is vast en voorspelbaar, dus we
// extraheren de bekende velden met gerichte regex i.p.v. een XML-parser-dependency
// (npm install is in deze omgeving niet beschikbaar). Te upgraden naar
// fast-xml-parser zodra dat wenselijk is.
//
// Host & indexen zijn HOST-AFHANKELIJK en geverifieerd op de live host
// zoekservice.overheid.nl: ondersteunde indexen zijn `keyword`, `creator`, `subject`
// (zónder dt.-prefix). De doc-host repository.overheid.nl gebruikt `dt.creator`/
// `dt.subject`; daarom is zowel de base-URL als de index-prefix configureerbaar via env.

export const KOOP_BASE =
  process.env.KOOP_SRU_BASE ?? "https://zoekservice.overheid.nl/sru/Search";
// Indexnaam-prefix: "" voor zoekservice (creator/subject), "dt." voor repository.
const IDX = process.env.KOOP_INDEX_PREFIX ?? "";

export type SruRecord = {
  identifier: string;
  title: string;
  creator: string | null;
  creatorScheme: string | null; // bv. 'overheid:Provincie'
  organisatietype: string | null; // enrichedData
  subjects: string[];
  url: string | null;
  inwerkingtreding: string | null;
  uitwerkingtreding: string | null;
  issued: string | null;
  ruw: string; // het ruwe <record>-blok (gaat naar snapshot.payload)
};

function decode(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// Pak de inhoud van <prefix:tag ...>INHOUD</tag> (eerste match), prefix optioneel.
function tag(block: string, naam: string): string | null {
  const re = new RegExp(`<(?:\\w+:)?${naam}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${naam}>`, "i");
  const m = block.match(re);
  return m ? decode(m[1]) || null : null;
}
function tagAll(block: string, naam: string): string[] {
  const re = new RegExp(`<(?:\\w+:)?${naam}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${naam}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const v = decode(m[1]);
    if (v) out.push(v);
  }
  return out;
}
function attr(block: string, naam: string, attribuut: string): string | null {
  const re = new RegExp(`<(?:\\w+:)?${naam}\\b[^>]*\\b${attribuut}="([^"]*)"`, "i");
  const m = block.match(re);
  return m ? m[1] : null;
}

export function parseRecords(xml: string): SruRecord[] {
  const blocks = xml.match(/<record\b[\s\S]*?<\/record>/gi) ?? [];
  const records: SruRecord[] = [];
  for (const b of blocks) {
    const identifier = tag(b, "identifier");
    const title = tag(b, "title");
    if (!identifier || !title) continue;
    records.push({
      identifier,
      title,
      creator: tag(b, "creator"),
      creatorScheme: attr(b, "creator", "scheme"),
      organisatietype: tag(b, "organisatietype"),
      subjects: tagAll(b, "subject"),
      url: tag(b, "preferred_url") ?? tag(b, "preferred_work_url"),
      inwerkingtreding: tag(b, "inwerkingtredingDatum"),
      uitwerkingtreding: tag(b, "uitwerkingtredingDatum"),
      issued: tag(b, "issued"),
      ruw: b,
    });
  }
  return records;
}

function numberOfRecords(xml: string): number {
  const m = xml.match(/<(?:\w+:)?numberOfRecords>(\d+)</i);
  return m ? Number(m[1]) : 0;
}

// Alleen een échte SRU-diagnostic (info:srw/diagnostic) als fout behandelen,
// niet elk toevallig <message>-element in een geslaagde respons.
function diagnostic(xml: string): string | null {
  if (!/info:srw\/diagnostic|<(?:\w+:)?diagnostics\b/i.test(xml)) return null;
  const m = xml.match(/<(?:\w+:)?message>([^<]+)</i);
  return m ? m[1] : null;
}

// CQL-index met host-afhankelijke prefix.
export function idx(naam: "creator" | "subject"): string {
  return `${IDX}${naam}`;
}

// Eén SRU-zoekvraag, volledig gepagineerd. Gooit bij diagnostic/0-verwacht.
export async function sruZoek(opts: {
  connectie: "cvdr" | "officielepublicaties";
  query: string; // CQL
  sortAflopendOpDatum?: boolean;
  maxRecords?: number; // veiligheidscap totaal
}): Promise<SruRecord[]> {
  const perPagina = 100;
  const cap = opts.maxRecords ?? 2000;
  const alle: SruRecord[] = [];
  let start = 1;
  let totaal = Infinity;

  while (start <= totaal && alle.length < cap) {
    const params = new URLSearchParams({
      operation: "searchRetrieve",
      version: "2.0",
      "x-connection": opts.connectie,
      query: opts.query,
      maximumRecords: String(perPagina),
      startRecord: String(start),
    });
    if (opts.sortAflopendOpDatum) params.set("sortKeys", "dt.date,,0");

    const res = await fetchExtern(
      `${KOOP_BASE}?${params.toString()}`,
      { headers: { accept: "application/xml" }, cache: "no-store" },
      20000,
    );
    if (!res.ok) {
      throw new Error(`KOOP SRU gaf status ${res.status} (${opts.connectie}).`);
    }
    const xml = await res.text();
    const diag = diagnostic(xml);
    if (diag) throw new Error(`KOOP SRU diagnostic: ${diag} — query='${opts.query}'`);

    if (totaal === Infinity) totaal = numberOfRecords(xml);
    const recs = parseRecords(xml);
    if (recs.length === 0) break;
    alle.push(...recs);
    start += perPagina;
  }
  return alle;
}
