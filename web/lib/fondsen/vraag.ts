import type { Projectstatus, Vraag } from "./poort";

// HET VRAAGVELD — fase 3, §6 bron A van het implementatieplan.
//
// Vijf korte vragen plus één tekstveld. De vragen zijn er niet om een formulier
// te vullen maar om de harde poorten te voeden: elk antwoord vertaalt naar een
// parameter van `Vraag` in lib/fondsen/poort.ts, of naar een weegfactor in
// lib/fondsen/weging.ts.
//
// DRIE REGELS DIE HIER DWINGEND ZIJN
//   1. Elke vraag mag onbeantwoord blijven ("weet ik nog niet"). Een
//      onbeantwoorde vraag leidt NOOIT tot afwijzing — alleen tot een minder
//      scherp resultaat. Daarom is elk veld nullable en toetst de poort een
//      parameter die null is domweg niet.
//   2. Vraag 2 (waar staat het plan nu) is de belangrijkste. Vrijwel geen enkel
//      fonds financiert met terugwerkende kracht; vanaf `gegund` hoort het
//      systeem te zeggen "hiervoor bent u te laat, en waarom" in plaats van een
//      lijst kansen te tonen. Dat gebeurt vóór enige modelaanroep — zie
//      `isTeLaat` en de vroege uitgang in lib/fondsen/zoek.ts.
//   3. Niets hierin wordt geraden. "Weet ik nog niet" wordt niet stilletjes
//      ingevuld met de meest waarschijnlijke waarde.

// ── Vraag 1 — wat gaat u doen? ─────────────────────────────────────────────
export const DOELEN = [
  "restauratie",
  "natuurherstel",
  "herbestemming",
  "publiek_openstellen",
  "onderzoek",
  "anders",
] as const;
export type Doel = (typeof DOELEN)[number];

export const DOEL_LABELS: Record<Doel, string> = {
  restauratie: "restauratie",
  natuurherstel: "natuurherstel",
  herbestemming: "herbestemming",
  publiek_openstellen: "publiek openstellen",
  onderzoek: "onderzoek",
  anders: "iets anders",
};

// Het doel vertaalt naar een kostensoort, want dát is wat de poort toetst
// (§9.2). Alleen waar de vertaling ondubbelzinnig is; "anders" vertaalt naar
// niets, en dan wordt de kostensoortpoort niet getoetst.
export const DOEL_KOSTENSOORT: Record<Doel, string | null> = {
  restauratie: "restauratie",
  natuurherstel: "investering",
  herbestemming: "investering",
  publiek_openstellen: "investering",
  onderzoek: "onderzoek",
  anders: null,
};

// Woorden waarmee laag 2 thematische overlap meet tegen `themas`/`trefwoorden`
// van een fonds. Bewust letterlijke woorden uit de catalogus, geen synoniemen
// die we hopen tegen te komen.
export const DOEL_THEMAWOORDEN: Record<Doel, string[]> = {
  restauratie: ["monument", "erfgoed", "restauratie", "cultuurhistorie", "gebouw", "kasteel", "buitenplaats"],
  natuurherstel: ["natuur", "landschap", "biodiversiteit", "bos", "water", "ecologie", "herstel"],
  herbestemming: ["herbestemming", "erfgoed", "monument", "leefbaarheid", "gebouw", "sociaal"],
  publiek_openstellen: ["educatie", "publiek", "openstelling", "recreatie", "toegankelijkheid", "samenleving"],
  onderzoek: ["onderzoek", "wetenschap", "kennis", "documentatie", "archief"],
  anders: [],
};

// ── Vraag 2 — waar staat het plan nu? ──────────────────────────────────────
// Hergebruikt PROJECTSTATUSSEN uit poort.ts; hier alleen de labels en de vraag
// of dit te laat is.
export const STATUS_LABELS: Record<Projectstatus, string> = {
  idee: "het is nog een idee",
  in_voorbereiding: "in voorbereiding",
  gegund: "offerte gegund / opdracht verstrekt",
  gestart: "we zijn al begonnen",
  afgerond: "het werk is af",
};

// Tussenstap die geen eigen poortwaarde heeft: een offerte AANvragen is precies
// het moment waarop financiering nog kan (§6: "het systeem moet aanslaan als
// iemand een offerte opvraagt, niet als de factuur binnenkomt"). Het telt dus
// als `in_voorbereiding` en niet als `gegund`.
export const OFFERTE_AANGEVRAAGD = "offerte_aangevraagd";
export type Planfase = Projectstatus | typeof OFFERTE_AANGEVRAAGD;

export const PLANFASEN: Planfase[] = [
  "idee",
  "in_voorbereiding",
  OFFERTE_AANGEVRAAGD,
  "gegund",
  "gestart",
  "afgerond",
];

export const PLANFASE_LABELS: Record<string, string> = {
  ...STATUS_LABELS,
  [OFFERTE_AANGEVRAAGD]: "offerte aangevraagd",
};

export function naarProjectstatus(fase: Planfase | null): Projectstatus | null {
  if (fase === null) return null;
  if (fase === OFFERTE_AANGEVRAAGD) return "in_voorbereiding";
  return fase;
}

export const TE_LAAT_FASEN: Planfase[] = ["gegund", "gestart", "afgerond"];

export function isTeLaat(fase: Planfase | null): boolean {
  return fase !== null && TE_LAAT_FASEN.includes(fase);
}

// ── Vraag 3 — orde van grootte ─────────────────────────────────────────────
export const BEDRAGBANDEN = ["tot_10k", "10_50k", "50_250k", "meer"] as const;
export type Bedragband = (typeof BEDRAGBANDEN)[number];

export const BEDRAGBAND_LABELS: Record<Bedragband, string> = {
  tot_10k: "minder dan € 10.000",
  "10_50k": "€ 10.000 – € 50.000",
  "50_250k": "€ 50.000 – € 250.000",
  meer: "meer dan € 250.000",
};

// Een band, geen bedrag. Zie de toelichting bij `bedrag_van`/`bedrag_tot` in
// poort.ts: een band op zijn midden toetsen zou fondsen laten afvallen op een
// precisie die de gebruiker nooit opgaf.
export const BEDRAGBAND_GRENZEN: Record<Bedragband, { van: number; tot: number | null }> = {
  tot_10k: { van: 0, tot: 10_000 },
  "10_50k": { van: 10_000, tot: 50_000 },
  "50_250k": { van: 50_000, tot: 250_000 },
  meer: { van: 250_000, tot: null },
};

// ── Vraag 4 — wie zou aanvragen? ───────────────────────────────────────────
export const AANVRAGERS = ["landgoed", "stichting", "partner"] as const;
export type Aanvrager = (typeof AANVRAGERS)[number];

export const AANVRAGER_LABELS: Record<Aanvrager, string> = {
  landgoed: "het landgoed zelf",
  stichting: "een stichting",
  partner: "een partner",
};

// ── Vraag 5 — komt er publiek bij? ─────────────────────────────────────────
export const PUBLIEK_OPTIES = ["structureel", "incidenteel", "nee"] as const;
export type Publiek = (typeof PUBLIEK_OPTIES)[number];

export const PUBLIEK_LABELS: Record<Publiek, string> = {
  structureel: "ja, structureel",
  incidenteel: "ja, incidenteel",
  nee: "nee",
};

// ── De antwoorden bij elkaar ───────────────────────────────────────────────
export type Antwoorden = {
  // Het plan in eigen woorden. Mag leeg zijn; dan draait alleen de poort plus
  // de gestructureerde weging en blijft de semantische laag achterwege — zonder
  // vraag valt er niets semantisch te matchen.
  plan: string;
  doel: Doel | null;
  fase: Planfase | null;
  bedragband: Bedragband | null;
  aanvrager: Aanvrager | null;
  publiek: Publiek | null;
};

export const LEGE_ANTWOORDEN: Antwoorden = {
  plan: "",
  doel: null,
  fase: null,
  bedragband: null,
  aanvrager: null,
  publiek: null,
};

// Maximale lengte van de vrije tekst. Een geplakt beheerplan is een uploadvraag
// (§6, bron B), geen zoekterm — dit veld is voor een paar zinnen.
export const MAX_PLAN_TEKENS = 2000;

function keuze<T extends string>(waarde: unknown, toegestaan: readonly T[]): T | null {
  return typeof waarde === "string" && (toegestaan as readonly string[]).includes(waarde)
    ? (waarde as T)
    : null;
}

// Leest de antwoorden uit een FormData of een gewoon object. Alles wat niet
// herkend wordt (inclusief het letterlijke "weet ik nog niet") wordt null, en
// null betekent: deze poort niet toetsen.
export function leesAntwoorden(bron: {
  get(naam: string): FormDataEntryValue | null;
}): Antwoorden {
  const tekst = (naam: string) => {
    const v = bron.get(naam);
    return typeof v === "string" ? v : null;
  };
  return {
    plan: (tekst("plan") ?? "").trim().slice(0, MAX_PLAN_TEKENS),
    doel: keuze(tekst("doel"), DOELEN),
    fase: keuze(tekst("fase"), PLANFASEN),
    bedragband: keuze(tekst("bedragband"), BEDRAGBANDEN),
    aanvrager: keuze(tekst("aanvrager"), AANVRAGERS),
    publiek: keuze(tekst("publiek"), PUBLIEK_OPTIES),
  };
}

// De vertaling naar de poortparameters. Dit is de enige plek waar antwoorden
// harde filters worden; alles wat hier null blijft wordt niet getoetst.
export function naarPoortvraag(a: Antwoorden): Vraag {
  const band = a.bedragband ? BEDRAGBAND_GRENZEN[a.bedragband] : null;
  return {
    projectstatus: naarProjectstatus(a.fase),
    kostensoort: a.doel ? DOEL_KOSTENSOORT[a.doel] : null,
    bedrag_van: band?.van ?? null,
    bedrag_tot: band?.tot ?? null,
  };
}

// Hoeveel van de vijf vragen zijn beantwoord? Voedt de uitleg bij een mager
// resultaat ("u liet drie vragen open; daardoor is dit minder scherp") — een
// eerlijker boodschap dan een lijst met een verzonnen zekerheid.
export function aantalBeantwoord(a: Antwoorden): number {
  return [a.doel, a.fase, a.bedragband, a.aanvrager, a.publiek].filter((v) => v !== null).length;
}

// Antwoorden in één leesbare regel, voor de prompt en voor het scherm.
export function vraagSamenvatting(a: Antwoorden): string {
  const delen: string[] = [];
  delen.push(`Wat: ${a.doel ? DOEL_LABELS[a.doel] : "nog niet opgegeven"}`);
  delen.push(`Fase: ${a.fase ? PLANFASE_LABELS[a.fase] : "nog niet opgegeven"}`);
  delen.push(
    `Orde van grootte: ${a.bedragband ? BEDRAGBAND_LABELS[a.bedragband] : "nog niet opgegeven"}`,
  );
  delen.push(`Aanvrager: ${a.aanvrager ? AANVRAGER_LABELS[a.aanvrager] : "nog niet opgegeven"}`);
  delen.push(`Publiek: ${a.publiek ? PUBLIEK_LABELS[a.publiek] : "nog niet opgegeven"}`);
  return delen.join(" · ");
}
