import {
  BEDRAGBAND_GRENZEN,
  DOEL_KOSTENSOORT,
  DOEL_THEMAWOORDEN,
  type Antwoorden,
} from "./vraag";
import type { FondsOordeel, PoortFonds } from "./poort";

// LAAG 2 — de goedkope weging (§5 van het implementatieplan).
//
// Nul tokens. Alles hier is een vergelijking op gestructureerde velden plus de
// treffers uit het full-text zoeken (dat Postgres doet). Het doel is niet om te
// bepalen wélk fonds het beste past — dat kan een woordvergelijking niet — maar
// om de ~100 fondsen die door de poort komen terug te brengen tot ~25 die het
// model mag lezen. Die snede is de reden dat een zoekopdracht centen kost en
// geen euro's.
//
// TWEE GETALLEN, NIET ÉÉN (§5). Naast de weegscore staat de MATCHBAARHEID:
// hoeveel weten we eigenlijk van dit fonds? Een fonds waarvan alleen een
// sector-tag bekend is kan geen hoge match opleveren, hoe goed het thema ook
// aansluit. Die twee moeten apart blijven, want ze zeggen iets anders: het ene
// gaat over het plan, het andere over onze eigen kennis.
//
// BIJ TWIJFEL TONEN, NIET WEGLATEN. Een score van 0 is geen reden om een fonds
// uit de shortlist te houden zolang er ruimte is — wat wegvalt ziet niemand meer.

// Leesbare zin per kostensoort, voor in de weegredenen op het scherm. Los van
// de kortere labels elders in de UI, want hier moet het als lopende zin lezen
// ("Dit fonds financiert ...").
const KOSTENSOORT_ZIN: Record<string, string> = {
  investering: "investeringen",
  restauratie: "restauraties",
  regulier_onderhoud: "regulier onderhoud",
  exploitatie: "exploitatiekosten",
  personeel: "personeelskosten",
  onderzoek: "onderzoek",
};

export type WegingBron = PoortFonds & {
  themas?: string[] | null;
  trefwoorden?: string[] | null;
  categorie?: string | null;
  samenvatting?: string | null;
  cofinanciering_vereist?: boolean | null;
  bedrag_indicatie?: string | null;
  // Uit `regeling_matchprofiel` (0053).
  kaartje?: string | null;
  profiel?: string | null;
  matchprofiel_geaccordeerd?: boolean | null;
};

export type Weging = {
  fonds_id: string;
  score: number; // 0-100, deterministisch
  matchbaarheid: number; // 0-100, deterministisch
  redenen: string[]; // waarom deze score — leesbaar, want alles hier is uitlegbaar
};

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

// ---------------------------------------------------------------------------
// Matchbaarheid — hoeveel weten we van dit fonds?
// ---------------------------------------------------------------------------
// Acht dingen die we óf hebben óf niet. Bewust een simpele optelling met vaste
// gewichten in plaats van iets gekalibreerds: het getal moet met de hand na te
// rekenen zijn, anders is het geen verantwoording maar een sfeerbeeld.

export const MATCHBAARHEID_ONDERDELEN: { sleutel: string; punten: number; uitleg: string }[] = [
  { sleutel: "profiel", punten: 25, uitleg: "er is een matchprofiel uit de eigen bron gedestilleerd" },
  { sleutel: "bronlezing", punten: 15, uitleg: "er is minstens één bron van dit fonds gelezen" },
  { sleutel: "geverifieerd", punten: 15, uitleg: "de gegevens komen niet uit een sector-tag maar uit de eigen bron" },
  { sleutel: "werkgebied", punten: 10, uitleg: "het werkgebied is vastgesteld" },
  { sleutel: "benaderbaarheid", punten: 10, uitleg: "we weten of en hoe hier aangevraagd kan worden" },
  { sleutel: "aanvrager", punten: 10, uitleg: "we weten wie mag aanvragen" },
  { sleutel: "bedrag", punten: 10, uitleg: "er is een bedragband bekend" },
  { sleutel: "kostensoort", punten: 5, uitleg: "we weten welke kosten dit fonds financiert" },
];

export function matchbaarheid(f: WegingBron): { score: number; ontbreekt: string[] } {
  const heeft: Record<string, boolean> = {
    profiel: Boolean(f.profiel && f.profiel.trim().length > 0),
    bronlezing: (f.bronlezingen ?? 0) > 0,
    geverifieerd: (f.herkomst ?? "") !== "afgeleid_tag" && (f.herkomst ?? "") !== "ai_voorstel",
    werkgebied: Boolean(f.geo_niveau),
    benaderbaarheid: Boolean(f.benaderbaarheid) && f.benaderbaarheid !== "onbekend",
    aanvrager: Boolean(f.aanvrager_type) && f.aanvrager_type !== "onbekend",
    bedrag: f.bedrag_min != null || f.bedrag_max != null,
    kostensoort: (f.kostensoort ?? []).length > 0,
  };
  let score = 0;
  const ontbreekt: string[] = [];
  for (const o of MATCHBAARHEID_ONDERDELEN) {
    if (heeft[o.sleutel]) score += o.punten;
    else ontbreekt.push(o.uitleg);
  }
  // Een geaccordeerd profiel is meer waard dan een voorstel, maar het plafond
  // blijft 100.
  if (f.matchprofiel_geaccordeerd) score = Math.min(100, score + 5);
  return { score, ontbreekt };
}

// ---------------------------------------------------------------------------
// De weegscore
// ---------------------------------------------------------------------------

export type WegingContext = {
  antwoorden: Antwoorden;
  // regeling_id's die de full-text zoekstap teruggaf op de vrije tekst van de
  // gebruiker. Postgres deed dat werk; hier telt alleen of het fonds erbij zat.
  zoektreffers: Set<string>;
  oordeel?: FondsOordeel;
};

const PUBLIEKSWOORDEN = [
  "publiek",
  "openstelling",
  "educatie",
  "bezoekers",
  "recreatie",
  "toegankelijk",
  "voorlichting",
  "maatschappelijk",
];

export function weeg(f: WegingBron, ctx: WegingContext): Weging {
  const { antwoorden: a } = ctx;
  const redenen: string[] = [];
  let score = 0;

  // 1. Full-text treffer op de vrije tekst. Het zwaarste signaal dat zonder
  //    model te krijgen is, en tegelijk het best uitlegbare: het staat er
  //    letterlijk.
  if (ctx.zoektreffers.has(f.id)) {
    score += 35;
    redenen.push("De woorden uit uw plan komen letterlijk voor in het matchprofiel van dit fonds.");
  }

  // 2. Thematische overlap met het doel.
  if (a.doel) {
    const woorden = DOEL_THEMAWOORDEN[a.doel];
    const hooiberg = norm(
      [
        (f.themas ?? []).join(" "),
        (f.trefwoorden ?? []).join(" "),
        f.categorie ?? "",
        f.samenvatting ?? "",
        f.kaartje ?? "",
      ].join(" "),
    );
    const gevonden = woorden.filter((w) => hooiberg.includes(norm(w)));
    if (gevonden.length > 0) {
      score += Math.min(25, gevonden.length * 8);
      redenen.push(`Dit fonds noemt zelf de thema's ${gevonden.join(", ")}.`);
    }
  }

  // 3. Kostensoort die expliciet genoemd staat. De poort liet dit al door of op
  //    onbekend staan; hier telt het positief mee als het er echt staat.
  const gevraagdeKostensoort = a.doel ? DOEL_KOSTENSOORT[a.doel] : null;
  if (gevraagdeKostensoort && (f.kostensoort ?? []).map(norm).includes(norm(gevraagdeKostensoort))) {
    score += 15;
    redenen.push(`Dit fonds financiert ${KOSTENSOORT_ZIN[gevraagdeKostensoort] ?? gevraagdeKostensoort}.`);
  }

  // 4. Bedragband. Volledige insluiting weegt zwaarder dan gedeeltelijke
  //    overlap — een fonds waarvan de hele band binnen uw orde van grootte valt
  //    kan het project in één keer dragen.
  if (a.bedragband) {
    const { van, tot } = BEDRAGBAND_GRENZEN[a.bedragband];
    const fmin = f.bedrag_min;
    const fmax = f.bedrag_max;
    if (fmin != null || fmax != null) {
      const onder = fmax != null && tot != null ? fmax >= van && fmin != null && fmin <= tot : true;
      if (onder) {
        score += 12;
        redenen.push("Dit fonds financiert deze orde van grootte.");
      } else {
        score += 6;
        redenen.push("Dit fonds financiert deels deze orde van grootte.");
      }
    }
  }

  // 5. Publieksdimensie (§9.6 — de knop die het meeste opent). Alleen positief
  //    wegen: geen publiek is geen reden om een fonds te laten zakken, want dan
  //    zou een besloten landgoed onzichtbaar verliezen in plaats van te lezen
  //    dat een publiekscomponent deuren opent.
  if (a.publiek === "structureel" || a.publiek === "incidenteel") {
    const tekst = norm([f.kaartje ?? "", f.samenvatting ?? "", (f.themas ?? []).join(" ")].join(" "));
    if (PUBLIEKSWOORDEN.some((w) => tekst.includes(w))) {
      score += a.publiek === "structureel" ? 10 : 5;
      redenen.push("Dit fonds let op maatschappelijk rendement, en uw plan omvat een publieke openstelling.");
    }
  }

  // 6. Cofinanciering verplicht bij een klein project: een remmer, geen
  //    diskwalificatie.
  if (f.cofinanciering_vereist && a.bedragband === "tot_10k") {
    score -= 5;
    redenen.push("Dit fonds eist cofinanciering; bij een klein project is dat verhoudingsgewijs veel werk.");
  }

  // 7. Onbekende poorten drukken de score licht. Niet hard: onbekend is geen nee
  //    (§2), maar een fonds waarvan de bron op drie punten zwijgt hoort niet
  //    boven een fonds te staan waarvan alles klopt.
  const onbekendePoorten = ctx.oordeel?.poorten.filter((p) => p.uitkomst === "onbekend").length ?? 0;
  if (onbekendePoorten > 0) {
    score -= Math.min(9, onbekendePoorten * 3);
    redenen.push(
      `Op ${onbekendePoorten} punt${onbekendePoorten > 1 ? "en" : ""} zegt de bron van dit fonds niets; dat drukt de score maar is geen afwijzing.`,
    );
  }

  const m = matchbaarheid(f);
  return {
    fonds_id: f.id,
    score: Math.max(0, Math.min(100, Math.round(score))),
    matchbaarheid: m.score,
    redenen,
  };
}

// De shortlist. Sorteert op weegscore, en bij gelijke score op matchbaarheid —
// van twee even goed passende fondsen hoort het fonds waarvan we meer weten
// eerst, want daar kan het model iets mee.
export const SHORTLIST_OMVANG = 25;

export function shortlist(
  fondsen: WegingBron[],
  ctx: WegingContext,
  omvang: number = SHORTLIST_OMVANG,
): { fonds: WegingBron; weging: Weging }[] {
  return fondsen
    .map((f) => ({ fonds: f, weging: weeg(f, ctx) }))
    .sort(
      (a, b) =>
        b.weging.score - a.weging.score ||
        b.weging.matchbaarheid - a.weging.matchbaarheid ||
        a.fonds.naam.localeCompare(b.fonds.naam),
    )
    .slice(0, omvang);
}
