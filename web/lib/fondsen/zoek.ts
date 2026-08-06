import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { vraagTekstMetGebruik } from "@/lib/ai";
import { boekAanroep, legeKosten, logKosten, telKosten, type Aanroepkosten, type Kostenoverzicht } from "./kosten";
import {
  aliasIndex,
  toetsPoort,
  trechter,
  type FondsOordeel,
  type Landgoedprofiel,
  type PoortCriterium,
  type RegioAlias,
  type Trechter,
} from "./poort";
import { zoekMatchprofielen } from "./matchprofiel-zoek";
import { shortlist, matchbaarheid, SHORTLIST_OMVANG, type WegingBron, type Weging } from "./weging";
import {
  aantalBeantwoord,
  isTeLaat,
  naarPoortvraag,
  vraagSamenvatting,
  PLANFASE_LABELS,
  type Antwoorden,
} from "./vraag";

// FASE 3 — DE ZOEKPIJPLIJN.
//
// De volgorde van de drie lagen (§5) is niet vrijblijvend; ze houdt de lijst
// eerlijk en de rekenkosten laag:
//
//   Laag 1  de poort (poort.ts) met de antwoorden als vraagparameters. Nul
//           tokens, nul databaseaanroepen. Wie hier afvalt, valt af met reden.
//   Laag 2  goedkope weging op gestructureerde velden plus full-text treffers
//           (weging.ts). Nul tokens. Levert een shortlist van ~25.
//   Laag 3  één modelaanroep over de KAARTJES om te rangschikken, daarna één
//           aanroep over de VOLLEDIGE PROFIELEN van de top ~10 voor de
//           onderbouwing.
//
// Begin je met laag 3, dan krijg je plausibele maar kansloze matches — een fonds
// dat prachtig aansluit maar alleen in Groningen geeft.
//
// DE TIMING-VAL KOMT VÓÓR ALLES (§6). Is de opdracht gegund of de schop de grond
// in, dan wordt er geen enkel model aangeroepen en geen lijst getoond. Dan zegt
// het systeem waaróm het te laat is. Een lijst kansen tonen aan iemand die te
// laat is, is de duurste fout die deze module kan maken: hij kost geld én
// vertrouwen.
//
// WAT HET MODEL BEWEERT MOET TERUG TE VOEREN ZIJN OP HET PROFIEL. Elke
// onderbouwing draagt een letterlijk citaat uit het matchprofiel mee, en dat
// citaat wordt na afloop gecontroleerd: staat het er niet, dan valt het weg en
// zakt de slagingskans. Aannames over het landgoed die niet in `landgoed` staan
// zijn verboden; het model krijgt alleen de velden die er echt in staan.

// claude-sonnet-4-6 ondersteunt geen assistant-message-prefill (de "aanhef"-
// truc hieronder om het model rechtstreeks een JSON-array te laten
// vervolgen) — een aanroep met dat model geeft een 400 op elke rangschik- en
// onderbouwstap, en de pijplijn valt dan stil terug op laag 2 zonder AI-
// onderbouwing. Vastgesteld door de pijplijn echt te draaien, niet door de
// documentatie te lezen. claude-sonnet-4-5 ondersteunt prefill wél.
export const RANGSCHIK_MODEL = process.env.FONDSEN_ZOEK_MODEL ?? "claude-sonnet-4-5";
export const MAX_TONEN = 5;
export const MAX_ONDERBOUWD = 10;
// Het kaartjesblok is het gecachte deel. Boven dit aantal wordt het te duur om
// bij elke vraag opnieuw weg te schrijven; de weging bepaalt dan wie erin komt.
export const MAX_KAARTJES_IN_BLOK = 140;

// ---------------------------------------------------------------------------
// Wat er uit komt
// ---------------------------------------------------------------------------

export type Route = "zelf" | "partner" | "intermediair";

export type Bevinding = {
  fonds_id: string;
  naam: string;
  bron_url: string | null;
  // TWEE APARTE GETALLEN (§5). Slagingskans gaat over dit plan bij dit fonds;
  // matchbaarheid over hoeveel wij van dit fonds weten. Ze mogen nooit tot één
  // getal worden samengevoegd — een fonds waarvan we weinig weten kan geen hoge
  // match krijgen, hoe goed het thema ook aansluit, en dat moet te zien zijn.
  slagingskans: number;
  matchbaarheid: number;
  matchbaarheid_ontbreekt: string[];
  waarom: string;
  citaat: string | null;
  citaat_gecontroleerd: boolean;
  route: Route;
  route_uitleg: string;
  eerste_stap: string;
  // §9.3: één bron is nooit het antwoord. De volgorde in de stapeling.
  rol: "eerste_instapper" | "cofinancier" | "sluitpost" | "onbekend";
  weegscore: number;
  weegredenen: string[];
  waarschuwingen: string[];
  acties: string[];
};

export type ZoekUitkomst = {
  landgoed_id: string;
  vraag_hash: string;
  catalogusversie: string;
  antwoorden: Antwoorden;
  // Gevuld als de gebruiker te laat is; dan is `fondsen` leeg en is er geen
  // enkele modelaanroep gedaan.
  te_laat: { reden: string; wat_wel: string } | null;
  fondsen: Bevinding[];
  // Wat er aan het plan of aan het landgoed zou moeten veranderen om wél in
  // aanmerking te komen. Gevuld als er niets (of bijna niets) overblijft.
  wat_zou_helpen: string[];
  trechter: Trechter;
  kosten: Kostenoverzicht;
  model_gebruikt: boolean;
  toelichting: string;
};

// ---------------------------------------------------------------------------
// Hashes — dezelfde vraag mag niet twee keer betaald worden
// ---------------------------------------------------------------------------
// De hash gaat over (vraag + landgoedprofiel + catalogusversie). Alle drie
// horen erin: verandert het landgoed van rechtsvorm of komt er een fonds bij,
// dan is het antwoord niet meer hetzelfde antwoord, ook al is de vraag woord
// voor woord gelijk.

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function catalogusversie(
  rijen: { id: string; bron_hash?: string | null }[],
): string {
  return sha256(
    rijen
      .map((r) => `${r.id}:${r.bron_hash ?? ""}`)
      .sort()
      .join("\n"),
  );
}

export function profielHash(p: Landgoedprofiel): string {
  return sha256(
    JSON.stringify([
      p.provincie,
      p.gemeente,
      p.rechtsvorm,
      p.nsw_status,
      p.hectare,
      p.ligt_in_natura2000,
      p.ligt_in_nnn,
      p.ligt_op_veengrond,
      [...(p.themas ?? [])].sort(),
    ]),
  );
}

export function vraagHash(
  landgoedId: string,
  a: Antwoorden,
  p: Landgoedprofiel,
  versie: string,
): string {
  const vraag = JSON.stringify([
    a.plan.trim().toLowerCase().replace(/\s+/g, " "),
    a.motivatie.trim().toLowerCase().replace(/\s+/g, " "),
    a.doel,
    a.fase,
    a.bedragband,
    a.aanvrager,
    a.publiek,
  ]);
  return sha256([landgoedId, vraag, profielHash(p), versie].join("|"));
}

// ---------------------------------------------------------------------------
// De aanvrager verandert wíé aanvraagt, niet wat het landgoed is
// ---------------------------------------------------------------------------
// Vraag 4 stuurt uitsluitend de rechtsvormpoort, en alleen naar beneden qua
// hardheid:
//   * "het landgoed zelf" (of geen antwoord) → toets tegen de echte rechtsvorm;
//   * "een stichting" → toets alsof de aanvrager een stichting is, want dat is
//     wat de gebruiker van plan is; het resultaat draagt die aanname zichtbaar;
//   * "een partner" of "weet ik nog niet" → geen rechtsvorm meegeven, zodat de
//     poort op ONBEKEND uitkomt in plaats van af te wijzen. Een onbeantwoorde
//     vraag mag nooit tot afwijzing leiden.

export function profielVoorAanvrager(p: Landgoedprofiel, a: Antwoorden): Landgoedprofiel {
  if (a.aanvrager === "stichting") return { ...p, rechtsvorm: "stichting" };
  if (a.aanvrager === "partner") return { ...p, rechtsvorm: null };
  return p;
}

// ---------------------------------------------------------------------------
// Het kaartjesblok — het stabiele, te cachen deel
// ---------------------------------------------------------------------------
// Voor de cache telt maar één ding: alles tot en met het gemarkeerde blok moet
// byte-voor-byte gelijk zijn. Daarom bevat dit blok GEEN antwoord van de
// gebruiker — het is het kaartjesboek van dit landgoed, samengesteld uit de
// fondsen die door de landgoedgebonden poorten komen (benaderbaarheid,
// geografie, route). De vraagafhankelijke poorten (fase, bedrag, kostensoort)
// staan er bewust buiten: die verschillen per vraag en zouden de cache bij elke
// zoekopdracht ongeldig maken.
//
// Gevolg: de tweede vraag over hetzelfde landgoed leest dit blok uit de cache
// voor een tiende van de prijs. Dat is de hele reden dat de cache-haak in
// lib/ai.ts bestaat.

export function bouwKaartjesblok(fondsen: WegingBron[]): string {
  const regels = [...fondsen]
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, MAX_KAARTJES_IN_BLOK)
    .map((f) => `[${f.id}] ${f.naam}\n${(f.kaartje ?? "(geen kaartje beschikbaar)").trim()}`);
  return `KAARTJESBOEK — ${regels.length} fondsen die voor dit landgoed door de landgoedgebonden poorten komen.\n\n${regels.join("\n\n")}`;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const RANGSCHIK_SYSTEEM = `Je rangschikt fondsen voor een Nederlands landgoed. Je krijgt een kaartjesboek met korte fondskaartjes en daarna een concrete vraag.

HARDE REGELS
* Je baseert je uitsluitend op de kaartjes. Verzin geen fondsen, geen bedragen, geen voorwaarden.
* Je kiest alleen uit de ID's die in de vraag als kandidaat worden genoemd. Een ID dat daar niet bij staat noem je niet.
* Let vooral op wat een fonds UITSLUIT. Een fonds dat thematisch prachtig past maar de gevraagde kostensoort uitsluit hoort laag, niet hoog.
* Bij twijfel neem je een fonds mee met een lage score. Weglaten is erger dan laag zetten: wat wegvalt ziet niemand meer.
* Weet je van een fonds te weinig om iets te vinden, dan zeg je dat in plaats van iets aannemelijks te verzinnen.

ANTWOORDVORM: uitsluitend een JSON-array, geen tekst eromheen:
[{"id":"<uuid>","score":0-100,"kort":"<één zin waarom dit fonds hier hoort, in het Nederlands>"}]
Gesorteerd van hoog naar laag. Maximaal 10 items.`;

const ONDERBOUW_SYSTEEM = `Je onderbouwt per fonds waarom het bij het plan van een Nederlands landgoed past. Je krijgt de volledige matchprofielen van een handvol fondsen en de vraag van de gebruiker.

HARDE REGELS
* Alles wat je beweert moet terug te voeren zijn op het meegeleverde profiel. Elk fonds krijgt een LETTERLIJK citaat uit zijn eigen profiel — overgeschreven, niet geparafraseerd. Kun je geen passend citaat vinden, dan laat je "citaat" leeg; je verzint er geen.
* Je doet geen aannames over het landgoed. Wat niet in de landgoedgegevens staat, weet je niet.
* De slagingskans is een schatting van de kans dat dít fonds dít plan zou honoreren. Wees streng: 70+ betekent dat het profiel het plan expliciet dekt.
* De route is "zelf" (het landgoed kan zelf aanvragen), "partner" (er moet een derde organisatie aanvragen) of "intermediair" (het loopt via een tussenpartij zoals een provinciaal Landschap).
* De eerste stap is één concrete handeling, geen advies in het algemeen. Nooit "dien een aanvraag in" als het profiel zegt dat je eerst moet polsen.
* De rol in de stapeling: "eerste_instapper" (kan als eerste toezeggen), "cofinancier" (wil zien dat er al toezeggingen zijn), "sluitpost" (dekt een restant), "onbekend".
* Niets wordt verstuurd of aangevraagd. Dit is een voorstel voor een mens.

ANTWOORDVORM: uitsluitend een JSON-array, geen tekst eromheen:
[{"id":"<uuid>","slagingskans":0-100,"waarom":"<2-3 zinnen Nederlands>","citaat":"<letterlijk uit het profiel, of leeg>","route":"zelf|partner|intermediair","route_uitleg":"<één zin>","eerste_stap":"<één concrete handeling>","rol":"eerste_instapper|cofinancier|sluitpost|onbekend"}]`;

// Het landgoed in de prompt: alleen velden die daadwerkelijk in `landgoed`
// staan. Geen afgeleide kwalificaties, geen "waarschijnlijk een fraai park".
function landgoedBlok(p: Landgoedprofiel): string {
  const regels: string[] = [];
  if (p.rechtsvorm) regels.push(`rechtsvorm: ${p.rechtsvorm}`);
  if (p.gemeente) regels.push(`gemeente: ${p.gemeente}`);
  if (p.provincie) regels.push(`provincie: ${p.provincie}`);
  if (p.hectare != null) regels.push(`oppervlakte: ${p.hectare} ha`);
  if (p.nsw_status) regels.push(`NSW-status: ${p.nsw_status}`);
  if (p.ligt_in_natura2000 != null) regels.push(`in Natura 2000: ${p.ligt_in_natura2000 ? "ja" : "nee"}`);
  if (p.ligt_in_nnn != null) regels.push(`in NNN: ${p.ligt_in_nnn ? "ja" : "nee"}`);
  return regels.length
    ? `LANDGOEDGEGEVENS (alles wat we hebben; wat er niet staat weten we niet)\n${regels.join("\n")}`
    : "LANDGOEDGEGEVENS: niet ingevuld. Doe geen aannames over dit landgoed.";
}

function vraagBlok(a: Antwoorden): string {
  const waarom = a.motivatie.trim()
    ? `\n\nWAAROM (motivatie, los van wat er gebeurt)\n${a.motivatie.trim()}`
    : "";
  return `DE VRAAG\n${a.plan.trim() || "(geen vrije omschrijving gegeven)"}${waarom}\n\nANTWOORDEN OP DE VIJF VRAGEN\n${vraagSamenvatting(a)}\n\n"Nog niet opgegeven" betekent dat de gebruiker het niet weet. Reken dat niet tegen een fonds, maar noem het als het uitmaakt.`;
}

// ---------------------------------------------------------------------------
// JSON uit een tekstantwoord
// ---------------------------------------------------------------------------
// Het model krijgt "[" als prefill mee, dus wat terugkomt is de rest van de
// array. Faalt het parsen, dan is dat geen reden om de hele zoekopdracht te
// laten klappen: laag 1 en 2 hebben dan al een bruikbare, deterministische
// uitkomst opgeleverd.

function parseArray<T>(tekst: string | null, aanhef = "["): T[] {
  if (!tekst) return [];
  const ruw = `${aanhef}${tekst}`.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const v = JSON.parse(ruw);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    const i = ruw.lastIndexOf("}");
    if (i > 0) {
      try {
        return JSON.parse(`${ruw.slice(0, i + 1)}]`) as T[];
      } catch {
        /* opgeven; de deterministische lagen staan er nog */
      }
    }
    console.error("[fondsen-zoek] modelantwoord niet te lezen als JSON");
    return [];
  }
}

// ---------------------------------------------------------------------------
// Bronnen ophalen
// ---------------------------------------------------------------------------

const REGELING_VELDEN =
  "id, naam, organisatie, samenvatting, categorie, themas, trefwoorden, soort_bron, benaderbaarheid, " +
  "benaderwijze_notitie, aanvrager_type, landgoed_route, landgoed_partnertype, geo_niveau, " +
  "geo_waarden, bedrag_min, bedrag_max, bedrag_indicatie, kostensoort, cofinanciering_vereist, herkomst, bron_url";

export type Catalogus = {
  fondsen: (WegingBron & { bron_url: string | null })[];
  aliassen: RegioAlias[];
  versie: string;
};

export async function laadCatalogus(db: SupabaseClient): Promise<Catalogus> {
  const { data: rijen, error } = await db
    .from("regeling")
    .select(REGELING_VELDEN)
    .in("soort_bron", ["fonds", "lening"])
    .order("naam");
  if (error) throw new Error(`Fondsen ophalen mislukt: ${error.message}`);
  const fondsen = (rijen ?? []) as unknown as (WegingBron & { bron_url: string | null })[];
  const ids = fondsen.map((f) => f.id);

  const [profielen, criteria, lezingen, aliasRijen] = await Promise.all([
    db
      .from("regeling_matchprofiel")
      .select("regeling_id, kaartje, profiel, bron_hash, geaccordeerd")
      .in("regeling_id", ids),
    db
      .from("regeling_criterium")
      .select("regeling_id, omschrijving, veld, operator, waarde, soort, fase")
      .in("regeling_id", ids)
      .eq("fase", "vooraf"),
    db.from("regeling_bronlezing").select("regeling_id").in("regeling_id", ids),
    db.from("regio_alias").select("alias, provincie, gemeenten, landelijk, geaccordeerd"),
  ]);

  const profielPer = new Map<string, { kaartje: string | null; profiel: string; bron_hash: string; geaccordeerd: boolean }>();
  for (const p of (profielen.data ?? []) as {
    regeling_id: string;
    kaartje: string | null;
    profiel: string;
    bron_hash: string;
    geaccordeerd: boolean;
  }[])
    profielPer.set(p.regeling_id, p);

  const criteriaPer = new Map<string, PoortCriterium[]>();
  for (const c of (criteria.data ?? []) as (PoortCriterium & { regeling_id: string })[]) {
    const arr = criteriaPer.get(c.regeling_id) ?? [];
    arr.push(c);
    criteriaPer.set(c.regeling_id, arr);
  }

  const lezingenPer = new Map<string, number>();
  for (const l of (lezingen.data ?? []) as { regeling_id: string }[])
    lezingenPer.set(l.regeling_id, (lezingenPer.get(l.regeling_id) ?? 0) + 1);

  for (const f of fondsen) {
    const mp = profielPer.get(f.id);
    f.kaartje = mp?.kaartje ?? null;
    f.profiel = mp?.profiel ?? null;
    f.matchprofiel_geaccordeerd = mp?.geaccordeerd ?? false;
    f.criteria = criteriaPer.get(f.id) ?? [];
    f.bronlezingen = lezingenPer.get(f.id) ?? 0;
  }

  const aliassen: RegioAlias[] = ((aliasRijen.data ?? []) as {
    alias: string;
    provincie: string | null;
    gemeenten: string[] | null;
    landelijk: boolean | null;
    geaccordeerd: boolean | null;
  }[]).map((r) => ({
    alias: r.alias,
    provincie: r.provincie,
    gemeenten: r.gemeenten ?? [],
    landelijk: Boolean(r.landelijk),
    geaccordeerd: Boolean(r.geaccordeerd),
  }));

  return {
    fondsen,
    aliassen,
    versie: catalogusversie(
      fondsen.map((f) => ({ id: f.id, bron_hash: profielPer.get(f.id)?.bron_hash ?? null })),
    ),
  };
}

// ---------------------------------------------------------------------------
// De pijplijn
// ---------------------------------------------------------------------------

export type ZoekOpties = {
  // Uit zetten in tests en bij een droge run: dan stopt de pijplijn na laag 2 en
  // kost hij aantoonbaar nul.
  gebruikModel?: boolean;
  maxTonen?: number;
};

export async function zoek(
  db: SupabaseClient,
  landgoedId: string,
  profiel: Landgoedprofiel,
  antwoorden: Antwoorden,
  catalogus: Catalogus,
  opties: ZoekOpties = {},
): Promise<ZoekUitkomst> {
  const versie = catalogus.versie;
  const hash = vraagHash(landgoedId, antwoorden, profiel, versie);
  const maxTonen = opties.maxTonen ?? MAX_TONEN;

  // ── De timing-val, vóór alles (§6) ──────────────────────────────────────
  // Geen shortlist, geen model, geen kosten. Alleen het antwoord dat de
  // gebruiker nodig heeft.
  if (isTeLaat(antwoorden.fase)) {
    const fase = PLANFASE_LABELS[antwoorden.fase!];
    return {
      landgoed_id: landgoedId,
      vraag_hash: hash,
      catalogusversie: versie,
      antwoorden,
      te_laat: {
        reden:
          `U gaf aan: ${fase}. Vrijwel geen enkel fonds financiert met terugwerkende kracht — ` +
          "de aanvraag moet vóór de gunning liggen. Zouden we hier een lijst kansen tonen, dan zou " +
          "die lijst niet kloppen: de fondsen die erop staan wijzen een aanvraag voor werk dat al " +
          "gegund of gestart is af, en dat kost u tijd en goodwill.",
        wat_wel:
          "Wat wél kan: (1) knip er een volgende fase af — een tweede laan, een tweede gebouwdeel, " +
          "het beheer ná oplevering — en vraag dáárvoor aan; (2) leg de volgende post uit uw MJOP nu " +
          "al voor, ruim vóór de offerteronde; (3) noteer bij dit project wat er misging in de " +
          "timing, zodat de radar de volgende keer aanslaat op het moment dat u een offerte opvraagt.",
      },
      fondsen: [],
      wat_zou_helpen: [],
      trechter: trechter([]),
      kosten: legeKosten(),
      model_gebruikt: false,
      toelichting: "Geen zoekopdracht uitgevoerd: het plan is voorbij het punt waarop financiering nog kan.",
    };
  }

  // ── Laag 1 — de poort ───────────────────────────────────────────────────
  const index = aliasIndex(catalogus.aliassen);
  const poortProfiel = profielVoorAanvrager(profiel, antwoorden);
  const vraag = naarPoortvraag(antwoorden);
  const oordelen = new Map<string, FondsOordeel>();
  for (const f of catalogus.fondsen) oordelen.set(f.id, toetsPoort(f, poortProfiel, vraag, index));
  const cijfers = trechter([...oordelen.values()]);

  // Afgevallen valt af; onbekend blijft staan. Onbekend is geen nee (§2), en
  // wegfilteren zou precies de fondsen doen verdwijnen waarvan we nog iets
  // moeten uitzoeken.
  const doorDePoort = catalogus.fondsen.filter((f) => oordelen.get(f.id)!.uitkomst !== "afgevallen");

  // Het kaartjesblok is bewust op de LANDGOEDGEBONDEN poort gebaseerd, niet op
  // deze: alleen dan is het tussen twee vragen byte-voor-byte gelijk en levert
  // de cache iets op. Zie de toelichting bij `bouwKaartjesblok`.
  const landgoedOordelen = new Map<string, FondsOordeel>();
  for (const f of catalogus.fondsen)
    landgoedOordelen.set(f.id, toetsPoort(f, profiel, {}, index));
  const kaartjesbasis = catalogus.fondsen.filter(
    (f) => landgoedOordelen.get(f.id)!.uitkomst !== "afgevallen",
  );

  // ── Laag 2 — goedkope weging (nul tokens) ───────────────────────────────
  // Motivatie ("waarom") telt mee in de zoektekst: fondsprofielen benoemen
  // vaak een doelstelling/missie die in de plantekst zelf niet terugkomt.
  const zoektekst = [antwoorden.plan.trim(), antwoorden.motivatie.trim()].filter(Boolean).join(". ");
  const treffers = zoektekst
    ? await zoekMatchprofielen(db, zoektekst, {
        regelingIds: doorDePoort.map((f) => f.id),
        limiet: 100,
      })
    : [];
  const trefferIds = new Set(treffers.map((t) => t.regeling_id));
  // Per fonds wegen mét zijn eigen poortoordeel erbij (dat drukt de score als de
  // bron op punten zwijgt), daarna snijden op de shortlist-omvang.
  const gewogen = doorDePoort
    .map((f) => ({ fonds: f, weging: shortlistVoorEen(f, antwoorden, trefferIds, oordelen.get(f.id)) }))
    .sort(
      (a, b) =>
        b.weging.score - a.weging.score ||
        b.weging.matchbaarheid - a.weging.matchbaarheid ||
        a.fonds.naam.localeCompare(b.fonds.naam),
    )
    .slice(0, SHORTLIST_OMVANG);

  const aanroepen: Aanroepkosten[] = [];

  if (gewogen.length === 0 || opties.gebruikModel === false) {
    const kosten = telKosten(aanroepen);
    logKosten(`landgoed=${landgoedId} (zonder model)`, kosten);
    return {
      landgoed_id: landgoedId,
      vraag_hash: hash,
      catalogusversie: versie,
      antwoorden,
      te_laat: null,
      fondsen: gewogen.slice(0, maxTonen).map((g) => zonderModel(g.fonds, g.weging, oordelen.get(g.fonds.id)!)),
      wat_zou_helpen: watZouHelpen(antwoorden, cijfers, oordelen, gewogen.length),
      trechter: cijfers,
      kosten,
      model_gebruikt: false,
      toelichting:
        gewogen.length === 0
          ? "Er blijft na de harde filters niets over."
          : "Alleen de deterministische lagen zijn gedraaid; er is geen model aangeroepen.",
    };
  }

  // ── Laag 3a — rangschikken over de kaartjes (één aanroep, gecached blok) ──
  const stabielBlok = bouwKaartjesblok(kaartjesbasis);
  const kandidaten = gewogen
    .map(
      (g, i) =>
        `${i + 1}. [${g.fonds.id}] ${g.fonds.naam} (voorselectie ${g.weging.score}/100, matchbaarheid ${g.weging.matchbaarheid}/100)`,
    )
    .join("\n");
  const rangschikPrompt = `${landgoedBlok(profiel)}\n\n${vraagBlok(antwoorden)}\n\nKANDIDATEN — kies uitsluitend uit deze ID's:\n${kandidaten}\n\nGeef de maximaal 10 die hier het beste bij passen, van hoog naar laag.`;

  const rang = await vraagTekstMetGebruik(RANGSCHIK_SYSTEEM, rangschikPrompt, {
    model: RANGSCHIK_MODEL,
    maxTokens: 1500,
    cacheSysteem: true,
    stabielBlok,
    aanhef: "[",
  });
  aanroepen.push(boekAanroep("rangschikken", rang.model, rang.gebruik));

  type RangItem = { id: string; score: number; kort?: string };
  const rangorde = parseArray<RangItem>(rang.tekst).filter((r) =>
    gewogen.some((g) => g.fonds.id === r.id),
  );

  // Model stil of onleesbaar? Dan valt de volgorde terug op laag 2. Dat is een
  // slechtere volgorde, geen kapotte pagina.
  const top = (rangorde.length ? rangorde.map((r) => gewogen.find((g) => g.fonds.id === r.id)!) : gewogen)
    .filter(Boolean)
    .slice(0, MAX_ONDERBOUWD);

  // ── Laag 3b — onderbouwing over de volledige profielen van de top ────────
  const profielblok = top
    .map((g) => `[${g.fonds.id}] ${g.fonds.naam}\n${(g.fonds.profiel ?? g.fonds.kaartje ?? "(geen profiel beschikbaar)").trim()}`)
    .join("\n\n---\n\n");
  const onderbouwPrompt = `${landgoedBlok(profiel)}\n\n${vraagBlok(antwoorden)}\n\nDE PROFIELEN\n\n${profielblok}\n\nOnderbouw per fonds. Laat een fonds weg als het profiel het plan aantoonbaar uitsluit; noem dan geen alternatief dat er niet staat.`;

  const onderbouw = await vraagTekstMetGebruik(ONDERBOUW_SYSTEEM, onderbouwPrompt, {
    model: RANGSCHIK_MODEL,
    maxTokens: 3000,
    cacheSysteem: true,
    aanhef: "[",
  });
  aanroepen.push(boekAanroep("onderbouwen", onderbouw.model, onderbouw.gebruik));

  type OnderbouwItem = {
    id: string;
    slagingskans?: number;
    waarom?: string;
    citaat?: string;
    route?: string;
    route_uitleg?: string;
    eerste_stap?: string;
    rol?: string;
  };
  const onderbouwd = new Map<string, OnderbouwItem>();
  for (const o of parseArray<OnderbouwItem>(onderbouw.tekst)) onderbouwd.set(o.id, o);

  const bevindingen: Bevinding[] = top.map((g) => {
    const o = onderbouwd.get(g.fonds.id);
    const basis = zonderModel(g.fonds, g.weging, oordelen.get(g.fonds.id)!);
    if (!o) return basis;

    // CITAATCONTROLE. Het model mag beweren wat het wil, maar een citaat dat
    // niet letterlijk in het profiel staat is geen onderbouwing. Klopt het niet,
    // dan verdwijnt het citaat en zakt de slagingskans — de bewering blijft
    // staan met de kanttekening dat ze niet te verifiëren was.
    const bron = `${g.fonds.profiel ?? ""}\n${g.fonds.kaartje ?? ""}`;
    const citaat = (o.citaat ?? "").trim();
    const klopt = citaat.length > 15 && genormaliseerdBevat(bron, citaat);

    const modelkans = getal(o.slagingskans, g.weging.score);
    return {
      ...basis,
      slagingskans: begrensSlagingskans(klopt ? modelkans : Math.min(modelkans, 45), g.weging.matchbaarheid),
      waarom: (o.waarom ?? "").trim() || basis.waarom,
      citaat: klopt ? citaat : null,
      citaat_gecontroleerd: klopt,
      route: leesRoute(o.route, basis.route),
      route_uitleg: (o.route_uitleg ?? "").trim() || basis.route_uitleg,
      eerste_stap: (o.eerste_stap ?? "").trim() || basis.eerste_stap,
      rol: leesRol(o.rol),
    };
  });

  // SORTEREN OP SLAGINGSKANS (addendum, besluit van 4 augustus 2026). Binnen de
  // stapeling staat het fonds met de grootste slagingskans bovenaan; de
  // matchbaarheid staat ernaast en wordt er niet in verrekend.
  bevindingen.sort(
    (a, b) => b.slagingskans - a.slagingskans || b.matchbaarheid - a.matchbaarheid || a.naam.localeCompare(b.naam),
  );

  // 1-5 fondsen als er echt een match is, niet 98. Onder de drempel tonen we
  // niets liever dan iets zwaks — behalve als er dan helemaal niets overblijft;
  // dan blijft de best scorende staan mét zijn lage cijfer erbij.
  const DREMPEL = 35;
  let getoond = bevindingen.filter((b) => b.slagingskans >= DREMPEL).slice(0, maxTonen);
  if (getoond.length === 0 && bevindingen.length > 0) getoond = bevindingen.slice(0, 1);

  const kosten = telKosten(aanroepen);
  logKosten(`landgoed=${landgoedId} vraag=${hash.slice(0, 8)}`, kosten);

  return {
    landgoed_id: landgoedId,
    vraag_hash: hash,
    catalogusversie: versie,
    antwoorden,
    te_laat: null,
    fondsen: getoond,
    wat_zou_helpen: watZouHelpen(antwoorden, cijfers, oordelen, getoond.length),
    trechter: cijfers,
    kosten,
    model_gebruikt: true,
    toelichting:
      getoond.length === 0
        ? "Er is geen fonds waarvan het profiel dit plan dekt."
        : `${getoond.length} ${getoond.length === 1 ? "fonds" : "fondsen"} uit ${cijfers.doorgelaten + cijfers.onbekend} die door de poort kwamen.`,
  };
}

// Weging voor één fonds, met zijn poortoordeel erbij. `shortlist` doet dit voor
// een hele lijst; hier is het per fonds nodig omdat elk fonds zijn eigen
// oordeel meekrijgt.
function shortlistVoorEen(
  f: WegingBron,
  antwoorden: Antwoorden,
  zoektreffers: Set<string>,
  oordeel: FondsOordeel | undefined,
): Weging {
  return shortlist([f], { antwoorden, zoektreffers, oordeel }, 1)[0].weging;
}

// ---------------------------------------------------------------------------
// Hulpjes
// ---------------------------------------------------------------------------

function getal(v: unknown, terugval: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : terugval;
}

// EEN LAGE MATCHBAARHEID IS EEN PLAFOND (§5). Weten we weinig van een fonds, dan
// kan de slagingskans niet hoog zijn — hoe overtuigend het model ook klinkt.
// Vijftien punten speelruimte: het model mag iets zien dat de velden niet
// vangen, maar niet een heel ander verhaal vertellen.
export const SPEELRUIMTE_BOVEN_MATCHBAARHEID = 15;

export function begrensSlagingskans(kans: number, matchbaar: number): number {
  return Math.max(0, Math.min(kans, matchbaar + SPEELRUIMTE_BOVEN_MATCHBAARHEID));
}

function genormaliseerdBevat(hooiberg: string, naald: string): boolean {
  const n = (s: string) => s.toLowerCase().replace(/[\s“”"'’‘–—-]+/g, " ").trim();
  return n(hooiberg).includes(n(naald));
}

function leesRoute(v: unknown, terugval: Route): Route {
  return v === "zelf" || v === "partner" || v === "intermediair" ? v : terugval;
}

function leesRol(v: unknown): Bevinding["rol"] {
  return v === "eerste_instapper" || v === "cofinancier" || v === "sluitpost" ? v : "onbekend";
}

// De bevinding zoals hij eruitziet zonder modelaanroep: alles wat laag 1 en 2
// deterministisch hebben opgeleverd. Dit is tegelijk het vangnet als het model
// niets bruikbaars teruggeeft.
function zonderModel(f: WegingBron & { bron_url?: string | null }, w: Weging, o: FondsOordeel): Bevinding {
  const m = matchbaarheid(f);
  const route: Route =
    f.benaderbaarheid === "via_intermediair"
      ? "intermediair"
      : f.aanvrager_type === "derde_partij"
        ? "partner"
        : "zelf";
  return {
    fonds_id: f.id,
    naam: f.naam,
    bron_url: f.bron_url ?? null,
    slagingskans: begrensSlagingskans(w.score, w.matchbaarheid),
    matchbaarheid: w.matchbaarheid,
    matchbaarheid_ontbreekt: m.ontbreekt,
    waarom: w.redenen.join(" ") || "Komt door de harde filters heen; verder is er nog niets over te zeggen.",
    citaat: null,
    citaat_gecontroleerd: false,
    route,
    route_uitleg:
      route === "intermediair"
        ? "Dit fonds neemt directe aanvragen niet in behandeling; het loopt via een tussenpartij."
        : route === "partner"
          ? "Alleen een derde organisatie kan hier aanvragen; het landgoed komt op háár begroting."
          : "Het landgoed kan hier zelf aanvragen.",
    eerste_stap:
      route === "zelf"
        ? "Pols eerst informeel of dit plan binnen hun kaders valt, vóór u een aanvraag indient."
        : "Zoek de partij die hier wél mag indienen en leg uw plan daar neer.",
    rol: "onbekend",
    weegscore: w.score,
    weegredenen: w.redenen,
    waarschuwingen: o.waarschuwingen,
    acties: o.acties,
  };
}

// ---------------------------------------------------------------------------
// Wat zou er moeten veranderen?
// ---------------------------------------------------------------------------
// Is er niets, dan is "geen resultaten" het slechtste antwoord dat we kunnen
// geven. De hoofdredenen uit de trechter zeggen precies wát er in de weg staat,
// en dat is bruikbare informatie: geen ANBI-vehikel, verkeerde provincie, geen
// publiekscomponent, verkeerde kostensoort.

export function watZouHelpen(
  a: Antwoorden,
  t: Trechter,
  oordelen: Map<string, FondsOordeel>,
  aantalGetoond: number,
): string[] {
  if (aantalGetoond >= 3) return [];
  const uit: string[] = [];
  const h = t.hoofdreden;

  if (h.rechtsvorm > 0)
    uit.push(
      `${h.rechtsvorm} fondsen vielen af op de rechtsvorm van de aanvrager. Veel fondsen geven uitsluitend aan stichtingen, verenigingen of ANBI's. Een steunstichting oprichten is hier geen formaliteit maar de grootste enkele knop: die opent in één keer een groot deel van de lijst.`,
    );
  if (h.kostensoort > 0)
    uit.push(
      `${h.kostensoort} fondsen vielen af op de kostensoort. Er wordt geïnvesteerd, gerestaureerd en geprojecteerd, niet onderhouden. Herkader het plan als restauratie van een benoemd onderdeel, of als één afgebakend project met begin en eind.`,
    );
  if (h.geografie > 0)
    uit.push(
      `${h.geografie} fondsen werken buiten uw provincie. Daar valt niets aan te doen, maar het verklaart wel waarom de lijst korter is dan de catalogus.`,
    );
  if (h.bedragband > 0)
    uit.push(
      `${h.bedragband} fondsen vielen af op de orde van grootte. Knip het project in delen die per fonds wél binnen de band vallen — één begroting, meerdere aanvragen (de stapeling).`,
    );
  if (a.publiek === "nee" || a.publiek === null)
    uit.push(
      "Publiekstoegankelijkheid is de knop die het meeste opent: veel fondsen willen maatschappelijk rendement zien. Een wandelpad, een open dag of een educatieprogramma bij dit plan brengt fondsen in beeld die nu buiten schot blijven.",
    );
  if (aantalBeantwoord(a) < 3)
    uit.push(
      `U liet ${5 - aantalBeantwoord(a)} van de vijf vragen open. Dat leidt niet tot afwijzing, maar wel tot een vager resultaat: zonder orde van grootte en zonder aanvrager kunnen de bedragband- en rechtsvormtoets niets zeggen.`,
    );

  const teUitzoeken = [...oordelen.values()].filter((o) => o.uitkomst === "onbekend" && o.onderzocht).length;
  if (teUitzoeken > 0 && uit.length < 3)
    uit.push(
      `Bij ${teUitzoeken} fondsen zegt de bron op minstens één punt niets. Dat is geen 'nee' maar uitzoekwerk — het beleidsplan van zo'n fonds ophalen en lezen brengt ze alsnog in beeld.`,
    );

  return uit;
}
