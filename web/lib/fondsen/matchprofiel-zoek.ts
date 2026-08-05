import type { SupabaseClient } from "@supabase/supabase-js";

// Full-text zoeken over de matchprofielen — de gratis voorselectie.
//
// WAAROM DIT VOOR HET MODEL KOMT
// Zoekt iemand op "molen", "poel" of "hakhout", dan is dat geen vraag waar een
// model aan te pas hoeft te komen: de database weet zelf welke profielen dat woord
// bevatten. De gegenereerde `zoektekst`-kolom (migratie 0053) plus de GIN-index
// beantwoorden dat in één indexlookup, met het Nederlandse woordenboek zodat
// "molens" ook op "molen" matcht.
//
// Het model houdt daarmee alleen over wat met woorden NIET te beantwoorden is
// ("past dit fonds bij een landgoed dat zijn parkbos wil herstellen?"). Dat is
// tegelijk de best uitlegbare voorselectie die er is: je kunt de gebruiker
// letterlijk laten zien wélk woord in wélk profiel gevonden is.
//
// Dit bestand levert alleen de zoekstap. De vraagstelling zelf (fase 3) bouwt
// hierop voort; de haak is bewust nu al af zodat die daar niets meer hoeft te
// bedenken over query-opbouw.

// Kolom uit migratie 0053: setweight(kaartje,'A') || setweight(profiel,'B').
export const ZOEKKOLOM = "zoektekst";
// Moet gelijk zijn aan de configuratie in de gegenereerde kolom, anders zoekt de
// query met andere stemming dan waarmee geïndexeerd is en vindt hij niets.
export const ZOEK_CONFIG = "dutch";

// Normaliseert wat een gebruiker intypt tot iets dat `websearch_to_tsquery` aankan.
//
// websearch_to_tsquery is bewust gekozen boven to_tsquery: het slikt gewone
// mensentaal (spaties = EN, "aanhalingstekens" = frase, - = NIET) en het kan niet
// crashen op rare invoer. Wat hier nog gebeurt is alleen opruimen:
//   * losse leestekens die als operator worden gelezen eruit;
//   * dubbele aanhalingstekens die niet in paren staan eruit — een openstaande frase
//     laat Postgres de rest van de zin als één term lezen en dan vind je niets;
//   * begrenzen op lengte, zodat een geplakt beleidsplan geen query wordt.
export const MAX_ZOEKTERM_TEKENS = 200;

export function bouwZoekterm(vraag: string): string | null {
  let t = (vraag ?? "").normalize("NFC").slice(0, MAX_ZOEKTERM_TEKENS);
  // Aanhalingstekens alleen behouden als ze in paren staan.
  const aantal = (t.match(/"/g) ?? []).length;
  if (aantal % 2 === 1) t = t.replace(/"/g, " ");
  // Tekens die websearch_to_tsquery als operator leest maar die uit gewone invoer
  // vrijwel altijd per ongeluk komen.
  t = t.replace(/[()\\:*&|!<>]/g, " ");
  // Een losse min is 'niet'; midden in een woord (hoog-holt) hoort hij te blijven.
  t = t.replace(/(^|\s)-+(\s|$)/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t.length ? t : null;
}

export type ZoekTreffer = {
  regeling_id: string;
  kaartje: string | null;
  profiel: string;
};

export type ZoekOpties = {
  // Hoeveel fondsen maximaal terug. De poort (0055) levert er ~100; deze stap is
  // bedoeld om dáár doorheen te snijden, niet om er nog eens 100 bij te zoeken.
  limiet?: number;
  // Alleen binnen deze regeling-ids zoeken (de fondsen die door de poort kwamen).
  regelingIds?: string[];
  // Alleen door een mens vastgestelde profielen. Standaard false: in fase 1 is er
  // nog niets geaccordeerd en dan zou de zoekstap altijd leeg teruggeven.
  alleenGeaccordeerd?: boolean;
};

// Zoekt op woorden in kaartje + profiel. Geeft een lege lijst bij een lege vraag —
// bewust géén "dan maar alles": een zoekstap die stilletjes de hele catalogus
// teruggeeft is precies hoe de kosten weer oplopen.
export async function zoekMatchprofielen(
  db: SupabaseClient,
  vraag: string,
  opties: ZoekOpties = {},
): Promise<ZoekTreffer[]> {
  const term = bouwZoekterm(vraag);
  if (!term) return [];

  let q = db
    .from("regeling_matchprofiel")
    .select("regeling_id, kaartje, profiel")
    .textSearch(ZOEKKOLOM, term, { type: "websearch", config: ZOEK_CONFIG });

  if (opties.regelingIds?.length) q = q.in("regeling_id", opties.regelingIds);
  if (opties.alleenGeaccordeerd) q = q.eq("geaccordeerd", true);
  q = q.limit(opties.limiet ?? 100);

  const { data, error } = await q;
  if (error) throw new Error(`Zoeken in matchprofielen mislukt: ${error.message}`);
  return (data ?? []) as unknown as ZoekTreffer[];
}
