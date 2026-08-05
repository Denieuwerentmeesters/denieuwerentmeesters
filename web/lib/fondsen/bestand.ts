import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Connector, RegelingNormaal } from "@/lib/subsidie/connectors";

// Fondsen-connector: leest de geconverteerde fondsenlijst uit de repo
// (kennisbank/Fondsen/fondsen.json) en levert genormaliseerde regelingen aan
// dezelfde runner die de subsidiebronnen gebruikt (lib/subsidie/ingestie.ts).
// Daarmee krijgen fondsen gratis de idempotentie, de snapshot-hash en de
// import-run-administratie van migratie 0012.
//
// De JSON wordt gegenereerd uit Fondsenoverzicht.csv door
// scripts/converteer-fondsen.mjs; het schema en de kolomeisen staan in
// kennisbank/Fondsen/README.md.
//
// Bron: Implementatieplan_Fondsenradar.md §1 (soort_bron / rechtskarakter /
// bestuurslaag leeg), §2 (kolommapping, herkomst), §3 (benaderbaarheid),
// §4 (bewijs), §5 (geografie), §9.1 (rechtsvorm).

export const FONDSEN_BRON_SLEUTEL = "fondsen_handmatig";

export type FondsCriterium = {
  omschrijving: string;
  veld?: string | null;
  operator?: string | null;
  waarde?: string | null;
  soort?: "eis" | "pre" | "uitsluiting";
  fase?: "vooraf" | "bij_aanvraag" | "na_toekenning";
  verplicht?: boolean;
  // Drie-waardig (§2): 'onbekend' is een echte uitkomst, geen ontbrekende waarde.
  uitkomst?: "ja" | "nee" | "onbekend";
  uitkomst_toelichting?: string | null;
  uitsluiting_reden?: string | null;
  herkomst?: FondsHerkomst;
};

export type FondsBewijs = {
  omschrijving: string;
  vereiste_type?: string;
  document_type?: string | null;
  fase?: "vooraf" | "bij_aanvraag" | "achteraf";
  verplichtheid?: "verplicht" | "aanbevolen" | "soms";
  zelf_op_te_stellen?: boolean | null;
  doorlooptijd_indicatie?: string | null;
  bron_tekst?: string | null;
  herkomst?: FondsHerkomst;
};

export type FondsHerkomst =
  | "handmatig"
  | "afgeleid_tag"
  | "geverifieerd_bron"
  | "ai_voorstel";

// Eén rij uit fondsen.json. Alleen `sleutel` en `naam` zijn verplicht: een leeg
// veld is bij fondsen de normaalste zaak, en dat is iets anders dan een
// nul-waarde (§2, drie-waardige logica).
export type FondsRij = {
  sleutel: string; // stabiele id; idempotency-sleutel binnen de bron
  naam: string;
  categorie?: string | null; // kolom "Categorie" (vrije tekst)
  samenvatting?: string | null; // kolom "Statutaire doelstelling"
  bron_url?: string | null; // kolom "Bron (URL)"
  contact?: string | null; // kolom "Contact" — persoonsgegevens, zie §9 slot
  themas?: string[] | null; // kolom "Relevant voor welk type landgoedplan"
  plan_triggers?: string[] | null;
  doelgroepen?: string[] | null; // kolom "Doelgroep"
  trefwoorden?: string[] | null;
  sectoren?: string[] | null;
  soort_bron?: RegelingNormaal["soort_bron"];
  rechtskarakter?: RegelingNormaal["rechtskarakter"];
  benaderbaarheid?: RegelingNormaal["benaderbaarheid"];
  benaderwijze_notitie?: string | null; // letterlijk citaat (§3)
  geo_niveau?: RegelingNormaal["geo_niveau"];
  geo_waarden?: string[] | null;
  provincie?: string | null;
  gemeenten?: string[] | null;
  budget_indicatie?: string | null; // kolom "Orde grootte bedrag", letterlijk
  bedrag_min?: number | null;
  bedrag_max?: number | null;
  bedrag_typisch?: number | null;
  cofinanciering_vereist?: boolean | null;
  max_percentage_projectkosten?: number | null;
  financieringsrol?: RegelingNormaal["financieringsrol"];
  kostensoort?: string[] | null;
  cooldown_maanden?: number | null;
  hercontrole_termijn?: number | null;
  status_opmerking?: string | null;
  // Uit welk tabblad van de Excel deze rij komt (Fondsenoverzicht | Sheet1).
  // Twee losse onderzoeksronden met nul overlap en een verschillende
  // verificatiegraad; dat blijft per rij zichtbaar.
  tabblad?: string | null;
  // Alleen tabblad Sheet1 vult deze twee; anders 'onbekend' (niet gokken).
  aanvrager_type?: RegelingNormaal["aanvrager_type"];
  verdienmodel?: RegelingNormaal["verdienmodel"];
  herkomst?: FondsHerkomst;
  criteria?: FondsCriterium[];
  bewijs?: FondsBewijs[];
};

const HERKOMSTEN = new Set<string>([
  "handmatig",
  "afgeleid_tag",
  "geverifieerd_bron",
  "ai_voorstel",
]);

// Zoekpaden: de app draait vanuit web/, een script soms vanuit de repo-root.
// FONDSEN_BESTAND overschrijft alles (handig voor een testfixture).
export function bestandsPad(): string {
  const uitEnv = process.env.FONDSEN_BESTAND;
  if (uitEnv) return resolve(uitEnv);
  const kandidaten = [
    resolve(process.cwd(), "..", "kennisbank", "Fondsen", "fondsen.json"),
    resolve(process.cwd(), "kennisbank", "Fondsen", "fondsen.json"),
  ];
  return kandidaten.find((p) => existsSync(p)) ?? kandidaten[0];
}

export function leesFondsen(pad = bestandsPad()): FondsRij[] {
  if (!existsSync(pad)) {
    throw new Error(
      `Fondsenbestand niet gevonden op '${pad}'. Draai ` +
        `\`node scripts/converteer-fondsen.mjs\` of zet FONDSEN_BESTAND.`,
    );
  }
  let ruw: unknown;
  try {
    ruw = JSON.parse(readFileSync(pad, "utf8"));
  } catch (e) {
    throw new Error(
      `Fondsenbestand '${pad}' is geen geldige JSON: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
  const rijen = Array.isArray(ruw) ? ruw : (ruw as { fondsen?: unknown })?.fondsen;
  if (!Array.isArray(rijen)) {
    throw new Error(
      `Fondsenbestand '${pad}' moet een array zijn, of een object met de sleutel 'fondsen'.`,
    );
  }
  const sleutels = new Set<string>();
  return rijen.map((r, i) => {
    const rij = valideer(r, i, pad);
    if (sleutels.has(rij.sleutel)) {
      throw new Error(`${pad}: dubbele sleutel '${rij.sleutel}' — moet uniek zijn.`);
    }
    sleutels.add(rij.sleutel);
    return rij;
  });
}

function valideer(rij: unknown, index: number, pad: string): FondsRij {
  const plek = `${pad} rij ${index + 1}`;
  if (typeof rij !== "object" || rij === null) throw new Error(`${plek}: geen object.`);
  const r = rij as Record<string, unknown>;
  const sleutel = typeof r.sleutel === "string" ? r.sleutel.trim() : "";
  const naam = typeof r.naam === "string" ? r.naam.trim() : "";
  if (!sleutel) throw new Error(`${plek}: 'sleutel' ontbreekt (stabiele id, verplicht).`);
  if (!naam) throw new Error(`${plek}: 'naam' ontbreekt.`);
  if (r.herkomst !== undefined && !HERKOMSTEN.has(String(r.herkomst))) {
    throw new Error(
      `${plek}: onbekende herkomst '${String(r.herkomst)}'. Toegestaan: ${[...HERKOMSTEN].join(", ")}.`,
    );
  }
  // §1: `bestuurslaag` gaat over overheidslagen en hoort bij een fonds niet
  // gevuld te zijn. Liever hier hard stoppen dan de categoriefout later in elke
  // query terugzien.
  if (r.bestuurslaag !== undefined && r.bestuurslaag !== null) {
    throw new Error(
      `${plek}: 'bestuurslaag' mag bij fondsen niet gevuld zijn (§1 van het plan).`,
    );
  }
  return { ...(r as FondsRij), sleutel, naam };
}

// Kolommapping §2: naam -> naam, categorie -> categorie/trefwoorden, regio ->
// geo_niveau/geo_waarden (+ provincie), doelstelling -> samenvatting, type
// landgoedplan -> themas/plan_triggers, orde grootte -> budget_indicatie,
// bronlink -> bron_url.
export function naarRegeling(f: FondsRij): RegelingNormaal {
  const soort_bron = f.soort_bron ?? "fonds";
  return {
    extern_id: f.sleutel,
    naam: f.naam,
    samenvatting: f.samenvatting ?? null,
    bron_url: f.bron_url ?? null,
    contact: f.contact ?? null,
    // `categorie` op de tabel is een enum; de vrije categorie-tekst uit de
    // export gaat daarom naar trefwoorden en niet naar dat veld.
    categorie: "regeling",
    scope: "nationaal",
    provincie: f.provincie ?? null,
    gemeenten: f.gemeenten ?? null,
    // §1: NOOIT gevuld voor een fonds.
    bestuurslaag: null,
    themas: f.themas ?? null,
    trefwoorden: f.trefwoorden ?? (f.categorie ? [f.categorie] : null),
    doelgroepen: f.doelgroepen ?? null,
    sectoren: f.sectoren ?? null,
    plan_triggers: f.plan_triggers ?? null,

    soort_bron,
    rechtskarakter:
      f.rechtskarakter ?? (soort_bron === "fonds" ? "privaatrechtelijk" : null),
    benaderbaarheid: f.benaderbaarheid ?? "onbekend",
    benaderwijze_notitie: f.benaderwijze_notitie ?? null,
    geo_niveau: f.geo_niveau ?? null,
    geo_waarden: f.geo_waarden ?? null,
    budget_indicatie: f.budget_indicatie ?? null,
    bedrag_min: f.bedrag_min ?? null,
    bedrag_max: f.bedrag_max ?? null,
    bedrag_typisch: f.bedrag_typisch ?? null,
    // null = niet gepubliceerd; mag nooit als "nee" gelezen worden (§2).
    cofinanciering_vereist:
      f.cofinanciering_vereist === undefined ? null : f.cofinanciering_vereist,
    max_percentage_projectkosten: f.max_percentage_projectkosten ?? null,
    financieringsrol: f.financieringsrol ?? "onbekend",
    kostensoort: f.kostensoort ?? null,
    cooldown_maanden: f.cooldown_maanden ?? null,
    hercontrole_termijn: f.hercontrole_termijn ?? 12,

    // Handelingsperspectief (migratie 0051): een fonds dat alleen aan een derde
    // partij geeft is geen "schrijf een aanvraag" maar een "zoek een partner".
    aanvrager_type: f.aanvrager_type ?? "onbekend",
    verdienmodel: f.verdienmodel ?? "onbekend",
    bron_tabblad: f.tabblad ?? null,

    // §2: zonder expliciete herkomst is de rij per definitie een gissing.
    // `geaccordeerd` blijft false; dat zet de runner.
    herkomst: f.herkomst ?? "afgeleid_tag",
    ruw: f,
  };
}

export const fondsenBestandConnector: Connector = {
  bronSleutel: FONDSEN_BRON_SLEUTEL,
  async haalOp(): Promise<RegelingNormaal[]> {
    return leesFondsen().map(naarRegeling);
  },
};
