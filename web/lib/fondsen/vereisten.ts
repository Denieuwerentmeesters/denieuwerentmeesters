import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { vraagTekst } from "@/lib/ai";
import { moet } from "@/lib/db";
import { CATEGORIE_PER_VEREISTE, EXTERN_VAN_NATURE, GENEREERBARE_TYPEN } from "./dossier";
import {
  SCHOONMAAK_VERSIE,
  schoonBeleidstekst,
  type SchoonmaakRapport,
} from "./beleidstekst-schoonmaak";
import type { Beleidsdocument } from "./matchprofiel";

// DOCUMENTVEREISTEN uit de al opgehaalde beleidstekst — geen nieuwe
// verrijkingsronde, puur destilleren (§4 van het plan).
//
// WAAROM DIT EEN APARTE STAP IS EN NIET IN matchprofiel.ts ZIT
// De matchprofiel-prompt is al vol (uitsluitingen, structuur, beleidstekst) en
// gaat over WAT een fonds wil. Deze prompt gaat over WELKE STUKKEN een aanvraag
// nodig heeft — een andere vraag aan dezelfde bron, met een eigen faalmodus
// (een gemiste bijlage-eis is net zo erg als een gemiste uitsluiting) die een
// eigen, scherpe instructie verdient in plaats van te verdrinken in een prompt
// die al veel moet.
//
// DE HARDE REGEL: GEEN RIJ ZONDER CITAAT. Elke regel die dit destillaat
// oplevert krijgt een `bron_tekst` met een letterlijk citaat uit de
// beleidstekst. Kan het model niets citeren, dan bestaat de rij niet — een
// documentenlijst die half verzonnen is, is gevaarlijker dan geen lijst: een
// gebruiker die op zo'n lijst afgaat mist een KvK-uittreksel dat het fonds wél
// eiste, of stuurt een taxatierapport op dat nergens voor nodig was.

// Zuinig model: destilleren, geen redeneren. Zelfde keuze als matchprofiel.ts.
export const VEREISTEN_MODEL =
  process.env.FONDSEN_VEREISTEN_MODEL ?? "claude-haiku-4-5";

export const MAX_VEREISTEN_TOKENS = 2000;
export const MAX_BRON_TEKENS = 60_000;

const ANTWOORD_AANHEF = "[";

export const VEREISTE_TYPEN = [
  "projectplan",
  "begroting",
  "dekkingsplan",
  "offerte",
  "kostenraming",
  "jaarrekening",
  "jaarverslag",
  "statuten",
  "kvk_uittreksel",
  "anbi_bewijs",
  "bestuurssamenstelling",
  "bankgegevens",
  "eigendomsbewijs",
  "vergunning",
  "monumentgegevens",
  "beheerplan",
  "fotos",
  "steunbrief",
  "aanvraagformulier",
  "overig",
] as const;
export type VereisteType = (typeof VEREISTE_TYPEN)[number];

export const FASEN = ["vooraf", "bij_aanvraag", "achteraf"] as const;
export type VereisteFase = (typeof FASEN)[number];

export const VERPLICHTHEDEN = ["verplicht", "aanbevolen", "soms"] as const;
export type VereisteVerplichtheid = (typeof VERPLICHTHEDEN)[number];

// Wat de UI opstelt (§4): projectplan, begroting, dekkingsplan, een
// aanvraagbrief/-formulier. Alles wat van BUITEN moet komen — een offerte, een
// vergunning, een taxatie, een KvK-uittreksel — is altijd false. Bij twijfel
// blijft het veld leeg (null): de detailpagina toont dat als "nog niet
// ingedeeld", en dat is de eerlijke stand, geen gok.
//
// HERGEBRUIKT, niet gedupliceerd: `GENEREERBARE_TYPEN` en `EXTERN_VAN_NATURE`
// komen letterlijk uit dossier.ts — dat zijn dezelfde twee lijsten waarmee de
// detailpagina een strijdige toezegging herkent (`strijdigeToezegging`). Zou
// deze module een eigen kopie bijhouden, dan kan die stilzwijgend uit de pas
// gaan lopen met wat de pagina zelf als "wij kunnen dit niet maken" beschouwt.
export const ZELF_OP_TE_STELLEN_VASTE_TYPEN: Record<VereisteType, boolean | null> = Object.fromEntries(
  VEREISTE_TYPEN.map((type) => [
    type,
    EXTERN_VAN_NATURE.has(type)
      ? false
      : GENEREERBARE_TYPEN.has(type)
        ? true
        : null,
  ]),
) as Record<VereisteType, boolean | null>;

export type VereistenBron = {
  regeling_id: string;
  naam: string;
  beleidsteksten: Beleidsdocument[];
};

function sha256(waarde: string): string {
  return createHash("sha256").update(waarde).digest("hex");
}

// Hash over de beleidstekst(en) plus promptversie en schoonmaakversie: dezelfde
// opzet als bronHash/beleidstekstHash in matchprofiel.ts. Ongewijzigde bron =
// geen nieuwe modelaanroep.
export function vereistenHash(bron: VereistenBron): string {
  const regels = bron.beleidsteksten
    .map((d) => `${d.bron_sleutel}:${d.tekst_hash}`)
    .sort()
    .join("\n");
  return sha256([regels, PROMPT_VERSIE, VEREISTEN_MODEL, SCHOONMAAK_VERSIE].join("|"));
}

// Ophogen bij een inhoudelijke wijziging van de prompt hieronder.
export const PROMPT_VERSIE = "vereisten-v1";

const VEREISTEN_SYSTEEM = `Je haalt AANVRAAGVEREISTEN uit de beleidstekst van een Nederlands fonds voor de fondsenradar van een landgoedplatform.

Dit is GEEN samenvatten en GEEN redeneren. Je zoekt letterlijk de passage(s) op waar het fonds beschrijft welke stukken een aanvraag nodig heeft, en zet die om in losse regels.

HARDE REGELS:
1. GEEN RIJ ZONDER CITAAT. Elke regel krijgt een "citaat" met een letterlijk fragment uit de beleidstekst hieronder — woord voor woord overgenomen, geen parafrase. Kun je niets citeren voor een vermeend vereiste, dan verzin je die rij niet.
2. Vind je in de hele beleidstekst niets over aanvraagvereisten of benodigde documenten, geef dan een lege lijst terug: []. Dat is een eerlijk antwoord, geen fout.
3. Splits een opsomming in losse regels — "KvK-uittreksel, statuten en jaarverslag" wordt drie regels, niet één.
4. Herken voorwaardelijke eisen ("als de aanvrager een rechtspersoon is", "indien van toepassing") en zet verplichtheid dan op "soms", niet op "verplicht".
5. Blijf strikt bij het fonds waarvoor deze tekst is opgehaald. Gaat de tekst over een koepel met meerdere fondsen op naam, neem dan alleen de vereisten over die voor dit ene fonds gelden of die algemeen voor de koepel gelden — nooit vereisten van een ander met naam genoemd fonds op naam.

Geef uitsluitend een JSON-array terug, in dit format, niets ervoor of erna:
[
  {
    "omschrijving": "korte beschrijving zoals het fonds het noemt, bijv. 'Uittreksel KvK niet ouder dan 1 jaar'",
    "vereiste_type": "een van: projectplan, begroting, dekkingsplan, offerte, kostenraming, jaarrekening, jaarverslag, statuten, kvk_uittreksel, anbi_bewijs, bestuurssamenstelling, bankgegevens, eigendomsbewijs, vergunning, monumentgegevens, beheerplan, fotos, steunbrief, aanvraagformulier, overig",
    "fase": "vooraf | bij_aanvraag | achteraf",
    "verplichtheid": "verplicht | aanbevolen | soms",
    "citaat": "het letterlijke fragment uit de beleidstekst waar dit op berust"
  }
]`;

function kortBeleidsteksten(
  documenten: Beleidsdocument[],
  max: number,
): { blokken: string[]; ingekort: boolean; schoonmaak: SchoonmaakRapport } {
  const schoonRapporten: SchoonmaakRapport[] = [];
  const schoon = documenten.map((d) => {
    const { tekst, rapport } = schoonBeleidstekst(d.tekst);
    schoonRapporten.push(rapport);
    return { ...d, tekst };
  });

  let resterend = max;
  let ingekort = false;
  const blokken = schoon.map((d) => {
    const kop = `--- Bron: ${d.bron_sleutel}${d.bron_url ? ` (${d.bron_url})` : ""} ---`;
    let tekst = d.tekst;
    if (tekst.length > resterend) {
      tekst = `${tekst.slice(0, Math.max(0, resterend))}\n[…ingekort…]`;
      ingekort = true;
    }
    resterend = Math.max(0, resterend - tekst.length);
    return `${kop}\n${tekst}`;
  });

  const tekens_voor = schoonRapporten.reduce((s, r) => s + r.tekens_voor, 0);
  const tekens_na = schoonRapporten.reduce((s, r) => s + r.tekens_na, 0);
  const totaal: SchoonmaakRapport = {
    tekens_voor,
    tekens_na,
    verwijderd: schoonRapporten.reduce((s, r) => s + r.verwijderd, 0),
    aandeel: tekens_voor > 0 ? 1 - tekens_na / tekens_voor : 0,
    regels_voor: schoonRapporten.reduce((s, r) => s + r.regels_voor, 0),
    regels_na: schoonRapporten.reduce((s, r) => s + r.regels_na, 0),
    per_categorie: {},
    behouden_door_beleidssignaal: schoonRapporten.reduce(
      (s, r) => s + r.behouden_door_beleidssignaal,
      0,
    ),
  };

  return { blokken, ingekort, schoonmaak: totaal };
}

export function bouwVereistenPrompt(
  bron: VereistenBron,
  max = MAX_BRON_TEKENS,
): { systeem: string; prompt: string; ingekort: boolean; schoonmaak: SchoonmaakRapport } {
  const { blokken, ingekort, schoonmaak } = kortBeleidsteksten(bron.beleidsteksten, max);
  const beleid = blokken.length
    ? blokken.join("\n\n")
    : "(Geen beleidstekst beschikbaar.)";

  const prompt = [
    `Fonds: ${bron.naam}`,
    "",
    "=== BELEIDSTEKST ===",
    beleid,
    "",
    "Geef nu de JSON-array met aanvraagvereisten, of [] als er niets over te vinden is.",
  ].join("\n");

  return { systeem: VEREISTEN_SYSTEEM, prompt, ingekort, schoonmaak };
}

export type GedestilleerdeVereiste = {
  omschrijving: string;
  vereiste_type: VereisteType;
  fase: VereisteFase;
  verplichtheid: VereisteVerplichtheid;
  citaat: string;
};

function valideerVereiste(ruw: unknown): GedestilleerdeVereiste | null {
  if (!ruw || typeof ruw !== "object") return null;
  const r = ruw as Record<string, unknown>;
  const omschrijving = typeof r.omschrijving === "string" ? r.omschrijving.trim() : "";
  const citaat = typeof r.citaat === "string" ? r.citaat.trim() : "";
  const vereiste_type = VEREISTE_TYPEN.includes(r.vereiste_type as VereisteType)
    ? (r.vereiste_type as VereisteType)
    : "overig";
  const fase = FASEN.includes(r.fase as VereisteFase) ? (r.fase as VereisteFase) : "bij_aanvraag";
  const verplichtheid = VERPLICHTHEDEN.includes(r.verplichtheid as VereisteVerplichtheid)
    ? (r.verplichtheid as VereisteVerplichtheid)
    : "verplicht";

  // DE HARDE REGEL: zonder bruikbaar citaat bestaat de rij niet. "Bruikbaar"
  // betekent hier: niet leeg en niet triviaal kort (een enkel woord is geen
  // citaat, dat is het model dat een verplichting verzint om het veld te vullen).
  if (!omschrijving || citaat.length < 8) return null;

  return { omschrijving, vereiste_type, fase, verplichtheid, citaat };
}

// Witruimte plat maken zodat een citaat dat het model met andere regeleindes of
// dubbele spaties teruggeeft nog steeds als "letterlijk" herkend wordt — zonder
// daarmee de eis te verzwakken dat de WOORDEN zelf uit de bron komen.
function platgeslagen(tekst: string): string {
  return tekst.replace(/\s+/g, " ").trim();
}

/**
 * DE CONTROLEERBARE VERSIE VAN "GEEN RIJ ZONDER CITAAT". De prompt vráágt om een
 * letterlijk fragment; dit is de plek waar dat ook echt gecontroleerd wordt tegen
 * de RUWE brontekst (vóór schoonmaak/inkorting) — een model dat een citaat
 * verzint of parafraseert mag daar niet mee wegkomen omdat het toevallig
 * plausibel klinkt.
 */
export function citaatKomtUitBron(citaat: string, ruweBron: string): boolean {
  const c = platgeslagen(citaat);
  if (c.length < 8) return false;
  return platgeslagen(ruweBron).includes(c);
}

/**
 * Filtert vereisten waarvan het citaat niet (meer) letterlijk in de opgegeven
 * ruwe brontekst(en) staat. Dit is de harde afdwinging uit de opdracht: een
 * model-antwoord zonder bruikbaar citaat voor een punt levert domweg geen rij
 * op, ongeacht wat de prompt beloofde.
 */
export function filterOpLetterlijkCitaat(
  vereisten: GedestilleerdeVereiste[],
  beleidsteksten: Beleidsdocument[],
): GedestilleerdeVereiste[] {
  const ruweBron = beleidsteksten.map((d) => d.tekst).join("\n");
  return vereisten.filter((v) => citaatKomtUitBron(v.citaat, ruweBron));
}

export function parseVereisten(tekst: string | null): GedestilleerdeVereiste[] {
  if (!tekst) return [];
  const schoon = tekst
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  let ruw: unknown;
  try {
    ruw = JSON.parse(schoon);
  } catch {
    // Prefill-herstel: het antwoord kan halverwege afgekapt zijn (max_tokens).
    // Knip na het laatste volledige object en sluit de array.
    const idx = schoon.lastIndexOf("},");
    if (idx <= 0) return [];
    try {
      ruw = JSON.parse(`${schoon.slice(0, idx + 1)}]`);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(ruw)) return [];
  return ruw.map(valideerVereiste).filter((v): v is GedestilleerdeVereiste => v !== null);
}

/** Rij zoals die naar `regeling_bewijs` gaat. */
export type VereisteRij = {
  regeling_id: string;
  omschrijving: string;
  vereiste_type: VereisteType;
  fase: VereisteFase;
  verplichtheid: VereisteVerplichtheid;
  zelf_op_te_stellen: boolean | null;
  document_categorie: string | null;
  bron_tekst: string;
  herkomst: "ai_voorstel";
  geaccordeerd: false;
};

export function naarRijen(
  regelingId: string,
  vereisten: GedestilleerdeVereiste[],
): VereisteRij[] {
  return vereisten.map((v) => ({
    regeling_id: regelingId,
    omschrijving: v.omschrijving,
    vereiste_type: v.vereiste_type,
    fase: v.fase,
    verplichtheid: v.verplichtheid,
    zelf_op_te_stellen: ZELF_OP_TE_STELLEN_VASTE_TYPEN[v.vereiste_type],
    document_categorie: CATEGORIE_PER_VEREISTE[v.vereiste_type] ?? null,
    bron_tekst: v.citaat,
    herkomst: "ai_voorstel",
    geaccordeerd: false,
  }));
}

export type VereistenResultaat = {
  vereisten: GedestilleerdeVereiste[];
  hash: string;
  ingekort: boolean;
  schoonmaak: SchoonmaakRapport;
  // Hoeveel kandidaten `filterOpLetterlijkCitaat` heeft verworpen omdat het
  // citaat niet (meer) letterlijk in de brontekst stond. 0 is de normale,
  // gezonde stand; een positief getal is het zichtbare bewijs dat de harde eis
  // ook echt iets tegenhoudt, niet alleen een instructie in de prompt is.
  citaat_verworpen: number;
};

// Geeft null als de AI-laag niet beschikbaar is of de aanroep mislukt. Geen
// fallback op nulresultaat-als-succes: de aanroeper moet het verschil kunnen
// zien tussen "geen vereisten gevonden" (lege array, wel geslaagd) en "de
// aanroep zelf ging mis" (null).
export async function destilleerVereisten(
  bron: VereistenBron,
  opties?: { model?: string; maxTekens?: number },
): Promise<VereistenResultaat | null> {
  const model = opties?.model ?? VEREISTEN_MODEL;
  const opbouw = bouwVereistenPrompt(bron, opties?.maxTekens ?? MAX_BRON_TEKENS);
  const tekst = await vraagTekst(opbouw.systeem, opbouw.prompt, {
    model,
    maxTokens: MAX_VEREISTEN_TOKENS,
    cacheSysteem: true,
    aanhef: ANTWOORD_AANHEF,
  });
  if (tekst === null) return null;

  const volledig = tekst.startsWith(ANTWOORD_AANHEF) ? tekst : `${ANTWOORD_AANHEF}${tekst}`;
  const ruw = parseVereisten(volledig);
  // Niet alleen vertrouwen op wat het model beweert te citeren: controleren
  // tegen de ONGESCHOONDE brontekst. Een geparafraseerd of verzonnen citaat
  // valt hier weg, ongeacht hoe overtuigend het klinkt.
  const vereisten = filterOpLetterlijkCitaat(ruw, bron.beleidsteksten);

  return {
    vereisten,
    hash: vereistenHash(bron),
    ingekort: opbouw.ingekort,
    schoonmaak: opbouw.schoonmaak,
    citaat_verworpen: ruw.length - vereisten.length,
  };
}

// ---------------------------------------------------------------------------
// Batchgewijze ingestie: regeling_beleidstekst -> regeling_bewijs
// ---------------------------------------------------------------------------
// Spiegelt matchprofiel-ingestie.ts: batchgewijs, per fonds meteen wegschrijven,
// idempotent via de hash op regeling.bewijs_bron_hash (migratie 0059 — er is
// geen enkele regeling_bewijs-rij om een hash op te hangen, dus die hoort bij
// het fonds zelf).

type Db = SupabaseClient;

// De tekst die de import van 121 fondsen als plaatsvervanger neerzette toen er
// nog geen documentvereisten-destillatie bestond (herkomst 'afgeleid_tag'). Een
// fonds met UITSLUITEND zo'n rij heeft nog geen echte destillatie gehad en mag
// vervangen worden zodra er een bron is; alle andere bestaande content (ook
// niet-geaccordeerd, bv. handmatig ingevoerd of 'geverifieerd_bron') wordt met
// rust gelaten — die is niet door deze stap neergezet en dus niet aan deze stap
// om te overschrijven.
export const PLACEHOLDER_OMSCHRIJVINGEN = new Set([
  "Niet onderzocht op documentvereisten — raadpleeg bronlink of neem contact op.",
  "Niet onderzocht",
]);

export type VereistenTelling = {
  bekeken: number;
  gemaakt: number;
  ongewijzigd: number;
  geen_beleidstekst: { regeling_id: string; naam: string }[];
  overgeslagen_geaccordeerd: { regeling_id: string; naam: string }[];
  overgeslagen_bestaande_content: { regeling_id: string; naam: string }[];
  leeg: { regeling_id: string; naam: string }[];
  mislukt: { regeling_id: string; naam: string; reden: string }[];
  model: string;
  afgekapt_op_limiet: boolean;
  fout?: string;
};

export type VereistenOpties = {
  // Hoeveel fondsen deze run maximaal een MODELAANROEP mogen kosten.
  limiet?: number;
  regelingId?: string;
  model?: string;
  forceer?: boolean;
};

type RegelingRij = { id: string; naam: string; bewijs_bron_hash: string | null };
type BeleidstekstRij = {
  regeling_id: string;
  bron_sleutel: string;
  bron_url: string | null;
  tekst: string;
  tekst_hash: string;
  opgehaald_op: string | null;
};
type BewijsRij = { id: string; regeling_id: string; omschrijving: string; geaccordeerd: boolean };

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

export async function genereerVereisten(
  db: Db,
  opties: VereistenOpties = {},
): Promise<VereistenTelling> {
  const model = opties.model ?? VEREISTEN_MODEL;
  const telling: VereistenTelling = {
    bekeken: 0,
    gemaakt: 0,
    ongewijzigd: 0,
    geen_beleidstekst: [],
    overgeslagen_geaccordeerd: [],
    overgeslagen_bestaande_content: [],
    leeg: [],
    mislukt: [],
    model,
    afgekapt_op_limiet: false,
  };

  let vraag = db
    .from("regeling")
    .select("id, naam, bewijs_bron_hash")
    .in("soort_bron", ["fonds", "lening"])
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

  const beleidRijen = await inBlokken<BeleidstekstRij>(ids, async (deel) => {
    const { data } = await db
      .from("regeling_beleidstekst")
      .select("regeling_id, bron_sleutel, bron_url, tekst, tekst_hash, opgehaald_op")
      .in("regeling_id", deel);
    return (data ?? []) as unknown as BeleidstekstRij[];
  });
  const beleidPerRegeling = new Map<string, Beleidsdocument[]>();
  for (const r of beleidRijen) {
    const lijst = beleidPerRegeling.get(r.regeling_id) ?? [];
    lijst.push({
      bron_sleutel: r.bron_sleutel,
      bron_url: r.bron_url,
      tekst: r.tekst,
      tekst_hash: r.tekst_hash,
      opgehaald_op: r.opgehaald_op,
    });
    beleidPerRegeling.set(r.regeling_id, lijst);
  }
  // Stabiele volgorde: geen valse hash-wijziging door databasevolgorde.
  for (const lijst of beleidPerRegeling.values()) {
    lijst.sort((a, b) => a.bron_sleutel.localeCompare(b.bron_sleutel));
  }

  const bestaandeBewijsRijen = await inBlokken<BewijsRij>(ids, async (deel) => {
    const { data } = await db
      .from("regeling_bewijs")
      .select("id, regeling_id, omschrijving, geaccordeerd")
      .in("regeling_id", deel);
    return (data ?? []) as unknown as BewijsRij[];
  });
  const bewijsPerRegeling = new Map<string, BewijsRij[]>();
  for (const r of bestaandeBewijsRijen) {
    const lijst = bewijsPerRegeling.get(r.regeling_id) ?? [];
    lijst.push(r);
    bewijsPerRegeling.set(r.regeling_id, lijst);
  }

  const limiet = opties.limiet ?? rijen.length;
  let aanroepen = 0;

  for (const rij of rijen) {
    const beleidsteksten = beleidPerRegeling.get(rij.id) ?? [];
    if (beleidsteksten.length === 0) {
      // Niets om te destilleren: geen brontekst is geen fout, maar wél een gat
      // dat zichtbaar moet blijven i.p.v. een gok op te leveren.
      telling.geen_beleidstekst.push({ regeling_id: rij.id, naam: rij.naam });
      continue;
    }

    const bestaandeRijen = bewijsPerRegeling.get(rij.id) ?? [];
    if (bestaandeRijen.some((b) => b.geaccordeerd)) {
      // Door een mens vastgesteld: dit hele fonds blijft onaangeroerd.
      telling.overgeslagen_geaccordeerd.push({ regeling_id: rij.id, naam: rij.naam });
      continue;
    }
    const nietPlaceholder = bestaandeRijen.filter(
      (b) => !PLACEHOLDER_OMSCHRIJVINGEN.has(b.omschrijving),
    );
    if (nietPlaceholder.length > 0) {
      // Er staat al echte, niet-geaccordeerde content (bv. handmatig of
      // 'geverifieerd_bron' ingevoerd) die niet door deze stap is neergezet.
      // Die overschrijven zou werk van een mens ongevraagd wegvegen.
      telling.overgeslagen_bestaande_content.push({ regeling_id: rij.id, naam: rij.naam });
      continue;
    }
    const placeholderRijen = bestaandeRijen.filter((b) =>
      PLACEHOLDER_OMSCHRIJVINGEN.has(b.omschrijving),
    );

    const bron: VereistenBron = { regeling_id: rij.id, naam: rij.naam, beleidsteksten };
    const nieuweHash = vereistenHash(bron);

    if (!opties.forceer && rij.bewijs_bron_hash && rij.bewijs_bron_hash === nieuweHash) {
      telling.ongewijzigd++;
      continue;
    }

    if (aanroepen >= limiet) {
      telling.afgekapt_op_limiet = true;
      break;
    }
    aanroepen++;

    let resultaat: VereistenResultaat | null;
    try {
      resultaat = await destilleerVereisten(bron, { model });
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

    const nieuweRijen = naarRijen(rij.id, resultaat.vereisten);

    // METEEN wegschrijven, per fonds: eerst de placeholder(s) weg, dan de
    // nieuwe rijen erbij, dan de hash bijwerken — in die volgorde blijft een
    // afgebroken run herkenbaar (hash niet bijgewerkt = volgende run pakt het
    // fonds gewoon opnieuw op).
    if (placeholderRijen.length > 0) {
      await moet(
        db
          .from("regeling_bewijs")
          .delete()
          .in(
            "id",
            placeholderRijen.map((p) => p.id),
          ),
        "placeholder-bewijsrij verwijderen",
      );
    }
    if (nieuweRijen.length > 0) {
      await moet(db.from("regeling_bewijs").insert(nieuweRijen), "vereisten opslaan");
    } else {
      telling.leeg.push({ regeling_id: rij.id, naam: rij.naam });
    }
    await moet(
      db
        .from("regeling")
        .update({ bewijs_bron_hash: nieuweHash, bewijs_bijgewerkt_op: new Date().toISOString() })
        .eq("id", rij.id),
      "bewijs_bron_hash bijwerken",
    );

    telling.gemaakt++;
  }

  return telling;
}
