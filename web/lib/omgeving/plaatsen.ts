// Van vrije tekst naar een punt op de kaart.
//
// Bekendmakingen dragen geen geometrie: de locatie staat als vrije tekst in de
// titel ("Aanvraag omgevingsvergunning Torentrans 107, 4336 JN Middelburg").
// Dit bestand haalt daar een adres of gebiedsnaam uit en geocodeert dat via de
// PDOK Locatieserver, die direct RD-coördinaten teruggeeft.
//
// Twee dingen die hier misgaan als je niet oplet:
//
//  1. De Locatieserver vindt ALTIJD iets. "Bevoegdhedenbesluit 2026" levert
//     zonder filter een woonplaats in Friesland op. Daarom wordt elke zoekactie
//     begrensd op de gemeente van het publicerende bestuursorgaan.
//  2. Een treffer op straatniveau is iets anders dan een treffer op huisnummer.
//     Dat verschil wordt vastgelegd als geo_niveau, zodat de UI het kan tonen
//     en niemand een straatgok voor een adres aanziet.

const LOCATIESERVER =
  "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";
const TIMEOUT_MS = 15000;

/** Geo-niveau volgens de precisieladder uit het moduleplan. */
export type GeoNiveau = 2 | 4 | 5;

export type Plaatsing = {
  niveau: GeoNiveau;
  /** RD-coördinaten (EPSG:28992). */
  x: number;
  y: number;
  /** Wat de Locatieserver ervan maakte — de verantwoording naar de gebruiker. */
  weergavenaam: string;
  /** "adres" | "weg" | "woonplaats" | ... */
  soort: string;
  score: number;
  /** De tekst waarop gezocht is; maakt een foute plaatsing navolgbaar. */
  zoekterm: string;
};

const POSTCODE = /\b\d{4}\s?[A-Z]{2}\b/;

// Vaste openingszinnen van bekendmakingen. Wat hierna komt is in de praktijk
// de locatie — "Aanvraag omgevingsvergunning reguliere procedure Torentrans
// 107" laat na het strippen precies het adres over.
const AANHEF = new RegExp(
  "^(?:" +
    [
      "aanvraag",
      "aanvragen",
      "verleende?",
      "geweigerde?",
      "ingetrokken",
      "ontwerp",
      "vastgesteld[e]?",
      "kennisgeving",
      "melding",
      "mededeling",
      "toestemming(?:\\s+voor)?",
      "besluit",
      "besluiten",
      "bekendmaking",
      "terinzagelegging",
      "inspraak",
      "voornemen(?:\\s+tot)?",
      "omgevingsvergunning",
      "omgevingsmelding",
      "reguliere\\s+procedure",
      "uitgebreide\\s+procedure",
      "verlengde?\\s+beslistermijn",
      "het\\s+realiseren\\s+van",
      "realiseren",
      "bouwen\\s+van",
      "kappen\\s+van",
      "een|de|het|voor|van|te|aan|op",
    ].join("|") +
    ")\\b[\\s,:-]*",
  "i",
);

/**
 * Maakt van een titel een zoekterm voor de geocoder.
 *
 * Bewust géén lijst van straatnaam-achtervoegsels: die werkt niet. "Park
 * Toorenvliedt", "Hof ter Veste" en "Slaak" zijn echte Middelburgse
 * straatnamen zonder -weg of -laan, en een suffixlijst mist die allemaal.
 * In plaats daarvan wordt de boilerplate weggestript en beslist de
 * Locatieserver — begrensd op de gemeente — of er iets van te maken valt.
 * Dat verplaatst het oordeel naar de partij die de straatnamen écht kent.
 *
 * Geeft null terug als er na het strippen niets bruikbaars overblijft.
 */
export function locatieUitTekst(titel: string): { term: string; verwacht: GeoNiveau } | null {
  const pc = titel.match(POSTCODE);
  if (pc) {
    // Met een postcode is de staart van de titel het meest bruikbaar: daar
    // staan straat, nummer, postcode en plaats bij elkaar.
    const vanaf = Math.max(0, titel.indexOf(pc[0]) - 60);
    return { term: titel.slice(vanaf).trim(), verwacht: 2 };
  }

  // Boilerplate herhaald wegstrippen tot er iets overblijft dat geen aanhef is.
  let rest = titel.trim();
  for (let i = 0; i < 8; i++) {
    const korter = rest.replace(AANHEF, "").trim();
    if (korter === rest) break;
    rest = korter;
  }

  // Wat overblijft moet nog ergens op lijken: minstens twee tekens en een
  // hoofdletter of cijfer. Anders is er geen locatie-aanduiding.
  if (rest.length < 3 || !/[A-Z]|\d/.test(rest)) return null;

  // Zonder cijfer én zonder hoofdletter-woord is het geen plaatsnaam maar
  // beleidstaal ("basisregistratie personen").
  if (!/\b[A-Z]/.test(rest)) return null;

  const heeftNummer = /\d/.test(rest);
  return { term: rest, verwacht: heeftNummer ? 2 : 4 };
}

function parseRd(punt: unknown): { x: number; y: number } | null {
  const m = String(punt ?? "").match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/);
  if (!m) return null;
  const x = Number(m[1]);
  const y = Number(m[2]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

// Onder deze score is een treffer niet te vertrouwen. Geijkt op een echte
// maand Middelburg: goede adressen scoren 27, straatnamen 19-25, en een
// willekeurige woonplaats-gok blijft onder de 12.
const MINIMALE_SCORE = 13;

/**
 * Geocodeert een tekst binnen één gemeente.
 * `gemeente` is verplicht: zonder die begrenzing plaatst de Locatieserver
 * onzin ergens in Nederland en lijkt dat een geldige treffer.
 */
export async function geocodeer(
  term: string,
  gemeente: string,
): Promise<Plaatsing | null> {
  const params = new URLSearchParams({
    q: term,
    rows: "1",
    fl: "weergavenaam,type,score,centroide_rd,gemeentenaam",
    fq: `gemeentenaam:"${gemeente.replace(/"/g, "")}"`,
  });

  const res = await fetch(`${LOCATIESERVER}?${params}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Locatieserver: HTTP ${res.status}`);

  const json = (await res.json()) as {
    response?: { docs?: Record<string, unknown>[] };
  };
  const doc = json.response?.docs?.[0];
  if (!doc) return null;

  const punt = parseRd(doc.centroide_rd);
  const score = Number(doc.score ?? 0);
  if (!punt || score < MINIMALE_SCORE) return null;

  const soort = String(doc.type ?? "");
  const niveau: GeoNiveau =
    soort === "adres" || soort === "postcode" ? 2 : soort === "weg" ? 4 : 5;

  return {
    niveau,
    x: punt.x,
    y: punt.y,
    weergavenaam: String(doc.weergavenaam ?? term),
    soort,
    score: Math.round(score * 10) / 10,
    zoekterm: term,
  };
}

export type PlaatsingUitkomst =
  | { status: "geplaatst"; plaatsing: Plaatsing }
  /** Wel een locatie-aanduiding gevonden, maar niet te geocoderen. */
  | { status: "onplaatsbaar"; term: string }
  /** Geen enkele locatie-aanduiding in de tekst. */
  | { status: "geen_locatie" };

/** De hele keten: tekst -> aanduiding -> coördinaat. */
export async function plaatsBericht(
  titel: string,
  gemeente: string,
): Promise<PlaatsingUitkomst> {
  const gevonden = locatieUitTekst(titel);
  if (!gevonden) return { status: "geen_locatie" };

  const plaatsing = await geocodeer(gevonden.term, gemeente);
  if (!plaatsing) return { status: "onplaatsbaar", term: gevonden.term };

  return { status: "geplaatst", plaatsing };
}
