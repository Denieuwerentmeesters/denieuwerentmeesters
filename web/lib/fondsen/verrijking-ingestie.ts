import type { SupabaseClient } from "@supabase/supabase-js";
import { moet } from "@/lib/db";
import { FONDSEN_BRON_SLEUTEL } from "./bestand";
import {
  berekenMatchbaarheid,
  leesVerrijkingen,
  naamSleutel,
  telKernvelden,
  verrijkingsMap,
  type Verrijking,
} from "./verrijking";

// Landt de verrijkingsslag (kennisbank/Fondsen/verrijking/) in de catalogus.
//
// Wat hier NIET gebeurt, en waarom:
//   * geen nieuwe catalogusrij bij een onbekende naam. De catalogus telt 242
//     rijen die uit een handmatige export komen; een verrijking die niet matcht
//     is bijna altijd een naamsverschil ("Dullertsstichting" vs. "De
//     Dullertstichting") en niet een nieuw fonds. Een rij erbij maken geeft een
//     dubbel die niemand meer ontwart. Dus: overslaan en rapporteren.
//   * geen harde waarde vervangen door een zwakkere. Een gevuld veld wordt
//     nooit overschreven met 'onbekend'/null, en herkomst gaat alleen omhoog
//     (afgeleid_tag -> geverifieerd_bron, nooit terug).
//   * niets wordt geaccordeerd. Alles komt binnen als voorstel.
//
// Idempotent: twee keer draaien geeft hetzelfde resultaat. Bronlezingen gaan
// via upsert op de unique (regeling_id, soort, jaar); uitsluitingen en
// beleidsteksten worden per regeling opnieuw opgebouwd, maar alleen voor rijen
// die uit deze import komen en nog niet door een mens zijn geaccordeerd.
//
// Draait met de SERVICE-ROLE client (omzeilt RLS), net als de andere ingesties.

type Db = SupabaseClient;

const UIT_IMPORT = ["afgeleid_tag", "geverifieerd_bron", "import", "ai_voorstel"];
// Herkomst-ladder: alleen omhoog. Index = hardheid.
const HERKOMST_LADDER = ["ai", "ai_voorstel", "import", "afgeleid_tag", "geverifieerd_bron", "handmatig"];

export type VerrijkingTelling = {
  gelezen: number;
  bijgewerkt: number;
  overgeslagen_onvolledig: { slug: string; reden: string }[];
  overgeslagen_geen_match: { slug: string; naam: string }[];
  overgeslagen_meerdere_matches: { slug: string; naam: string; kandidaten: string[] }[];
  overgeslagen_geaccordeerd: number;
  bronlezingen: number;
  uitsluitingen: number;
  beleidsteksten: number;
  onderliggende_voorstellen: number;
  fout?: string;
};

type RegelingRij = {
  id: string;
  naam: string;
  extern_id: string | null;
  bron_id: string | null;
  bron_url: string | null;
  geaccordeerd: boolean;
  herkomst: string;
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
  "id, naam, extern_id, bron_id, bron_url, geaccordeerd, herkomst, benaderbaarheid, " +
  "benaderwijze_notitie, aanvrager_type, geo_niveau, geo_waarden, bedrag_min, bedrag_max, " +
  "bedrag_indicatie, cofinanciering_vereist, kostensoort, landgoed_route, " +
  "landgoed_route_reden, landgoed_partnertype";

export async function verrijkFondsen(
  db: Db,
  map = verrijkingsMap(),
): Promise<VerrijkingTelling> {
  const telling: VerrijkingTelling = {
    gelezen: 0,
    bijgewerkt: 0,
    overgeslagen_onvolledig: [],
    overgeslagen_geen_match: [],
    overgeslagen_meerdere_matches: [],
    overgeslagen_geaccordeerd: 0,
    bronlezingen: 0,
    uitsluitingen: 0,
    beleidsteksten: 0,
    onderliggende_voorstellen: 0,
  };

  // De leeslaag gooit bij een datafout; die willen we zien, niet half verwerken.
  const lezing = leesVerrijkingen(map);
  telling.gelezen = lezing.fondsen.length;
  telling.overgeslagen_onvolledig = lezing.onvolledig;
  if (lezing.fondsen.length === 0) return telling;

  const { data: catalogus, error: catFout } = await db
    .from("regeling")
    .select(KOLOMMEN)
    .in("soort_bron", ["fonds", "lening", "subsidie"]);
  if (catFout) {
    return { ...telling, fout: `Catalogus ophalen mislukt: ${catFout.message}` };
  }
  const rijen = (catalogus ?? []) as unknown as RegelingRij[];

  // Twee ingangen: de genormaliseerde naam (primair) en het extern_id, dat bij
  // de fondsenbron gelijk is aan de slug van het verrijkingsbestand (vangnet
  // voor namen die de export anders spelt).
  const opNaam = new Map<string, RegelingRij[]>();
  const opExternId = new Map<string, RegelingRij[]>();
  for (const r of rijen) {
    const sleutel = naamSleutel(r.naam);
    (opNaam.get(sleutel) ?? opNaam.set(sleutel, []).get(sleutel)!).push(r);
    if (r.extern_id) {
      (opExternId.get(r.extern_id) ?? opExternId.set(r.extern_id, []).get(r.extern_id)!).push(r);
    }
  }

  const { data: bron } = await db
    .from("subsidie_bron")
    .select("id")
    .eq("sleutel", FONDSEN_BRON_SLEUTEL)
    .maybeSingle();
  const bronId = (bron as { id: string } | null)?.id ?? null;

  for (const v of lezing.fondsen) {
    const kandidaten = opNaam.get(naamSleutel(v.naam)) ?? opExternId.get(v.slug) ?? [];
    if (kandidaten.length === 0) {
      telling.overgeslagen_geen_match.push({ slug: v.slug, naam: v.naam });
      continue;
    }
    if (kandidaten.length > 1) {
      // Liever een handmatige beslissing dan de verkeerde rij verrijken.
      telling.overgeslagen_meerdere_matches.push({
        slug: v.slug,
        naam: v.naam,
        kandidaten: kandidaten.map((k) => k.naam),
      });
      continue;
    }
    const rij = kandidaten[0];
    if (rij.geaccordeerd) {
      // Een mens heeft deze rij vastgesteld; die overschrijven we niet.
      telling.overgeslagen_geaccordeerd++;
      continue;
    }

    await verrijkRij(db, rij, v, telling, bronId);
    telling.bijgewerkt++;
  }

  return telling;
}

async function verrijkRij(
  db: Db,
  rij: RegelingRij,
  v: Verrijking,
  telling: VerrijkingTelling,
  bronId: string | null,
): Promise<void> {
  // ---- 1. Kernvelden: alleen vullen wat leeg of 'onbekend' is -------------
  const patch: Record<string, unknown> = {};

  const benaderbaarheidLeeg =
    rij.benaderbaarheid == null || rij.benaderbaarheid === "onbekend";
  if (benaderbaarheidLeeg && v.benaderbaarheid !== "onbekend") {
    patch.benaderbaarheid = v.benaderbaarheid;
    // Het citaat hoort onlosmakelijk bij de poortwaarde; samen zetten.
    patch.benaderwijze_notitie = v.benaderwijze_notitie;
  } else if (!rij.benaderwijze_notitie && v.benaderwijze_notitie) {
    patch.benaderwijze_notitie = v.benaderwijze_notitie;
  }

  if ((rij.aanvrager_type == null || rij.aanvrager_type === "onbekend") &&
      v.aanvrager_type !== "onbekend") {
    patch.aanvrager_type = v.aanvrager_type;
  }
  if (rij.geo_niveau == null && v.geo_niveau) patch.geo_niveau = v.geo_niveau;
  if ((rij.geo_waarden ?? []).length === 0 && v.geo_waarden.length > 0) {
    patch.geo_waarden = v.geo_waarden;
  }
  if (rij.bedrag_min == null && v.bedrag_min != null) patch.bedrag_min = v.bedrag_min;
  if (rij.bedrag_max == null && v.bedrag_max != null) patch.bedrag_max = v.bedrag_max;
  if (!rij.bedrag_indicatie && v.bedrag_indicatie) {
    patch.bedrag_indicatie = v.bedrag_indicatie;
  }
  if (rij.cofinanciering_vereist == null && v.cofinanciering_vereist != null) {
    patch.cofinanciering_vereist = v.cofinanciering_vereist;
  }
  if ((rij.kostensoort ?? []).length === 0 && v.kostensoort.length > 0) {
    patch.kostensoort = v.kostensoort;
  }
  if ((rij.landgoed_route == null || rij.landgoed_route === "onbekend") &&
      v.landgoed_route !== "onbekend") {
    patch.landgoed_route = v.landgoed_route;
    patch.landgoed_route_reden = v.landgoed_route_reden;
    patch.landgoed_partnertype = v.landgoed_partnertype;
  }
  if (!rij.landgoed_route_reden && v.landgoed_route_reden && !patch.landgoed_route_reden) {
    patch.landgoed_route_reden = v.landgoed_route_reden;
  }
  // Herkomst mag alleen omhoog: de bron is nu echt gelezen.
  if (
    HERKOMST_LADDER.indexOf("geverifieerd_bron") >
    HERKOMST_LADDER.indexOf(rij.herkomst ?? "ai")
  ) {
    patch.herkomst = "geverifieerd_bron";
  }

  // ---- 2. Bijlagen: bronlezing, uitsluitingen, beleidstekst ---------------
  telling.bronlezingen += await schrijfBronlezingen(db, rij.id, v);
  telling.uitsluitingen += await schrijfUitsluitingen(db, rij.id, v);
  telling.beleidsteksten += await schrijfBeleidstekst(db, rij.id, v);
  telling.onderliggende_voorstellen += await schrijfOnderliggendeFondsen(
    db,
    rij,
    v,
    bronId,
  );

  // ---- 3. Matchbaarheid, op de stand ná samenvoeging ----------------------
  patch.matchbaarheid = berekenMatchbaarheid({
    herkomst: String(patch.herkomst ?? rij.herkomst ?? "ai"),
    bronnen: v.bronnen,
    kernveldenGevuld: telKernvelden({
      benaderbaarheid: (patch.benaderbaarheid as string) ?? rij.benaderbaarheid,
      aanvrager_type: (patch.aanvrager_type as string) ?? rij.aanvrager_type,
      geo_niveau: (patch.geo_niveau as string) ?? rij.geo_niveau,
      bedrag_min: (patch.bedrag_min as number) ?? rij.bedrag_min,
      bedrag_max: (patch.bedrag_max as number) ?? rij.bedrag_max,
      bedrag_indicatie: (patch.bedrag_indicatie as string) ?? rij.bedrag_indicatie,
      cofinanciering_vereist:
        (patch.cofinanciering_vereist as boolean) ?? rij.cofinanciering_vereist,
      kostensoort: (patch.kostensoort as string[]) ?? rij.kostensoort,
      uitsluitingen_aantal: v.uitsluitingen.length,
      landgoed_route: (patch.landgoed_route as string) ?? rij.landgoed_route,
    }),
  });
  patch.verrijkt_op = new Date().toISOString();
  patch.laatst_gezien = new Date().toISOString();
  // geaccordeerd blijft expliciet ongemoeid: alles is voorstel.

  await moet(db.from("regeling").update(patch).eq("id", rij.id), "regeling verrijken");
}

// Idempotent op de unique (regeling_id, soort, jaar) uit migratie 0050.
async function schrijfBronlezingen(
  db: Db,
  regelingId: string,
  v: Verrijking,
): Promise<number> {
  // Meerdere bronnen van dezelfde soort en hetzelfde jaar botsen op de unique;
  // die voegen we samen tot één rij met beide urls in de samenvatting.
  const gebundeld = new Map<string, { soort: string; jaar: number | null; urls: string[] }>();
  for (const b of v.bronnen) {
    if (!b.gelezen) continue; // niet gelezen = geen lezing
    const sleutel = `${b.soort}|${b.jaar ?? ""}`;
    const bestaand = gebundeld.get(sleutel) ?? { soort: b.soort, jaar: b.jaar, urls: [] };
    if (b.url) bestaand.urls.push(b.url);
    gebundeld.set(sleutel, bestaand);
  }
  const rijen = [...gebundeld.values()].map((g) => ({
    regeling_id: regelingId,
    soort: g.soort,
    jaar: g.jaar,
    url: g.urls[0] ?? null,
    gelezen_op: v.beleidstekst_opgehaald_op,
    samenvatting:
      (v.doelstelling ? `${v.doelstelling}\n\n` : "") +
      (g.urls.length > 1 ? `Meerdere vindplaatsen: ${g.urls.join(" | ")}` : ""),
    herkomst: "geverifieerd_bron",
    geaccordeerd: false,
  }));
  if (rijen.length === 0) return 0;
  await moet(
    db.from("regeling_bronlezing").upsert(rijen, {
      onConflict: "regeling_id,soort,jaar",
    }),
    "bronlezingen schrijven",
  );
  return rijen.length;
}

// Uitsluitingen worden criteria met soort='uitsluiting' en uitkomst='ja': de
// bron stelt aantoonbaar vast dat dit NIET gefinancierd wordt. Het broncitaat
// gaat in uitkomst_toelichting, zodat de gebruiker kan zien waar het op berust.
async function schrijfUitsluitingen(
  db: Db,
  regelingId: string,
  v: Verrijking,
): Promise<number> {
  await moet(
    db
      .from("regeling_criterium")
      .delete()
      .eq("regeling_id", regelingId)
      .eq("soort", "uitsluiting")
      .eq("geaccordeerd", false)
      .in("herkomst", UIT_IMPORT),
    "oude uitsluitingen opruimen",
  );
  const rijen = v.uitsluitingen.map((u) => ({
    regeling_id: regelingId,
    omschrijving: kort(u, 300),
    soort: "uitsluiting",
    fase: "vooraf",
    verplicht: true,
    uitkomst: "ja",
    uitkomst_toelichting: u,
    uitsluiting_reden: kort(u, 300),
    herkomst: "geverifieerd_bron",
    geaccordeerd: false,
  }));
  if (rijen.length === 0) return 0;
  await moet(db.from("regeling_criterium").insert(rijen), "uitsluitingen schrijven");
  return rijen.length;
}

// Eén rij per (regeling, verrijkingsbestand). Ongewijzigde hash = niets doen,
// zodat de embeddings die er later overheen komen niet nodeloos verlopen.
async function schrijfBeleidstekst(
  db: Db,
  regelingId: string,
  v: Verrijking,
): Promise<number> {
  const { data: bestaand } = await db
    .from("regeling_beleidstekst")
    .select("id, tekst_hash, geaccordeerd")
    .eq("regeling_id", regelingId)
    .eq("bron_sleutel", v.slug)
    .maybeSingle();
  const huidig = bestaand as
    | { id: string; tekst_hash: string; geaccordeerd: boolean }
    | null;
  if (huidig && huidig.tekst_hash === v.beleidstekst_hash) return 0;
  if (huidig?.geaccordeerd) return 0; // door een mens vastgesteld, niet aanraken

  await moet(
    db.from("regeling_beleidstekst").upsert(
      {
        regeling_id: regelingId,
        bron_sleutel: v.slug,
        bron_url: v.bronnen.find((b) => b.url)?.url ?? null,
        tekst: v.beleidstekst,
        tekst_hash: v.beleidstekst_hash,
        tekens: v.beleidstekst.length,
        opgehaald_op: v.beleidstekst_opgehaald_op,
        herkomst: "geverifieerd_bron",
        geaccordeerd: false,
        bijgewerkt_op: new Date().toISOString(),
      },
      { onConflict: "regeling_id,bron_sleutel" },
    ),
    "beleidstekst opslaan",
  );
  return 1;
}

// Fondsen op naam onder een koepel staan niet in de catalogus (bij Ars Donandi
// 52 stuks, vier daarvan landgoed-relevant). Zonder deze stap raken we die
// vondst kwijt. Ze komen binnen als voorstel — geaccordeerd=false,
// herkomst='ai_voorstel' — met het moederfonds in `organisatie`, en worden
// nooit overschreven als ze al bestaan.
async function schrijfOnderliggendeFondsen(
  db: Db,
  moeder: RegelingRij,
  v: Verrijking,
  bronId: string | null,
): Promise<number> {
  if (v.onderliggende_fondsen.length === 0) return 0;

  const kandidaten = v.onderliggende_fondsen.map((f) => ({
    extern_id: `${v.slug}--${slugify(f.naam)}`,
    fonds: f,
  }));
  const { data: bestaand } = await db
    .from("regeling")
    .select("extern_id")
    .in(
      "extern_id",
      kandidaten.map((k) => k.extern_id),
    );
  const alAanwezig = new Set(
    ((bestaand ?? []) as { extern_id: string }[]).map((r) => r.extern_id),
  );

  const rijen = kandidaten
    .filter((k) => !alAanwezig.has(k.extern_id))
    .map((k) => ({
      bron_id: bronId,
      extern_id: k.extern_id,
      naam: k.fonds.naam,
      organisatie: v.naam,
      categorie: "regeling",
      scope: "nationaal",
      soort_bron: "fonds",
      rechtskarakter: "privaatrechtelijk",
      bestuurslaag: null,
      bron_url: moeder.bron_url,
      samenvatting:
        `Fonds op naam onder ${v.naam}. ` +
        (k.fonds.reden ? `${k.fonds.reden} ` : "") +
        (k.fonds.relevant === true
          ? "Door de verrijking als landgoed-relevant aangemerkt."
          : k.fonds.relevant === false
            ? "Door de verrijking niet als landgoed-relevant aangemerkt; niet weggegooid, wel laag geprioriteerd."
            : "Relevantie voor landgoederen niet vastgesteld."),
      // Geen route gokken (WERKWIJZE.md: nooit ongefundeerd 'niet_relevant').
      landgoed_route: "onbekend",
      landgoed_route_reden: k.fonds.reden,
      herkomst: "ai_voorstel",
      geaccordeerd: false,
      matchbaarheid: 0,
    }));
  if (rijen.length === 0) return 0;
  await moet(db.from("regeling").insert(rijen), "onderliggende fondsen voorstellen");
  return rijen.length;
}

function slugify(naam: string): string {
  return naam
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function kort(tekst: string, max: number): string {
  return tekst.length <= max ? tekst : `${tekst.slice(0, max - 1)}…`;
}
