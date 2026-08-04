// De keten van bron naar bericht.
//
//   bronfilter (organisatie + periode)   <- goedkoop, hard
//     -> documenttype-filter             <- goedkoop, hard: scheelt ~16%
//       -> locatie uit de titel
//         -> geocoderen binnen de gemeente
//           -> ruimtelijke poort         <- pas hier valt het meeste af
//             -> omgevingsbericht
//
// De volgorde is niet willekeurig. Het moduleplan ging uit van "eerst de
// ruimtelijke poort, dan pas kosten maken", maar dat kan niet: bekendmakingen
// dragen geen geometrie, dus geocoderen moet érvoor. Wat wél vooraan kan is
// het documenttype, en dat filter is gratis.

import type { SupabaseClient } from "@supabase/supabase-js";
import { haalPublicaties, NIET_RELEVANTE_RUBRIEKEN, type Publicatie } from "./sru";
import { plaatsBericht } from "./plaatsen";

export type Trechter = {
  opgehaald: number;
  na_doctype: number;
  geplaatst: number;
  onplaatsbaar: number;
  geen_locatie: number;
  door_poort: number;
  bewaard: number;
  overgeslagen_dubbel: number;
  fouten: string[];
};

function leegTrechter(): Trechter {
  return {
    opgehaald: 0,
    na_doctype: 0,
    geplaatst: 0,
    onplaatsbaar: 0,
    geen_locatie: 0,
    door_poort: 0,
    bewaard: 0,
    overgeslagen_dubbel: 0,
    fouten: [],
  };
}

type PoortUitkomst = {
  geo_relatie: string | null;
  afstand_m: number | null;
  thema: string | null;
  urgentie: number | null;
};

// Termijnen die uit het documenttype volgen. Rekenwerk, geen AI — en daarom
// betrouwbaar. Zes weken is de standaard onder de Awb.
const TERMIJN_WEKEN: Record<string, { soort: string; weken: number }> = {
  omgevingsvergunning: { soort: "bezwaar", weken: 6 },
  omgevingsplan: { soort: "zienswijze", weken: 6 },
  bestemmingsplan: { soort: "zienswijze", weken: 6 },
  omgevingsverordening: { soort: "zienswijze", weken: 6 },
  peilbesluit: { soort: "zienswijze", weken: 6 },
  "verkeersbesluit of -mededeling": { soort: "bezwaar", weken: 6 },
};

function termijnVoor(rubriek: string | null, datum: string | null) {
  if (!rubriek || !datum) return null;
  const t = TERMIJN_WEKEN[rubriek];
  if (!t) return null;
  const d = new Date(datum);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + t.weken * 7);
  return { soort: t.soort, einddatum: d.toISOString().slice(0, 10) };
}

// Rubrieken waarbij een gemiste termijn werkelijk onherstelbaar is: plannen en
// verordeningen waar je één keer een zienswijze op kunt indienen. Een
// omgevingsvergunning staat er bewust NIET bij — dat is verreweg het grootste
// volume en het gaat meestal om een dakkapel drie kilometer verderop.
const VANGNET_RUBRIEKEN = new Set([
  "omgevingsplan",
  "bestemmingsplan",
  "omgevingsverordening",
  "waterschapsverordening",
  "peilbesluit",
  "verordeningen",
]);

/**
 * De vangnetregel: mag een bericht dat we niet konden plaatsen tóch bewaard
 * worden?
 *
 * Eerste opzet zei "ja, zodra er een termijn aan hangt". Dat bleek veel te
 * ruim: van de eerste 49 bewaarde berichten waren er 46 op deze manier
 * binnengekomen, vrijwel allemaal gewone vergunningen kilometers verderop.
 * De regel was bedoeld als zeldzame uitzondering, niet als hoofdingang.
 *
 * Nu drie voorwaarden tegelijk: het is niet te plaatsen, de termijn loopt nog,
 * en het gaat om een besluitsoort waar missen echt onherstelbaar is.
 */
export function vangnetGeldt(
  status: string,
  termijn: { soort: string; einddatum: string } | null,
  rubriek: string | null,
): boolean {
  if (status === "geplaatst") return false;
  if (!termijn) return false;

  // Een termijn die al verstreken is helpt niemand meer. Dit is wat een
  // eerste ronde over twaalf maanden anders volstopt met oud nieuws.
  if (termijn.einddatum < new Date().toISOString().slice(0, 10)) return false;

  // Een zienswijze is de onherstelbare: daarna is het plan vastgesteld.
  if (termijn.soort === "zienswijze") return true;

  return rubriek != null && VANGNET_RUBRIEKEN.has(rubriek.toLowerCase());
}

export type Bron = {
  id: string | null;
  organisatie: string;
  /** Gemeente waarbinnen geocodeerd mag worden. */
  gemeente: string;
  bestuurslaag: string;
};

/**
 * Haalt één bron op en schrijft de treffers weg.
 *
 * Alles wat de poort niet haalt wordt NIET bewaard — dat is het hele punt van
 * de module. Wat wél bewaard wordt maar niet te plaatsen was, krijgt
 * geo_status 'onplaatsbaar' en komt in de aparte bak.
 */
export async function haalBronOp(
  supabase: SupabaseClient,
  landgoed_id: string,
  bron: Bron,
  periode: { vanaf: string; tot: string },
  maximaal = 500,
): Promise<Trechter> {
  const t = leegTrechter();

  let publicaties: Publicatie[];
  try {
    const uit = await haalPublicaties({
      organisatie: bron.organisatie,
      vanaf: periode.vanaf,
      tot: periode.tot,
      maximaal,
    });
    publicaties = uit.publicaties;
    t.opgehaald = uit.publicaties.length;
    if (uit.afgekapt) {
      t.fouten.push(
        `${bron.organisatie}: ${uit.totaal} publicaties, ${maximaal} opgehaald — periode verkleinen voor volledige dekking.`,
      );
    }
  } catch (e) {
    t.fouten.push(`${bron.organisatie}: ${(e as Error).message}`);
    return t;
  }

  for (const p of publicaties) {
    // 1. Documenttype — het goedkoopste filter dat er is.
    if (p.rubriek && NIET_RELEVANTE_RUBRIEKEN.has(p.rubriek.toLowerCase())) continue;
    t.na_doctype++;

    // 2. Welk thema, en dus welke afstand?
    const { data: thema } = await supabase.rpc("omgeving_thema_voor_rubriek", {
      p_rubriek: p.rubriek ?? "",
    });
    const themaCode = (thema as string) ?? "bouwvergunning";

    // 3. Plaatsen.
    let plaatsing: Awaited<ReturnType<typeof plaatsBericht>>;
    try {
      plaatsing = await plaatsBericht(p.titel, bron.gemeente);
    } catch (e) {
      t.fouten.push(`geocoderen "${p.titel.slice(0, 40)}": ${(e as Error).message}`);
      plaatsing = { status: "onplaatsbaar", term: p.titel };
    }

    const termijn = termijnVoor(p.rubriek, p.datum);
    let poort: PoortUitkomst | null = null;

    if (plaatsing.status === "geplaatst") {
      t.geplaatst++;
      const { data } = await supabase.rpc("omgeving_poort_punt", {
        p_landgoed_id: landgoed_id,
        p_x: plaatsing.plaatsing.x,
        p_y: plaatsing.plaatsing.y,
        p_thema: themaCode,
      });
      poort = (data as PoortUitkomst) ?? null;
      if (poort && poort.geo_relatie && poort.geo_relatie !== "geen") t.door_poort++;
    } else if (plaatsing.status === "onplaatsbaar") {
      t.onplaatsbaar++;
    } else {
      t.geen_locatie++;
    }

    // 4. Bewaren of weggooien?
    const doorPoort = poort?.geo_relatie != null && poort.geo_relatie !== "geen";
    if (!doorPoort && !vangnetGeldt(plaatsing.status, termijn, p.rubriek)) continue;

    const verantwoording =
      plaatsing.status === "geplaatst"
        ? `${plaatsing.plaatsing.weergavenaam} (${plaatsing.plaatsing.soort}, zekerheid ${plaatsing.plaatsing.score})` +
          (poort?.afstand_m != null ? ` — ${poort.afstand_m} m van het landgoed` : "")
        : plaatsing.status === "onplaatsbaar"
          ? `Locatie "${plaatsing.term}" niet te plaatsen binnen ${bron.gemeente}.`
          : "Geen locatie in de tekst gevonden.";

    const { data: bewaard, error } = await supabase
      .from("omgevingsbericht")
      .insert({
        landgoed_id,
        bron_id: bron.id,
        externe_id: p.externe_id,
        titel: p.titel,
        url: p.url,
        bericht_datum: p.datum,
        bestuursorgaan: p.organisatie,
        thema: poort?.thema ?? themaCode,
        geo_niveau: plaatsing.status === "geplaatst" ? plaatsing.plaatsing.niveau : 5,
        geo_relatie: poort?.geo_relatie ?? null,
        geo_status: plaatsing.status,
        afstand_m: poort?.afstand_m ?? null,
        termijn_soort: termijn?.soort ?? null,
        termijn_einddatum: termijn?.einddatum ?? null,
        motivering: verantwoording,
        status: "nieuw",
      })
      .select("id")
      .single();

    if (error) {
      // 23505 = unieke sleutel: dit bericht stond er al. Bij een dagelijkse run
      // met overlappende periodes is dat normaal, geen fout.
      if (error.code === "23505") t.overgeslagen_dubbel++;
      else t.fouten.push(`opslaan "${p.titel.slice(0, 40)}": ${error.message}`);
      continue;
    }

    t.bewaard++;

    if (plaatsing.status === "geplaatst" && bewaard) {
      await supabase.rpc("omgevingsbericht_zet_punt", {
        p_bericht_id: bewaard.id,
        p_x: plaatsing.plaatsing.x,
        p_y: plaatsing.plaatsing.y,
      });
    }
  }

  return t;
}

export function telOp(delen: Trechter[]): Trechter {
  const t = leegTrechter();
  for (const d of delen) {
    t.opgehaald += d.opgehaald;
    t.na_doctype += d.na_doctype;
    t.geplaatst += d.geplaatst;
    t.onplaatsbaar += d.onplaatsbaar;
    t.geen_locatie += d.geen_locatie;
    t.door_poort += d.door_poort;
    t.bewaard += d.bewaard;
    t.overgeslagen_dubbel += d.overgeslagen_dubbel;
    t.fouten.push(...d.fouten);
  }
  return t;
}
