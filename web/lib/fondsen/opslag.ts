import type { SupabaseClient } from "@supabase/supabase-js";
import type { Landgoedprofiel } from "./poort";
import { legeKosten, type Kostenoverzicht } from "./kosten";
import { LEGE_ANTWOORDEN, type Antwoorden } from "./vraag";
import {
  RANGSCHIK_MODEL,
  vraagHash,
  zoek,
  type Catalogus,
  type ZoekOpties,
  type ZoekUitkomst,
} from "./zoek";

// DE OPSLAG — dezelfde vraag wordt niet twee keer betaald (fase 3, §5).
//
// Een zoekopdracht kost twee modelaanroepen. Stelt iemand dezelfde vraag over
// hetzelfde landgoed tegen dezelfde catalogus, dan is het antwoord per definitie
// hetzelfde antwoord; dat opnieuw laten uitrekenen kost geld en tijd zonder dat
// er iets tegenover staat.
//
// DE HASH IS DE HELE TRUC. Hij gaat over (vraag + landgoedprofiel +
// catalogusversie) — zie `vraagHash` in zoek.ts. Alle drie horen erin:
//   * verandert de vraag        → ander antwoord;
//   * verandert het landgoed    → andere poortuitkomst, dus ander antwoord;
//   * verandert de catalogus    → er kan een fonds bij gekomen zijn dat wint.
// Wat er NIET in zit is de tijd. Een bewaarde uitkomst veroudert niet vanzelf:
// alles wat hem kan laten verouderen zit al in de hash. Een vervaltermijn zou
// alleen maar herberekeningen kosten die niets nieuws opleveren.
//
// EEN CACHE DIE STIL FAALT IS ERGER DAN GEEN CACHE. Lukt het lezen of schrijven
// niet (RLS, ontbrekende tabel omdat 0056 nog niet is toegepast), dan gaat de
// zoekopdracht gewoon door en wordt de fout gelogd. Nooit de pagina laten
// klappen op een besparing.

export const ZOEKOPDRACHT_TABEL = "fondsen_zoekopdracht";

export type BewaardeZoekopdracht = {
  uitkomst: ZoekUitkomst;
  gemaakt_op: string;
  // True als deze uitkomst uit de opslag kwam in plaats van vers berekend. Dit
  // hoort op het scherm te staan: de gebruiker mag zien dat hij naar een
  // bewaard antwoord kijkt en hoe oud het is.
  uit_opslag: boolean;
};

type Rij = {
  vraag_hash: string;
  catalogusversie: string;
  vraag: unknown;
  uitkomst: unknown;
  trechter: unknown;
  kosten: unknown;
  te_laat: boolean;
  model_gebruikt: boolean;
  gemaakt_op: string;
};

// Wat er in `uitkomst` jsonb gaat. Bewust niet de hele ZoekUitkomst: de vraag,
// de trechter en de kosten hebben hun eigen kolom, zodat er zonder jsonb-gegraaf
// op te zoeken en te sommeren is.
type UitkomstJson = {
  fondsen: ZoekUitkomst["fondsen"];
  wat_zou_helpen: string[];
  te_laat: ZoekUitkomst["te_laat"];
  toelichting: string;
};

function alsAntwoorden(v: unknown): Antwoorden {
  const o = (v ?? {}) as Partial<Antwoorden>;
  return { ...LEGE_ANTWOORDEN, ...o, plan: typeof o.plan === "string" ? o.plan : "" };
}

// ---------------------------------------------------------------------------
// Lezen
// ---------------------------------------------------------------------------

export async function leesZoekopdracht(
  db: SupabaseClient,
  landgoedId: string,
  hash: string,
): Promise<BewaardeZoekopdracht | null> {
  const { data, error } = await db
    .from(ZOEKOPDRACHT_TABEL)
    .select("vraag_hash, catalogusversie, vraag, uitkomst, trechter, kosten, te_laat, model_gebruikt, gemaakt_op")
    .eq("landgoed_id", landgoedId)
    .eq("vraag_hash", hash)
    .maybeSingle();

  if (error) {
    console.error(`[fondsen-opslag] lezen mislukt: ${error.message}`);
    return null;
  }
  if (!data) return null;

  const r = data as unknown as Rij;
  const u = (r.uitkomst ?? {}) as Partial<UitkomstJson>;
  return {
    uit_opslag: true,
    gemaakt_op: r.gemaakt_op,
    uitkomst: {
      landgoed_id: landgoedId,
      vraag_hash: r.vraag_hash,
      catalogusversie: r.catalogusversie,
      antwoorden: alsAntwoorden(r.vraag),
      te_laat: u.te_laat ?? null,
      fondsen: u.fondsen ?? [],
      wat_zou_helpen: u.wat_zou_helpen ?? [],
      trechter: r.trechter as ZoekUitkomst["trechter"],
      // DE KOSTEN VAN EEN HERGEBRUIKTE VRAAG ZIJN NUL, NIET DE OUDE KOSTEN.
      // Wat het destijds kostte staat in de rij en blijft daar; wat déze
      // zoekopdracht kostte is niets, en dat is precies wat de opslag moet
      // laten zien.
      kosten: legeKosten(),
      model_gebruikt: r.model_gebruikt,
      toelichting: u.toelichting ?? "",
    },
  };
}

// De kosten zoals ze bij het oorspronkelijke antwoord zijn vastgelegd. Apart
// opvraagbaar, want voor de verantwoording ("wat kost een zoekopdracht?") heb je
// juist het oude cijfer nodig, niet de nul van vandaag.
export async function leesEersteKosten(
  db: SupabaseClient,
  landgoedId: string,
  hash: string,
): Promise<Kostenoverzicht | null> {
  const { data, error } = await db
    .from(ZOEKOPDRACHT_TABEL)
    .select("kosten")
    .eq("landgoed_id", landgoedId)
    .eq("vraag_hash", hash)
    .maybeSingle();
  if (error || !data) return null;
  return ((data as { kosten: unknown }).kosten ?? null) as Kostenoverzicht | null;
}

// ---------------------------------------------------------------------------
// Schrijven
// ---------------------------------------------------------------------------
// Upsert op (landgoed_id, vraag_hash) — de unieke index uit 0056. Twee tabbladen
// die tegelijk dezelfde vraag stellen leveren zo één rij op in plaats van een
// conflict.

export async function bewaarZoekopdracht(
  db: SupabaseClient,
  u: ZoekUitkomst,
  gebruikerId: string | null = null,
): Promise<boolean> {
  const uitkomst: UitkomstJson = {
    fondsen: u.fondsen,
    wat_zou_helpen: u.wat_zou_helpen,
    te_laat: u.te_laat,
    toelichting: u.toelichting,
  };

  const { error } = await db.from(ZOEKOPDRACHT_TABEL).upsert(
    {
      landgoed_id: u.landgoed_id,
      vraag_hash: u.vraag_hash,
      catalogusversie: u.catalogusversie,
      vraag: u.antwoorden,
      plan_tekst: u.antwoorden.plan || null,
      uitkomst,
      aantal_getoond: u.fondsen.length,
      // TWEE GETALLEN, APART BEWAARD. Ze mogen nooit tot één cijfer worden
      // samengeknepen — zie de toelichting bij `Bevinding` in zoek.ts.
      hoogste_slagingskans: u.fondsen.length ? Math.max(...u.fondsen.map((f) => f.slagingskans)) : null,
      hoogste_matchbaarheid: u.fondsen.length ? Math.max(...u.fondsen.map((f) => f.matchbaarheid)) : null,
      te_laat: u.te_laat !== null,
      trechter: u.trechter,
      kosten: u.kosten,
      kosten_dollars: Number(u.kosten.dollars.toFixed(5)),
      model: u.model_gebruikt ? RANGSCHIK_MODEL : null,
      model_gebruikt: u.model_gebruikt,
      ...(gebruikerId ? { gemaakt_door: gebruikerId } : {}),
    },
    { onConflict: "landgoed_id,vraag_hash" },
  );

  if (error) {
    // Geen throw: een mislukte besparing mag een geslaagde zoekopdracht niet
    // ongedaan maken. Wel luid loggen, want een cache die nooit vult is een
    // rekening die stilletjes doorloopt.
    console.error(`[fondsen-opslag] bewaren mislukt: ${error.message}`);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// De hele beweging in één aanroep
// ---------------------------------------------------------------------------
// Eerst kijken of het antwoord er al ligt; zo niet, zoeken en wegschrijven. Dit
// is de enige plek waar de UI mee te maken heeft.

export type ZoekMetOpslagOpties = ZoekOpties & {
  // Forceer een verse berekening en overschrijf het bewaarde antwoord. Voor de
  // knop "opnieuw zoeken" — een bewuste handeling van de gebruiker, met de
  // kosten die daarbij horen.
  negeerOpslag?: boolean;
  gebruikerId?: string | null;
};

export async function zoekMetOpslag(
  db: SupabaseClient,
  landgoedId: string,
  profiel: Landgoedprofiel,
  antwoorden: Antwoorden,
  catalogus: Catalogus,
  opties: ZoekMetOpslagOpties = {},
): Promise<BewaardeZoekopdracht> {
  const hash = vraagHash(landgoedId, antwoorden, profiel, catalogus.versie);

  if (!opties.negeerOpslag) {
    const bewaard = await leesZoekopdracht(db, landgoedId, hash);
    if (bewaard) {
      console.log(`[fondsen-opslag] hergebruik vraag=${hash.slice(0, 8)} landgoed=${landgoedId} kosten=$0.0000`);
      return bewaard;
    }
  }

  const uitkomst = await zoek(db, landgoedId, profiel, antwoorden, catalogus, opties);
  await bewaarZoekopdracht(db, uitkomst, opties.gebruikerId ?? null);
  return { uitkomst, gemaakt_op: new Date().toISOString(), uit_opslag: false };
}

// De laatste vragen van dit landgoed, voor het lijstje onder het vraagveld. Zo
// is een eerder antwoord terug te vinden zonder er opnieuw voor te betalen.
export type Zoekhistorie = {
  vraag_hash: string;
  plan_tekst: string | null;
  aantal_getoond: number;
  hoogste_slagingskans: number | null;
  te_laat: boolean;
  gemaakt_op: string;
};

export async function laatsteZoekopdrachten(
  db: SupabaseClient,
  landgoedId: string,
  limiet = 5,
): Promise<Zoekhistorie[]> {
  const { data, error } = await db
    .from(ZOEKOPDRACHT_TABEL)
    .select("vraag_hash, plan_tekst, aantal_getoond, hoogste_slagingskans, te_laat, gemaakt_op")
    .eq("landgoed_id", landgoedId)
    .order("gemaakt_op", { ascending: false })
    .limit(limiet);
  if (error) {
    console.error(`[fondsen-opslag] historie lezen mislukt: ${error.message}`);
    return [];
  }
  return (data ?? []) as unknown as Zoekhistorie[];
}
