import type { Connector, RegelingNormaal } from "../connectors";
import { PROVINCIE_CREATORS } from "../koop/creators";
import { idx, sruZoek, type SruRecord } from "../koop/sru";

// KOOP-connectors: CVDR (voorraad) + officiële publicaties (stroom). Eén
// integratie over alle 12 provincies; per provincie een creator-gefilterde
// SRU-zoekvraag. Schrijft via het bestaande ingestie-framework in `regeling`.
//
// Geverifieerd op de live host (zoekservice.overheid.nl): indexen `keyword`,
// `creator`, `subject`. Filter breed op subsidie-gerelateerde regelingen; de
// strenge relevantiefilter per landgoed is een latere laag (matching.ts).

// Hoeveel records per provincie maximaal ophalen (cap tegen runaway-runs).
const CAP_PER_CREATOR = Number(process.env.KOOP_CAP_PER_CREATOR ?? 300) || 300;

function bestuurslaagVan(
  organisatietype: string | null,
  scheme: string | null,
): RegelingNormaal["bestuurslaag"] {
  const bron = (organisatietype ?? scheme ?? "").toLowerCase();
  if (bron.includes("provincie")) return "provincie";
  if (bron.includes("gemeente")) return "gemeente";
  if (bron.includes("waterschap")) return "waterschap";
  if (bron.includes("rijk")) return "rijk";
  if (bron.includes("samenwerking")) return "samenwerkingsorgaan";
  return null;
}

function scopeVan(b: RegelingNormaal["bestuurslaag"]): RegelingNormaal["scope"] {
  if (b === "rijk") return "nationaal";
  if (b === "gemeente") return "gemeentelijk";
  return "provinciaal"; // provincie/waterschap/onbekend
}

// CVDR-records zijn geldende regelingen; uitwerkingtreding in het verleden = gesloten.
function statusVan(rec: SruRecord): RegelingNormaal["status"] {
  if (!rec.uitwerkingtreding) return "onbekend";
  const eind = new Date(rec.uitwerkingtreding).getTime();
  if (Number.isNaN(eind)) return "onbekend";
  return eind < Date.now() ? "gesloten" : "open";
}

// CVDR-identifier = <werk-id>_<versie>, bv. 'CVDR237410_2'. Dedup op het werk-id
// zodat één regeling één catalogusrij is; de nieuwste versie wint.
function werkId(identifier: string): string {
  return identifier.replace(/_\d+$/, "");
}
function versie(identifier: string): number {
  const m = identifier.match(/_(\d+)$/);
  return m ? Number(m[1]) : 0;
}

function naarRegeling(
  rec: SruRecord,
  creatorNaam: string,
  provincie: string | null,
): RegelingNormaal {
  const bestuurslaag = bestuurslaagVan(rec.organisatietype, rec.creatorScheme);
  return {
    extern_id: werkId(rec.identifier),
    naam: rec.title,
    organisatie: rec.creator ?? creatorNaam,
    creator: rec.creator ?? creatorNaam,
    bestuurslaag,
    scope: scopeVan(bestuurslaag),
    provincie: bestuurslaag === "provincie" ? provincie : null,
    categorie: "subsidie",
    bron_url: rec.url,
    themas: rec.subjects.length ? rec.subjects : null,
    status: statusVan(rec),
    // CVDR-validiteit ≠ subsidie-openstelling: openstelling laten we leeg,
    // die komt uit de stroom (officiële publicaties) of uit AI-verrijking.
    ruw: rec.ruw,
  };
}

// Bouw een CQL-stringliteral veilig (dubbele quotes in de waarde wegstrippen).
function q(v: string): string {
  return `"${v.replace(/"/g, "")}"`;
}

// Dedup per werk-id binnen één run: hoogste versie wint.
function dedupNieuwste(
  recs: SruRecord[],
  creatorNaam: string,
  provincie: string | null,
): RegelingNormaal[] {
  const beste = new Map<string, { v: number; reg: RegelingNormaal }>();
  for (const r of recs) {
    const wid = werkId(r.identifier);
    const v = versie(r.identifier);
    const huidig = beste.get(wid);
    if (!huidig || v > huidig.v) {
      beste.set(wid, { v, reg: naarRegeling(r, creatorNaam, provincie) });
    }
  }
  return [...beste.values()].map((x) => x.reg);
}

export const koopCvdrConnector: Connector = {
  bronSleutel: "koop_cvdr",
  async haalOp(): Promise<RegelingNormaal[]> {
    const uit: RegelingNormaal[] = [];
    for (const c of PROVINCIE_CREATORS) {
      const recs = await sruZoek({
        connectie: "cvdr",
        query: `(keyword=subsidie and ${idx("creator")}=${q(c.cvdr)})`,
        maxRecords: CAP_PER_CREATOR,
      });
      uit.push(...dedupNieuwste(recs, c.cvdr, c.cvdr));
    }
    return uit;
  },
};

export const koopPublicatiesConnector: Connector = {
  bronSleutel: "koop_officielepublicaties",
  async haalOp(): Promise<RegelingNormaal[]> {
    const uit: RegelingNormaal[] = [];
    for (const c of PROVINCIE_CREATORS) {
      const recs = await sruZoek({
        connectie: "officielepublicaties",
        query: `(keyword=subsidie and ${idx("creator")}=${q(c.publicaties)})`,
        sortAflopendOpDatum: true,
        maxRecords: CAP_PER_CREATOR,
      });
      uit.push(...dedupNieuwste(recs, c.publicaties, c.cvdr));
    }
    return uit;
  },
};
