import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";

// Leeslaag voor de verrijkingsslag: kennisbank/Fondsen/verrijking/<slug>.json
// (structuur) + <slug>.md (de integrale beleidstekst). Het schema en de
// betekenis van elk veld staan in verrijking/WERKWIJZE.md.
//
// Uitgangspunt van deze laag: FOUT IS FOUT. Een onbekende enumwaarde, een
// benaderbaarheid zonder citaat of een landgoed-route zonder onderbouwing is
// een harde fout met bestandsnaam en veldnaam erbij — niet stil overslaan.
// De reden is dezelfde als in WERKWIJZE.md: een verzonnen of stil verdwenen
// waarde is later niet meer als fout te herkennen, en de kosten zijn
// asymmetrisch (een fonds ten onrechte aanschrijven kost goodwill in een
// kleine sector).
//
// Eén uitzondering, en dat is bewust GEEN fout: een <slug>.json zonder
// bijbehorende <slug>.md. De verrijkingsmap wordt door parallelle agents
// gevuld terwijl deze import kan draaien; dan is dat een halve schrijfronde en
// geen datafout. Zo'n fonds komt in `onvolledig` terug en wordt overgeslagen.

export const BRONSOORTEN = [
  "website",
  "beleidsplan",
  "jaarverslag",
  "jaarrekening",
  "statuten",
  "anbi_publicatie",
  "aanvraagvoorwaarden",
  "telefonisch_contact",
  "overig",
] as const;
export type Bronsoort = (typeof BRONSOORTEN)[number];

export const BENADERBAARHEDEN = [
  "open",
  "open_met_drempel",
  "via_intermediair",
  "op_uitnodiging",
  "gesloten",
  "onbekend",
] as const;
export type Benaderbaarheid = (typeof BENADERBAARHEDEN)[number];

export const AANVRAGER_TYPEN = [
  "landgoedeigenaar",
  "derde_partij",
  "beide",
  "nvt",
  "onbekend",
] as const;
export type AanvragerType = (typeof AANVRAGER_TYPEN)[number];

export const GEO_NIVEAUS = [
  "landelijk",
  "provincie",
  "regio",
  "gemeente",
  "plaats",
  "internationaal",
] as const;
export type GeoNiveau = (typeof GEO_NIVEAUS)[number];

export const KOSTENSOORTEN = [
  "investering",
  "restauratie",
  "regulier_onderhoud",
  "exploitatie",
  "personeel",
  "onderzoek",
] as const;
export type Kostensoort = (typeof KOSTENSOORTEN)[number];

export const ROUTES = ["zelf", "via_partner", "niet_relevant", "onbekend"] as const;
export type LandgoedRoute = (typeof ROUTES)[number];

export type VerrijkingBron = {
  soort: Bronsoort;
  url: string | null;
  jaar: number | null;
  gelezen: boolean;
};

export type OnderliggendFonds = {
  naam: string;
  relevant: boolean | null;
  reden: string | null;
};

export type Verrijking = {
  slug: string; // bestandsnaam zonder extensie; tevens sleutel van de bronlezing
  naam: string;
  bronnen: VerrijkingBron[];
  doelstelling: string | null;
  benaderbaarheid: Benaderbaarheid;
  benaderwijze_notitie: string | null;
  aanvrager_type: AanvragerType;
  geo_niveau: GeoNiveau | null;
  geo_waarden: string[];
  bedrag_min: number | null;
  bedrag_max: number | null;
  bedrag_indicatie: string | null;
  cofinanciering_vereist: boolean | null;
  uitsluitingen: string[];
  kostensoort: Kostensoort[];
  landgoed_route: LandgoedRoute;
  landgoed_route_reden: string | null;
  landgoed_partnertype: string | null;
  onderliggende_fondsen: OnderliggendFonds[];
  niet_gevonden: string[];
  // Uit <slug>.md — de integrale beleidstekst.
  beleidstekst: string;
  beleidstekst_hash: string;
  beleidstekst_opgehaald_op: string | null; // ISO-datum uit de kop van de .md
};

export type VerrijkingLezing = {
  fondsen: Verrijking[];
  // <slug>.json zonder (nog) een <slug>.md — geen fout, wel te rapporteren.
  onvolledig: { slug: string; reden: string }[];
};

export class VerrijkingFout extends Error {
  constructor(bestand: string, veld: string, melding: string) {
    super(`${bestand}: veld '${veld}' — ${melding}`);
    this.name = "VerrijkingFout";
  }
}

// Zoekpaden: de app draait vanuit web/, een script soms vanuit de repo-root.
// FONDSEN_VERRIJKING_MAP overschrijft alles (testfixture).
export function verrijkingsMap(): string {
  const uitEnv = process.env.FONDSEN_VERRIJKING_MAP;
  if (uitEnv) return resolve(uitEnv);
  const kandidaten = [
    resolve(process.cwd(), "..", "kennisbank", "Fondsen", "verrijking"),
    resolve(process.cwd(), "kennisbank", "Fondsen", "verrijking"),
  ];
  return kandidaten.find((p) => existsSync(p)) ?? kandidaten[0];
}

export function leesVerrijkingen(map = verrijkingsMap()): VerrijkingLezing {
  if (!existsSync(map)) {
    throw new Error(
      `Verrijkingsmap niet gevonden op '${map}'. Zet FONDSEN_VERRIJKING_MAP.`,
    );
  }
  const bestanden = readdirSync(map)
    .filter((f) => f.endsWith(".json"))
    .sort();

  const fondsen: Verrijking[] = [];
  const onvolledig: { slug: string; reden: string }[] = [];

  for (const bestand of bestanden) {
    const slug = basename(bestand, ".json");
    const mdPad = join(map, `${slug}.md`);
    if (!existsSync(mdPad)) {
      // Race met de schrijvende agents, geen datafout. Volgende ronde weer.
      onvolledig.push({ slug, reden: `${slug}.md ontbreekt nog` });
      continue;
    }
    const md = readFileSync(mdPad, "utf8");
    if (md.trim().length === 0) {
      onvolledig.push({ slug, reden: `${slug}.md is leeg` });
      continue;
    }
    let ruw: unknown;
    const jsonPad = join(map, bestand);
    try {
      ruw = JSON.parse(readFileSync(jsonPad, "utf8"));
    } catch (e) {
      throw new Error(
        `${bestand} is geen geldige JSON: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    fondsen.push(valideerVerrijking(ruw, slug, md, bestand));
  }

  return { fondsen, onvolledig };
}

// ---------------------------------------------------------------------------
// Validatie
// ---------------------------------------------------------------------------

export function valideerVerrijking(
  ruw: unknown,
  slug: string,
  beleidstekst: string,
  bestand = `${slug}.json`,
): Verrijking {
  if (typeof ruw !== "object" || ruw === null || Array.isArray(ruw)) {
    throw new VerrijkingFout(bestand, "(root)", "moet een JSON-object zijn.");
  }
  const r = ruw as Record<string, unknown>;

  const naam = tekst(r.naam, bestand, "naam");
  if (!naam) throw new VerrijkingFout(bestand, "naam", "ontbreekt of is leeg.");

  const bronnen = leesBronnen(r.bronnen, bestand);
  if (bronnen.length === 0) {
    throw new VerrijkingFout(
      bestand,
      "bronnen",
      "minstens één bron is verplicht — zonder vindplaats is de verrijking niet na te lopen.",
    );
  }

  const benaderbaarheid = enumWaarde(
    r.benaderbaarheid ?? "onbekend",
    BENADERBAARHEDEN,
    bestand,
    "benaderbaarheid",
  );
  const notitie = tekst(r.benaderwijze_notitie, bestand, "benaderwijze_notitie");
  // §3 van het implementatieplan: de benaderbaarheid is een poort, en een poort
  // zonder citaat is een mening. Alleen 'onbekend' mag zonder.
  if (benaderbaarheid !== "onbekend" && !notitie) {
    throw new VerrijkingFout(
      bestand,
      "benaderwijze_notitie",
      `benaderbaarheid '${benaderbaarheid}' vereist een letterlijk citaat waarop die berust.`,
    );
  }

  const relevantie = (r.landgoed_relevantie ?? {}) as Record<string, unknown>;
  if (typeof relevantie !== "object" || Array.isArray(relevantie)) {
    throw new VerrijkingFout(bestand, "landgoed_relevantie", "moet een object zijn.");
  }
  const route = enumWaarde(
    relevantie.route ?? "onbekend",
    ROUTES,
    bestand,
    "landgoed_relevantie.route",
  );
  const onderbouwing = tekst(
    relevantie.onderbouwing,
    bestand,
    "landgoed_relevantie.onderbouwing",
  );
  // Een route bepaalt of dit fonds in de stroom komt en wat de gebruiker moet
  // doen. Zonder onderbouwing is dat niet te controleren en niet uit te leggen.
  if (route !== "onbekend" && !onderbouwing) {
    throw new VerrijkingFout(
      bestand,
      "landgoed_relevantie.onderbouwing",
      `route '${route}' vereist een onderbouwing met citaat.`,
    );
  }
  const partnertype = tekst(
    relevantie.partnertype,
    bestand,
    "landgoed_relevantie.partnertype",
  );
  if (route === "via_partner" && !partnertype) {
    throw new VerrijkingFout(
      bestand,
      "landgoed_relevantie.partnertype",
      "bij route 'via_partner' moet staan wat voor organisatie de aanvrager is; " +
        "anders weet de gebruiker wel dát hij een partner nodig heeft, maar niet wat voor een.",
    );
  }

  const bedrag_min = getal(r.bedrag_min, bestand, "bedrag_min");
  const bedrag_max = getal(r.bedrag_max, bestand, "bedrag_max");
  if (bedrag_min !== null && bedrag_max !== null && bedrag_min > bedrag_max) {
    throw new VerrijkingFout(
      bestand,
      "bedrag_min",
      `${bedrag_min} is groter dan bedrag_max ${bedrag_max}.`,
    );
  }

  return {
    slug,
    naam,
    bronnen,
    doelstelling: tekst(r.doelstelling, bestand, "doelstelling"),
    benaderbaarheid,
    benaderwijze_notitie: notitie,
    aanvrager_type: enumWaarde(
      r.aanvrager_type ?? "onbekend",
      AANVRAGER_TYPEN,
      bestand,
      "aanvrager_type",
    ),
    // WERKWIJZE.md schrijft hier `null` voor bij "niet vastgesteld", maar in de
    // praktijk schrijven de agents er ook "onbekend" neer. Dat is dezelfde
    // uitspraak, geen verzonnen waarde — dus gelijkstellen aan null in plaats
    // van er een import op te laten stuklopen.
    geo_niveau:
      r.geo_niveau === null || r.geo_niveau === undefined || r.geo_niveau === "onbekend"
        ? null
        : enumWaarde(r.geo_niveau, GEO_NIVEAUS, bestand, "geo_niveau"),
    geo_waarden: tekstlijst(r.geo_waarden, bestand, "geo_waarden"),
    bedrag_min,
    bedrag_max,
    bedrag_indicatie: tekst(r.bedrag_indicatie, bestand, "bedrag_indicatie"),
    cofinanciering_vereist: boolOfNull(
      r.cofinanciering_vereist,
      bestand,
      "cofinanciering_vereist",
    ),
    uitsluitingen: tekstlijst(r.uitsluitingen, bestand, "uitsluitingen"),
    kostensoort: tekstlijst(r.kostensoort, bestand, "kostensoort").map((k) =>
      enumWaarde(k, KOSTENSOORTEN, bestand, "kostensoort"),
    ),
    landgoed_route: route,
    landgoed_route_reden: onderbouwing,
    landgoed_partnertype: partnertype,
    onderliggende_fondsen: leesOnderliggend(r.onderliggende_fondsen, bestand),
    niet_gevonden: tekstlijst(r.niet_gevonden, bestand, "niet_gevonden"),
    beleidstekst,
    beleidstekst_hash: createHash("sha256").update(beleidstekst).digest("hex"),
    beleidstekst_opgehaald_op: ophaaldatum(beleidstekst),
  };
}

function leesBronnen(ruw: unknown, bestand: string): VerrijkingBron[] {
  if (ruw === undefined || ruw === null) return [];
  if (!Array.isArray(ruw)) {
    throw new VerrijkingFout(bestand, "bronnen", "moet een array zijn.");
  }
  return ruw.map((b, i) => {
    const veld = `bronnen[${i}]`;
    if (typeof b !== "object" || b === null || Array.isArray(b)) {
      throw new VerrijkingFout(bestand, veld, "moet een object zijn.");
    }
    const o = b as Record<string, unknown>;
    const jaar = getal(o.jaar, bestand, `${veld}.jaar`);
    if (jaar !== null && (jaar < 1900 || jaar > 2200 || !Number.isInteger(jaar))) {
      throw new VerrijkingFout(bestand, `${veld}.jaar`, `'${jaar}' is geen jaartal.`);
    }
    return {
      soort: enumWaarde(o.soort, BRONSOORTEN, bestand, `${veld}.soort`),
      url: tekst(o.url, bestand, `${veld}.url`),
      jaar,
      gelezen: boolOfNull(o.gelezen, bestand, `${veld}.gelezen`) ?? false,
    };
  });
}

function leesOnderliggend(ruw: unknown, bestand: string): OnderliggendFonds[] {
  if (ruw === undefined || ruw === null) return [];
  if (!Array.isArray(ruw)) {
    throw new VerrijkingFout(bestand, "onderliggende_fondsen", "moet een array zijn.");
  }
  return ruw.map((f, i) => {
    const veld = `onderliggende_fondsen[${i}]`;
    if (typeof f !== "object" || f === null || Array.isArray(f)) {
      throw new VerrijkingFout(bestand, veld, "moet een object zijn.");
    }
    const o = f as Record<string, unknown>;
    const naam = tekst(o.naam, bestand, `${veld}.naam`);
    if (!naam) throw new VerrijkingFout(bestand, `${veld}.naam`, "ontbreekt of is leeg.");
    return {
      naam,
      relevant: boolOfNull(o.relevant, bestand, `${veld}.relevant`),
      reden: tekst(o.reden, bestand, `${veld}.reden`),
    };
  });
}

function enumWaarde<T extends readonly string[]>(
  waarde: unknown,
  toegestaan: T,
  bestand: string,
  veld: string,
): T[number] {
  if (typeof waarde !== "string" || !toegestaan.includes(waarde)) {
    throw new VerrijkingFout(
      bestand,
      veld,
      `'${String(waarde)}' is geen toegestane waarde. Toegestaan: ${toegestaan.join(", ")}.`,
    );
  }
  return waarde as T[number];
}

function tekst(waarde: unknown, bestand: string, veld: string): string | null {
  if (waarde === undefined || waarde === null) return null;
  if (typeof waarde !== "string") {
    throw new VerrijkingFout(bestand, veld, `moet tekst zijn, kreeg ${typeof waarde}.`);
  }
  const t = waarde.trim();
  return t.length ? t : null;
}

function tekstlijst(waarde: unknown, bestand: string, veld: string): string[] {
  if (waarde === undefined || waarde === null) return [];
  if (!Array.isArray(waarde)) {
    throw new VerrijkingFout(bestand, veld, "moet een array van teksten zijn.");
  }
  return waarde.map((w, i) => {
    const t = tekst(w, bestand, `${veld}[${i}]`);
    if (!t) throw new VerrijkingFout(bestand, `${veld}[${i}]`, "is leeg.");
    return t;
  });
}

function getal(waarde: unknown, bestand: string, veld: string): number | null {
  if (waarde === undefined || waarde === null || waarde === "") return null;
  const n = typeof waarde === "number" ? waarde : Number(waarde);
  if (!Number.isFinite(n)) {
    throw new VerrijkingFout(bestand, veld, `'${String(waarde)}' is geen getal.`);
  }
  return n;
}

function boolOfNull(waarde: unknown, bestand: string, veld: string): boolean | null {
  if (waarde === undefined || waarde === null) return null;
  if (typeof waarde !== "boolean") {
    throw new VerrijkingFout(
      bestand,
      veld,
      `moet true/false/null zijn (null = niet gepubliceerd), kreeg '${String(waarde)}'.`,
    );
  }
  return waarde;
}

// De .md-bestanden zetten de ophaaldatum in de kop ("Ophaaldatum: 2026-08-05"
// of "Bronnen (opgehaald 2026-08-05)"). Niet gevonden = null, niet gokken.
export function ophaaldatum(md: string): string | null {
  const kop = md.slice(0, 2000);
  const m =
    kop.match(/[Oo]phaaldatum[^0-9]{0,20}(\d{4}-\d{2}-\d{2})/) ??
    kop.match(/opgehaald[^0-9]{0,20}(\d{4}-\d{2}-\d{2})/i) ??
    kop.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Naamsleutel: verrijkingsbestand -> catalogusrij
// ---------------------------------------------------------------------------
// De verrijkingsagents schrijven de naam zoals het fonds zichzelf noemt
// ("Stichting Ars Donandi (koepelstichting fondsen op naam)"), de catalogus
// draagt de naam uit de export ("Ars Donandi (koepelstichting fondsen op
// naam)"). Genormaliseerd komen die op hetzelfde uit: haakjes weg, diakrieten
// weg, en de woorden die bij bijna elk fonds staan (stichting, fonds,
// foundation, lidwoorden) eruit, zodat alleen de eigennaam overblijft. De
// tokens worden gesorteerd zodat woordvolgorde niet uitmaakt.
const GENERIEK = new Set([
  "stichting",
  "stichtingen",
  "fonds",
  "fondsen",
  "fund",
  "foundation",
  "de",
  "het",
  "een",
  "en",
  "van",
  "voor",
]);

export function naamSleutel(naam: string): string {
  const kaal = naam
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const tokens = kaal.split(/\s+/).filter((t) => t && !GENERIEK.has(t));
  // Alles generiek (bv. "Het Fonds")? Dan de kale naam gebruiken; een lege
  // sleutel zou op elke andere lege sleutel matchen.
  return (tokens.length ? tokens : kaal.split(/\s+/)).slice().sort().join(" ");
}

// ---------------------------------------------------------------------------
// Matchbaarheid (0-100)
// ---------------------------------------------------------------------------
// Hoeveel we van deze bron WETEN — bewust een ander getal dan de matchscore
// (§5 van het implementatieplan). Bewust simpel en met de hand na te rekenen;
// drie optellingen, geen weging die niemand kan uitleggen.
//
//   herkomst        max 40  geverifieerd_bron 40 | handmatig 30 | afgeleid_tag 10
//                           | ai_voorstel/ai/import 5
//   gelezen bronnen max 30  10 per GELEZEN bron, +5 per bron die dieper gaat dan
//                           een website (beleidsplan, jaarverslag, jaarrekening,
//                           statuten, aanvraagvoorwaarden, telefonisch contact)
//   kernvelden      max 30  30 * (aantal gevulde kernvelden / 8)
//
// De acht kernvelden zijn de velden waarop de poort en de match straks draaien:
// benaderbaarheid, aanvrager_type, geo_niveau, bedrag (min|max|indicatie),
// cofinanciering_vereist, kostensoort, uitsluitingen, landgoed_route.
// 'onbekend', null en de lege lijst tellen niet mee — dat is precies het punt.
//
// IJkpunten: een fonds met alleen een sector-tag en niets anders komt op 10;
// een volledig verrijkt fonds met beleidsplan + website + voorwaarden op 100.

export const MATCHBAARHEID_KERNVELDEN = 8;

const HERKOMST_PUNTEN: Record<string, number> = {
  geverifieerd_bron: 40,
  handmatig: 30,
  afgeleid_tag: 10,
  ai_voorstel: 5,
  ai: 5,
  import: 5,
};

const DIEPE_BRONNEN = new Set<Bronsoort>([
  "beleidsplan",
  "jaarverslag",
  "jaarrekening",
  "statuten",
  "aanvraagvoorwaarden",
  "telefonisch_contact",
]);

export type MatchbaarheidInvoer = {
  herkomst: string;
  bronnen: { soort: Bronsoort; gelezen: boolean }[];
  kernveldenGevuld: number; // 0..MATCHBAARHEID_KERNVELDEN
};

export function berekenMatchbaarheid(invoer: MatchbaarheidInvoer): number {
  const herkomst = HERKOMST_PUNTEN[invoer.herkomst] ?? 0;

  const gelezen = invoer.bronnen.filter((b) => b.gelezen);
  const bronpunten = Math.min(
    30,
    gelezen.length * 10 + gelezen.filter((b) => DIEPE_BRONNEN.has(b.soort)).length * 5,
  );

  const gevuld = Math.max(0, Math.min(MATCHBAARHEID_KERNVELDEN, invoer.kernveldenGevuld));
  const veldpunten = Math.round((30 * gevuld) / MATCHBAARHEID_KERNVELDEN);

  return Math.max(0, Math.min(100, herkomst + bronpunten + veldpunten));
}

// Telt de kernvelden die na samenvoeging met de bestaande rij gevuld zijn.
// Werkt op een platte weergave zodat zowel de verrijking als de databaserij
// hier doorheen kan.
export type Kernvelden = {
  benaderbaarheid?: string | null;
  aanvrager_type?: string | null;
  geo_niveau?: string | null;
  bedrag_min?: number | null;
  bedrag_max?: number | null;
  bedrag_indicatie?: string | null;
  cofinanciering_vereist?: boolean | null;
  kostensoort?: string[] | null;
  uitsluitingen_aantal?: number;
  landgoed_route?: string | null;
};

export function telKernvelden(k: Kernvelden): number {
  let n = 0;
  if (gevuldEnum(k.benaderbaarheid)) n++;
  if (gevuldEnum(k.aanvrager_type)) n++;
  if (gevuldEnum(k.geo_niveau)) n++;
  if (k.bedrag_min != null || k.bedrag_max != null || (k.bedrag_indicatie ?? "") !== "") n++;
  if (k.cofinanciering_vereist != null) n++;
  if ((k.kostensoort ?? []).length > 0) n++;
  if ((k.uitsluitingen_aantal ?? 0) > 0) n++;
  if (gevuldEnum(k.landgoed_route)) n++;
  return n;
}

// 'onbekend' is een echte waarde in de database, maar geen kennis.
function gevuldEnum(waarde: string | null | undefined): boolean {
  return waarde != null && waarde !== "" && waarde !== "onbekend";
}
