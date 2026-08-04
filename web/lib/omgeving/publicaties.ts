// Publicaties ophalen en geocoderen — één keer, voor alle landgoederen.
//
// Dit is de dure helft van de keten: HTTP-verkeer naar KOOP en PDOK. Hij is
// bewust losgeknipt van het matchen, omdat een bekendmaking en zijn coördinaat
// niet landgoed-afhankelijk zijn. Tien landgoederen in dezelfde gemeente delen
// hetzelfde werk; het matchen daarna is puur SQL.
//
// Twee dingen die de kosten laag houden:
//
//   1. Wat we al kennen wordt niet opnieuw geocodeerd. De ronde kijkt zeven
//      dagen terug om geen dag te missen, dus zonder deze controle zou elke
//      publicatie zeven keer door de geocoder gaan.
//   2. Provincie en waterschap leveren alleen hun gebiedsdekkende besluiten;
//      hun losse vergunningen liggen mediaan 23 km weg (gemeten).

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  haalPublicaties,
  NIET_RELEVANTE_RUBRIEKEN,
  GEBIEDSDEKKENDE_RUBRIEKEN,
} from "./sru";
import { plaatsBericht, type Zoekgebied } from "./plaatsen";
import { gebiedsdekkend, termijnVoor } from "./ingest";

export type Bestuursorgaan = {
  naam: string;
  bestuurslaag: string;
  organisatiecode: string | null;
  /** Waarbinnen adressen uit deze bron gezocht mogen worden. */
  gebied: Zoekgebied;
};

export type OphaalCijfers = {
  organisatie: string;
  opgehaald: number;
  al_bekend: number;
  nieuw: number;
  geplaatst: number;
  onplaatsbaar: number;
  geen_locatie: number;
  fouten: string[];
};

/**
 * Haalt de publicaties van één bestuursorgaan op, geocodeert wat nieuw is en
 * bewaart het resultaat in de gedeelde tabel.
 */
export async function haalPublicatiesOp(
  supabase: SupabaseClient,
  orgaan: Bestuursorgaan,
  periode: { vanaf: string; tot: string },
  maximaal = 5000,
): Promise<OphaalCijfers> {
  const c: OphaalCijfers = {
    organisatie: orgaan.naam,
    opgehaald: 0,
    al_bekend: 0,
    nieuw: 0,
    geplaatst: 0,
    onplaatsbaar: 0,
    geen_locatie: 0,
    fouten: [],
  };

  let publicaties;
  try {
    const uit = await haalPublicaties({
      organisatie: orgaan.naam,
      vanaf: periode.vanaf,
      tot: periode.tot,
      maximaal,
      alleenRubrieken: gebiedsdekkend(orgaan.bestuurslaag)
        ? GEBIEDSDEKKENDE_RUBRIEKEN
        : undefined,
    });
    publicaties = uit.publicaties;
    c.opgehaald = publicaties.length;
  } catch (e) {
    c.fouten.push(`${orgaan.naam}: ${(e as Error).message}`);
    return c;
  }

  // Documenttype-filter: het goedkoopste dat er is.
  const relevant = publicaties.filter(
    (p) => !p.rubriek || !NIET_RELEVANTE_RUBRIEKEN.has(p.rubriek.toLowerCase()),
  );
  if (relevant.length === 0) return c;

  // Welke kennen we al? Eén databasevraag in plaats van honderden
  // geocodeerverzoeken. Bij een dagelijkse ronde met zeven dagen overlap is
  // ongeveer 85% hiervan al bekend.
  const { data: bekend, error: bekendFout } = await supabase
    .from("omgevingspublicatie")
    .select("externe_id")
    .in(
      "externe_id",
      relevant.map((p) => p.externe_id),
    );
  if (bekendFout) {
    c.fouten.push(`${orgaan.naam}: bekende publicaties opvragen — ${bekendFout.message}`);
    return c;
  }
  const alBekend = new Set((bekend ?? []).map((r) => r.externe_id as string));
  c.al_bekend = alBekend.size;

  const teDoen = relevant.filter((p) => !alBekend.has(p.externe_id));
  if (teDoen.length === 0) return c;

  for (const p of teDoen) {
    let plaatsing: Awaited<ReturnType<typeof plaatsBericht>>;
    try {
      plaatsing = await plaatsBericht(p.titel, orgaan.gebied);
    } catch (e) {
      c.fouten.push(`geocoderen "${p.titel.slice(0, 40)}": ${(e as Error).message}`);
      plaatsing = { status: "onplaatsbaar", term: p.titel };
    }

    if (plaatsing.status === "geplaatst") c.geplaatst++;
    else if (plaatsing.status === "onplaatsbaar") c.onplaatsbaar++;
    else c.geen_locatie++;

    const { data: thema } = await supabase.rpc("omgeving_thema_voor_rubriek", {
      p_rubriek: p.rubriek ?? "",
    });
    const termijn = termijnVoor(p.rubriek, p.datum, p.titel);

    const { error } = await supabase.from("omgevingspublicatie").upsert(
      {
        externe_id: p.externe_id,
        bestuursorgaan: p.organisatie ?? orgaan.naam,
        organisatiecode: orgaan.organisatiecode,
        bestuurslaag: orgaan.bestuurslaag,
        titel: p.titel,
        rubriek: p.rubriek,
        bericht_datum: p.datum,
        url: p.url,
        thema: (thema as string) ?? "bouwvergunning",
        geo_status: plaatsing.status,
        geo_niveau: plaatsing.status === "geplaatst" ? plaatsing.plaatsing.niveau : null,
        geo_weergavenaam:
          plaatsing.status === "geplaatst" ? plaatsing.plaatsing.weergavenaam : null,
        geo_zekerheid: plaatsing.status === "geplaatst" ? plaatsing.plaatsing.score : null,
        geo_zoekterm:
          plaatsing.status === "geplaatst"
            ? plaatsing.plaatsing.zoekterm
            : plaatsing.status === "onplaatsbaar"
              ? plaatsing.term
              : null,
        termijn_soort: termijn?.soort ?? null,
        termijn_einddatum: termijn?.einddatum ?? null,
      },
      { onConflict: "externe_id" },
    );
    if (error) {
      c.fouten.push(`opslaan "${p.titel.slice(0, 40)}": ${error.message}`);
      continue;
    }
    c.nieuw++;

    // Het punt kan niet via de REST-laag; daarvoor is een RPC nodig.
    if (plaatsing.status === "geplaatst") {
      await supabase.rpc("omgevingspublicatie_zet_punt", {
        p_externe_id: p.externe_id,
        p_x: plaatsing.plaatsing.x,
        p_y: plaatsing.plaatsing.y,
      });
    }
  }

  return c;
}

/**
 * De bestuursorganen die opgehaald moeten worden, ontdubbeld over alle
 * landgoederen. Twee landgoederen in Middelburg leveren één ophaalronde op.
 */
export function ontdubbel(
  rijen: {
    naam: string;
    bestuurslaag: string;
    organisatiecode?: string | null;
    zoekveld?: string | null;
    zoekgebied?: string | null;
    provincie?: string | null;
  }[],
): Bestuursorgaan[] {
  const per = new Map<string, Bestuursorgaan>();
  for (const r of rijen) {
    const gemeentelijk =
      r.bestuurslaag === "gemeente" || r.bestuurslaag === "buurgemeente";
    const veld =
      (r.zoekveld as "gemeentenaam" | "provincienaam" | null) ??
      (gemeentelijk ? "gemeentenaam" : "provincienaam");
    const naam = r.zoekgebied ?? (gemeentelijk ? r.naam : (r.provincie ?? null));
    // Zonder begrensd zoekgebied niet ophalen: ongefilterd geocoderen levert
    // treffers ergens anders in Nederland op die er geldig uitzien.
    if (!naam) continue;
    if (per.has(r.naam)) continue;
    per.set(r.naam, {
      naam: r.naam,
      bestuurslaag: r.bestuurslaag,
      organisatiecode: r.organisatiecode ?? null,
      gebied: { veld, naam },
    });
  }
  return [...per.values()];
}
