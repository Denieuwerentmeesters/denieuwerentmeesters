import type { SupabaseClient } from "@supabase/supabase-js";
import { moet } from "@/lib/db";
import {
  bronHash,
  maakMatchprofiel,
  MATCHPROFIEL_MODEL,
  type Beleidsdocument,
  type MatchprofielBron,
} from "./matchprofiel";
import {
  schoonmaakRegel,
  telRapporten,
  type SchoonmaakRapport,
} from "./beleidstekst-schoonmaak";

// Genereert de matchprofielen (migratie 0053) voor de fondsencatalogus.
//
// WAT HIER NIET GEBEURT, EN WAAROM
//   * geen profiel voor een fonds zonder bron. Een profiel dat op niets berust
//     is precies het gokwerk dat §11 wil vermijden; zo'n fonds komt in
//     `overgeslagen_geen_bron` terug en blijft zichtbaar als gat.
//   * een GEACCORDEERD profiel wordt nooit overschreven. Wijzigt de bron eronder
//     toch, dan komt dat via `gewijzigd_maar_geaccordeerd` boven zodat een mens
//     ernaar kan kijken — stil overschrijven zou de accorderingsstap uithollen.
//   * niets wordt geaccordeerd. Alles komt binnen als voorstel.
//
// BATCHGEWIJS MET WEGSCHRIJVEN PER FONDS. Elke geslaagde generatie gaat meteen
// naar de database. Een afgebroken run (timeout, rate limit, netwerk) verliest
// dus alleen het fonds dat op dat moment liep; alle eerdere profielen staan er.
// De volgende run pikt de rest op omdat de hash van de al gedane fondsen niet
// meer wijzigt.
//
// Idempotent: twee keer draaien geeft hetzelfde resultaat en kost de tweede keer
// vrijwel niets — ongewijzigde bron_hash betekent geen modelaanroep.
//
// Draait met de SERVICE-ROLE client (omzeilt RLS), net als de andere ingesties.

type Db = SupabaseClient;

export type MatchprofielTelling = {
  bekeken: number;
  gemaakt: number;
  bijgewerkt: number;
  ongewijzigd: number;
  overgeslagen_geaccordeerd: number;
  overgeslagen_geen_bron: { regeling_id: string; naam: string }[];
  gewijzigd_maar_geaccordeerd: { regeling_id: string; naam: string }[];
  mislukt: { regeling_id: string; naam: string; reden: string }[];
  // Fondsen waarvan het KAARTJE niet deugt (te kort/lang of zonder uitsluiting).
  // Het profiel is dan wel opgeslagen; alleen de goedkope rankingstap mist iets.
  kaartje_bezwaren: { regeling_id: string; naam: string; bezwaren: string[] }[];
  // Wat de boilerplate-schoonmaak deze ronde in totaal scheelde. Controleerbaar
  // maken is de bedoeling: zie ook de regel per fonds in het log.
  schoonmaak_totaal: SchoonmaakRapport;
  schoonmaak_rapporten: SchoonmaakRapport[];
  model: string;
  afgekapt_op_limiet: boolean;
  fout?: string;
};

type RegelingRij = {
  id: string;
  naam: string;
  organisatie: string | null;
  samenvatting: string | null;
  benaderbaarheid: string | null;
  benaderwijze_notitie: string | null;
  aanvrager_type: string | null;
  geo_niveau: string | null;
  geo_waarden: string[] | null;
  bedrag_min: number | null;
  bedrag_max: number | null;
  bedrag_indicatie: string | null;
  cofinanciering_vereist: boolean | null;
  kostensoort: string[] | null;
  landgoed_route: string | null;
  landgoed_route_reden: string | null;
  landgoed_partnertype: string | null;
};

const KOLOMMEN =
  "id, naam, organisatie, samenvatting, benaderbaarheid, benaderwijze_notitie, " +
  "aanvrager_type, geo_niveau, geo_waarden, bedrag_min, bedrag_max, " +
  "bedrag_indicatie, cofinanciering_vereist, kostensoort, landgoed_route, " +
  "landgoed_route_reden, landgoed_partnertype";

export type MatchprofielOpties = {
  // Hoeveel fondsen deze run maximaal een MODELAANROEP mogen kosten. Ongewijzigde
  // fondsen tellen niet mee. Zo blijft één HTTP-aanroep binnen de maxDuration en
  // kun je een volledige ronde in stukken draaien.
  limiet?: number;
  // Eén specifieke regeling (voor een steekproef op kwaliteit).
  regelingId?: string;
  model?: string;
  // Bron opnieuw destilleren ook als de hash gelijk is (na een promptwijziging
  // die je bewust niet in PROMPT_VERSIE hebt gezet).
  forceer?: boolean;
};

export async function genereerMatchprofielen(
  db: Db,
  opties: MatchprofielOpties = {},
): Promise<MatchprofielTelling> {
  const model = opties.model ?? MATCHPROFIEL_MODEL;
  const telling: MatchprofielTelling = {
    bekeken: 0,
    gemaakt: 0,
    bijgewerkt: 0,
    ongewijzigd: 0,
    overgeslagen_geaccordeerd: 0,
    overgeslagen_geen_bron: [],
    gewijzigd_maar_geaccordeerd: [],
    mislukt: [],
    kaartje_bezwaren: [],
    schoonmaak_totaal: telRapporten([]),
    schoonmaak_rapporten: [],
    model,
    afgekapt_op_limiet: false,
  };

  let vraag = db
    .from("regeling")
    .select(KOLOMMEN)
    .in("soort_bron", ["fonds", "lening"])
    // niet_relevant hoort nooit in de fondsenstroom te verschijnen (0052); daar
    // een profiel voor maken is weggegooid geld.
    .neq("landgoed_route", "niet_relevant");
  if (opties.regelingId) vraag = vraag.eq("id", opties.regelingId);

  const { data: catalogus, error: catFout } = await vraag;
  if (catFout) {
    return { ...telling, fout: `Catalogus ophalen mislukt: ${catFout.message}` };
  }
  const rijen = (catalogus ?? []) as unknown as RegelingRij[];
  telling.bekeken = rijen.length;
  if (rijen.length === 0) return telling;

  const ids = rijen.map((r) => r.id);
  const beleidPerRegeling = await leesBeleidsteksten(db, ids);
  const uitsluitingenPerRegeling = await leesUitsluitingen(db, ids);
  const bestaand = await leesBestaandeProfielen(db, ids);

  const limiet = opties.limiet ?? rijen.length;
  let aanroepen = 0;

  for (const rij of rijen) {
    const beleidsteksten = beleidPerRegeling.get(rij.id) ?? [];
    const uitsluitingen = uitsluitingenPerRegeling.get(rij.id) ?? [];

    // Geen enkele bron? Dan is er niets om te destilleren. Liever een gat dan
    // een profiel dat op de catalogusregel alleen berust.
    if (beleidsteksten.length === 0 && uitsluitingen.length === 0 && !rij.samenvatting) {
      telling.overgeslagen_geen_bron.push({ regeling_id: rij.id, naam: rij.naam });
      continue;
    }

    const bron: MatchprofielBron = {
      regeling_id: rij.id,
      naam: rij.naam,
      organisatie: rij.organisatie,
      samenvatting: rij.samenvatting,
      benaderbaarheid: rij.benaderbaarheid,
      benaderwijze_notitie: rij.benaderwijze_notitie,
      aanvrager_type: rij.aanvrager_type,
      geo_niveau: rij.geo_niveau,
      geo_waarden: rij.geo_waarden,
      bedrag_min: rij.bedrag_min,
      bedrag_max: rij.bedrag_max,
      bedrag_indicatie: rij.bedrag_indicatie,
      cofinanciering_vereist: rij.cofinanciering_vereist,
      kostensoort: rij.kostensoort,
      landgoed_route: rij.landgoed_route,
      landgoed_route_reden: rij.landgoed_route_reden,
      landgoed_partnertype: rij.landgoed_partnertype,
      uitsluitingen,
      beleidsteksten,
    };

    const huidig = bestaand.get(rij.id);
    const nieuweHash = bronHash(bron);

    if (huidig?.geaccordeerd) {
      // Door een mens vastgesteld: niet aanraken. Wel melden als de bron
      // eronder inmiddels iets anders zegt.
      telling.overgeslagen_geaccordeerd++;
      if (huidig.bron_hash !== nieuweHash) {
        telling.gewijzigd_maar_geaccordeerd.push({
          regeling_id: rij.id,
          naam: rij.naam,
        });
      }
      continue;
    }
    if (!opties.forceer && huidig && huidig.bron_hash === nieuweHash) {
      telling.ongewijzigd++;
      continue;
    }

    if (aanroepen >= limiet) {
      // Rest wacht op de volgende run; wat al geschreven is blijft staan.
      telling.afgekapt_op_limiet = true;
      break;
    }
    aanroepen++;

    let resultaat;
    try {
      resultaat = await maakMatchprofiel(bron, { model });
    } catch (e) {
      telling.mislukt.push({
        regeling_id: rij.id,
        naam: rij.naam,
        reden: e instanceof Error ? e.message : String(e),
      });
      continue;
    }
    if (!resultaat) {
      telling.mislukt.push({
        regeling_id: rij.id,
        naam: rij.naam,
        reden: "AI-laag gaf niets terug (geen ANTHROPIC_API_KEY of aanroep mislukt).",
      });
      continue;
    }
    const { profiel, schoonmaak, kaartje_bezwaren } = resultaat;

    // PER FONDS LOGGEN wat de deterministische schoonmaak heeft weggehaald. Zonder
    // dit is niet te controleren dat er geen beleid is gesneuveld: een profiel dat
    // op een gestripte bron berust leest nog steeds prima.
    console.log(schoonmaakRegel(rij.naam, schoonmaak));
    telling.schoonmaak_rapporten.push(schoonmaak);
    if (kaartje_bezwaren.length) {
      // Het profiel wordt wél bewaard — dat is bruikbaar. Alleen het kaartje deugt
      // niet, en dat moet zichtbaar zijn: een kaartje zonder uitsluiting laat een
      // fonds bovenaan eindigen dat er niet hoort.
      telling.kaartje_bezwaren.push({
        regeling_id: rij.id,
        naam: rij.naam,
        bezwaren: kaartje_bezwaren,
      });
    }

    // METEEN wegschrijven, per fonds. Dit is het punt van deze hele opzet: een
    // run die halverwege afbreekt verliest niet het werk dat al gedaan is.
    await moet(
      db.from("regeling_matchprofiel").upsert(
        { ...profiel, bijgewerkt_op: new Date().toISOString() },
        { onConflict: "regeling_id" },
      ),
      "matchprofiel opslaan",
    );
    if (huidig) telling.bijgewerkt++;
    else telling.gemaakt++;
  }

  telling.schoonmaak_totaal = telRapporten(telling.schoonmaak_rapporten);
  return telling;
}

// ---------------------------------------------------------------------------
// Bronlezing
// ---------------------------------------------------------------------------

// PostgREST kapt een `.in()` met honderden waarden af op de URL-lengte; in
// blokken ophalen houdt dat weg.
const BLOK = 100;

async function inBlokken<T>(
  ids: string[],
  ophalen: (deel: string[]) => Promise<T[]>,
): Promise<T[]> {
  const alles: T[] = [];
  for (let i = 0; i < ids.length; i += BLOK) {
    alles.push(...(await ophalen(ids.slice(i, i + BLOK))));
  }
  return alles;
}

async function leesBeleidsteksten(
  db: Db,
  ids: string[],
): Promise<Map<string, Beleidsdocument[]>> {
  type Rij = {
    regeling_id: string;
    bron_sleutel: string;
    bron_url: string | null;
    tekst: string;
    tekst_hash: string;
    opgehaald_op: string | null;
  };
  const rijen = await inBlokken<Rij>(ids, async (deel) => {
    const { data } = await db
      .from("regeling_beleidstekst")
      .select("regeling_id, bron_sleutel, bron_url, tekst, tekst_hash, opgehaald_op")
      .in("regeling_id", deel);
    return (data ?? []) as unknown as Rij[];
  });

  const kaart = new Map<string, Beleidsdocument[]>();
  for (const r of rijen) {
    const lijst = kaart.get(r.regeling_id) ?? [];
    lijst.push({
      bron_sleutel: r.bron_sleutel,
      bron_url: r.bron_url,
      tekst: r.tekst,
      tekst_hash: r.tekst_hash,
      opgehaald_op: r.opgehaald_op,
    });
    kaart.set(r.regeling_id, lijst);
  }
  // Stabiele volgorde: de database garandeert er geen, en een andere volgorde
  // mag geen andere prompt (en dus geen ander profiel) opleveren.
  for (const lijst of kaart.values()) {
    lijst.sort((a, b) => a.bron_sleutel.localeCompare(b.bron_sleutel));
  }
  return kaart;
}

// De uitsluitingen staan als criterium met soort='uitsluiting'; het broncitaat
// zit in uitkomst_toelichting (zie verrijking-ingestie.ts), met de ingekorte
// omschrijving als terugval.
async function leesUitsluitingen(db: Db, ids: string[]): Promise<Map<string, string[]>> {
  type Rij = {
    regeling_id: string;
    omschrijving: string | null;
    uitkomst_toelichting: string | null;
  };
  const rijen = await inBlokken<Rij>(ids, async (deel) => {
    const { data } = await db
      .from("regeling_criterium")
      .select("regeling_id, omschrijving, uitkomst_toelichting")
      .eq("soort", "uitsluiting")
      .in("regeling_id", deel);
    return (data ?? []) as unknown as Rij[];
  });

  const kaart = new Map<string, string[]>();
  for (const r of rijen) {
    const tekst = (r.uitkomst_toelichting ?? r.omschrijving ?? "").trim();
    if (!tekst) continue;
    const lijst = kaart.get(r.regeling_id) ?? [];
    lijst.push(tekst);
    kaart.set(r.regeling_id, lijst);
  }
  for (const lijst of kaart.values()) lijst.sort();
  return kaart;
}

async function leesBestaandeProfielen(
  db: Db,
  ids: string[],
): Promise<Map<string, { bron_hash: string; geaccordeerd: boolean }>> {
  type Rij = { regeling_id: string; bron_hash: string; geaccordeerd: boolean };
  const rijen = await inBlokken<Rij>(ids, async (deel) => {
    const { data } = await db
      .from("regeling_matchprofiel")
      .select("regeling_id, bron_hash, geaccordeerd")
      .in("regeling_id", deel);
    return (data ?? []) as unknown as Rij[];
  });
  return new Map(
    rijen.map((r) => [r.regeling_id, { bron_hash: r.bron_hash, geaccordeerd: r.geaccordeerd }]),
  );
}
