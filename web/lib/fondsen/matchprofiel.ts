import { createHash } from "node:crypto";
import { vraagTekst } from "@/lib/ai";
import {
  SCHOONMAAK_VERSIE,
  schoonBeleidstekst,
  telRapporten,
  type SchoonmaakRapport,
} from "./beleidstekst-schoonmaak";

// Het MATCHPROFIEL per fonds — laag 3 van §5 van het implementatieplan.
//
// WAAROM DIT BESTAAT
// `regeling_beleidstekst` bevat 238 integrale beleidsteksten, gemiddeld 9.000
// tekens. Die integraal in elke matchprompt stoppen is te duur en te traag. Een
// embedding zou dat oplossen maar is niet leesbaar: je kunt dan niet zien
// waaróp gematcht is, en dit platform draait op uitlegbaarheid (een mens keurt
// het AI-voorstel goed — §11). Vandaar per fonds één gedestilleerd, leesbaar
// profiel van 300-500 woorden: eenmalige kosten per fonds, daarna is elke
// zoekopdracht goedkoop én navolgbaar.
//
// DE HARDE REGELS (zelfde lijn als STAMGEGEVENS_SYSTEEM in lib/ai.ts):
//   * het profiel is een DESTILLAAT, geen interpretatie. Niets erbij verzinnen:
//     geen geschatte bedragen, geen aangenomen doelgroepen, geen "waarschijnlijk";
//   * UITSLUITINGEN mogen nooit wegvallen. Die zijn voor matching net zo
//     belangrijk als wat een fonds wél doet, en het is precies wat een
//     samenvatting als eerste verliest. Turing Foundation past prachtig bij
//     natuur tot je leest dat restauratie is uitgesloten;
//   * TEGENSTRIJDIGHEDEN blijven staan. Waar de verrijking twee bedragen of twee
//     signalen vastlegde (Ars Donandi: site zegt max EUR 15.000, beleidsplan
//     EUR 10.000; Ribbink van den Hoek: "(DO NOT) CONTACT US" naast een
//     beleidsplan mét aanvraagprocedure) wordt dat als tegenstrijdigheid
//     benoemd, niet gladgestreken. Drie-waardige logica (§2): onbekend is een
//     eigen uitkomst, geen 'nee';
//   * het resultaat is een VOORSTEL — geaccordeerd blijft false.

// Zuinig model: dit is destilleren, geen redeneren. Het model moet lange
// brontekst inkorten met behoud van uitsluitingen; het hoeft niets af te leiden.
// Haiku 4.5 is daar de goedkoopste geschikte keuze ($1 / $5 per Mtok tegenover
// $3 / $15 voor Sonnet). Te overschrijven met FONDSEN_MATCHPROFIEL_MODEL als een
// steekproef laat zien dat het destillaat te grof is.
export const MATCHPROFIEL_MODEL =
  process.env.FONDSEN_MATCHPROFIEL_MODEL ?? "claude-haiku-4-5";

// Ruimte voor 300-500 woorden Nederlands plus het kaartje, plus wat marge.
export const MAX_PROFIEL_TOKENS = 1800;

// HET KAARTJE — 60-80 woorden, in DEZELFDE modelaanroep als het profiel.
//
// WAAROM
// Bij een zoekopdracht komen er ~100 fondsen door de poort. Die allemaal met hun
// volledige profiel (~480 woorden, ~750 tokens) meesturen kost 75.000 tokens per
// vraag, en dat betaal je bij elke vraag, elk landgoed, elke ronde. Het kaartje
// (~110 tokens) voedt de RANKING over alle 100; alleen de top ~10 krijgt daarna
// het volledige profiel te lezen voor de onderbouwing. Dat is een factor 6-7 op de
// dure stap zonder dat de uitlegbaarheid sneuvelt: de onderbouwing komt nog steeds
// uit leesbare tekst, alleen leest het model die tekst voor minder fondsen.
//
// Het kaartje wordt in dezelfde aanroep gemaakt omdat een tweede ronde de brontekst
// opnieuw zou moeten inlezen — dan kost het kaartje meer dan het bespaart.
export const KAARTJE_MIN_WOORDEN = 55;
export const KAARTJE_MAX_WOORDEN = 95;

// De markeringen waarmee het model de twee delen scheidt. Bewust lelijk en
// onwaarschijnlijk in proza, zodat het splitsen niet per ongeluk in het midden van
// een zin toeslaat.
export const KAARTJE_MARKERING = "=== KAARTJE ===";
export const PROFIEL_MARKERING = "=== PROFIEL ===";

// Bovengrens op de brontekst die in één prompt gaat. De langste beleidstekst in
// de pilot is 165 kB; die integraal meesturen kost meer dan het profiel waard
// is. 60.000 tekens (~15k tokens) dekt het overgrote deel volledig; wat wordt
// ingekort staat als `bron_tekens` in de database zodat achteraf te zien is of
// een profiel op een halve bron berust.
export const MAX_BRON_TEKENS = 60_000;

export type Beleidsdocument = {
  bron_sleutel: string;
  bron_url: string | null;
  tekst: string;
  tekst_hash: string;
  opgehaald_op: string | null;
};

// De gestructureerde verrijking zoals die op `regeling` staat, plus de
// uitsluitingen uit `regeling_criterium` en de beleidsteksten.
export type MatchprofielBron = {
  regeling_id: string;
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
  uitsluitingen: string[];
  beleidsteksten: Beleidsdocument[];
};

// ---------------------------------------------------------------------------
// Hashes
// ---------------------------------------------------------------------------
// Ongewijzigde bron = geen nieuwe modelaanroep. Dat is wat een volledige ronde
// over 238 fondsen goedkoop houdt: de tweede ronde kost vrijwel niets.

function sha256(waarde: string): string {
  return createHash("sha256").update(waarde).digest("hex");
}

// Hash over alleen de beleidstekst(en), zodat achteraf te zien is of een
// wijziging uit het brondocument kwam of uit de verrijking eromheen. Gesorteerd
// op bron_sleutel: de volgorde waarin de database rijen teruggeeft mag geen
// nieuwe ronde uitlokken.
export function beleidstekstHash(documenten: Beleidsdocument[]): string {
  const regels = documenten
    .map((d) => `${d.bron_sleutel}:${d.tekst_hash}`)
    .sort()
    .join("\n");
  return sha256(regels);
}

// Hash over de VOLLEDIGE bronsamenstelling: alle beleidsteksten plus elk veld
// dat in de prompt gaat. Bewust niet alleen over de beleidstekst — een
// gewijzigde uitsluiting of een gecorrigeerd bedrag moet net zo goed een nieuwe
// ronde uitlokken, want dat verandert het profiel.
export function bronHash(bron: MatchprofielBron): string {
  const kern = [
    bron.naam,
    bron.organisatie ?? "",
    bron.samenvatting ?? "",
    bron.benaderbaarheid ?? "",
    bron.benaderwijze_notitie ?? "",
    bron.aanvrager_type ?? "",
    bron.geo_niveau ?? "",
    (bron.geo_waarden ?? []).join("|"),
    String(bron.bedrag_min ?? ""),
    String(bron.bedrag_max ?? ""),
    bron.bedrag_indicatie ?? "",
    String(bron.cofinanciering_vereist ?? ""),
    (bron.kostensoort ?? []).join("|"),
    bron.landgoed_route ?? "",
    bron.landgoed_route_reden ?? "",
    bron.landgoed_partnertype ?? "",
    // Uitsluitingen gesorteerd: de insert-volgorde van criteria is niet stabiel
    // en mag geen valse wijziging opleveren. De INHOUD telt wel mee — een
    // uitsluiting erbij of eraf hoort een nieuw profiel op te leveren.
    [...bron.uitsluitingen].sort().join(""),
    beleidstekstHash(bron.beleidsteksten),
    // De prompt zelf hoort bij de bron: wijzigt de instructie, dan is het oude
    // profiel niet meer vergelijkbaar met een nieuw.
    PROMPT_VERSIE,
    MATCHPROFIEL_MODEL,
    // De schoonmaak bepaalt mede WAT het model te zien krijgt en hoort dus bij de
    // bronsamenstelling: strippen we voortaan anders, dan is het oude profiel niet
    // meer vergelijkbaar met een nieuw.
    SCHOONMAAK_VERSIE,
  ].join("");
  return sha256(kern);
}

// Ophogen bij elke inhoudelijke wijziging van de prompt hieronder.
// v2: het kaartje van 60-80 woorden erbij, in dezelfde modelaanroep.
export const PROMPT_VERSIE = "matchprofiel-v2";

// ---------------------------------------------------------------------------
// Promptopbouw
// ---------------------------------------------------------------------------

export const MATCHPROFIEL_SYSTEEM = `Je destilleert beleidsteksten van Nederlandse vermogensfondsen tot één leesbaar matchprofiel.

Je taak is DESTILLEREN, niet interpreteren. Je voegt niets toe dat niet in de bron staat.

HARDE REGELS
1. Alleen wat de bron noemt. Geen geschatte bedragen, geen aangenomen doelgroepen,
   geen aannames over wat een fonds "waarschijnlijk" ook wel doet. Staat er niets
   over bedragen, dan schrijf je dat er niets over bedragen bekend is.
2. Uitsluitingen mogen NOOIT wegvallen. Alles wat het fonds uitdrukkelijk niet
   financiert komt integraal in het profiel, ook als het een lange lijst is en
   ook als het de rest van het profiel tegenspreekt. Dit is het onderdeel dat een
   samenvatting doorgaans als eerste verliest en het is voor matching even
   belangrijk als wat een fonds wél doet.
3. Tegenstrijdigheden blijven staan. Zeggen twee bronnen iets anders (een ander
   maximumbedrag, een site die zegt niet te benaderen naast een beleidsplan met
   een aanvraagprocedure), dan benoem je beide en zeg je erbij dat ze elkaar
   tegenspreken. Niet gladstrijken en niet kiezen.
4. "Niet gepubliceerd" is een eigen uitkomst. Schrijf "hierover is niets
   gepubliceerd" in plaats van te zwijgen of te gokken; bij fondsen is dat de
   meest voorkomende stand en de lezer moet het verschil zien tussen "nee" en
   "onbekend".
5. Gebruik zoveel mogelijk de woorden van het fonds zelf. Korte letterlijke
   citaten tussen aanhalingstekens zijn toegestaan en gewenst waar de formulering
   ertoe doet.

VORM — JE LEVERT TWEE DINGEN IN ÉÉN ANTWOORD

Eerst de regel "=== KAARTJE ===", dan het kaartje. Daarna de regel
"=== PROFIEL ===", dan het volledige profiel. Verder niets: geen inleiding, geen
afsluiting, geen markdown.

HET KAARTJE (60-80 woorden, één alinea)
Dit is het enige wat een zoekopdracht van ALLE fondsen tegelijk leest; het volledige
profiel wordt daarna alleen nog van de beste kandidaten gelezen. Een fonds dat op
grond van het kaartje bovenaan eindigt terwijl het volledige profiel het uitsluit,
is een fout die de gebruiker pas laat ziet. Daarom moet het kaartje zes dingen
noemen, kort en zonder opsmuk:
  1. wat dit fonds wil bereiken;
  2. wat ze wél financieren;
  3. wat ze NIET financieren — de belangrijkste uitsluiting. Dit onderdeel is
     verplicht en is de reden dat het kaartje bestaat. Past maar één uitsluiting,
     kies dan de MEEST ONDERSCHEIDENDE: die welke de meeste ogenschijnlijk passende
     aanvragen afketst (een natuurfonds dat restauratie uitsluit noemt restauratie,
     niet "geen aanvragen per fax"). Is er echt geen uitsluiting gepubliceerd,
     schrijf dan letterlijk "Niet: geen uitsluitingen gepubliceerd.";
  4. wie mag aanvragen (en of een landgoed zelf kan of alleen via een partner);
  5. waar het geldt;
  6. welk bedrag.
Schrijf onderdeel 3 als één zin die begint met "Niet:". De rest is gewone lopende
tekst. Geen kopjes, geen opsommingstekens in het kaartje.

HET PROFIEL
Nederlands, 300-500 woorden, platte tekst met deze zes kopjes, elk op een eigen
regel gevolgd door de tekst. Geen markdown-opmaak, geen opsommingstekens, geen
inleiding of afsluiting buiten de kopjes.

Wat dit fonds wil bereiken:
Wat ze wél financieren:
Wat ze uitdrukkelijk NIET financieren:
Wie mag aanvragen en langs welke route:
Waar het geldt en in welke orde van grootte:
Haakjes:

TOELICHTING PER KOPJE
- Wat dit fonds wil bereiken: de doelstelling in hun woorden.
- Wat ze wél financieren: welk soort project, met concrete voorbeelden uit
  toekenningen als de bron die noemt. Verzin geen voorbeelden.
- Wat ze uitdrukkelijk NIET financieren: alle uitsluitingen, volledig.
- Wie mag aanvragen en langs welke route: rechtsvorm/soort aanvrager, en of een
  landgoed zelf kan aanvragen of alleen via een partnerorganisatie; hoe je
  binnenkomt (open aanvraag, op uitnodiging, via een intermediair, gesloten).
- Waar het geldt en in welke orde van grootte: werkgebied en bedragen, met de
  tegenstrijdigheden erbij als die er zijn.
- Haakjes: de termen waarmee een aanvrager bij dit fonds moet aansluiten —
  de begrippen, thema's en woorden waarop een projectplan herkenbaar aansluit bij
  dit fonds. Losse termen, gescheiden door puntkomma's, allemaal ontleend aan de
  bron.`;

// Wat de aanroeper aan de assistent-kant meegeeft om het formaat af te dwingen. Het
// model begint dus al met de kaartje-markering en kan er niet meer omheen met een
// inleidende zin.
export const ANTWOORD_AANHEF = KAARTJE_MARKERING;

export type PromptOpbouw = {
  systeem: string;
  prompt: string;
  bronTekens: number;
  ingekort: boolean;
  // Wat de deterministische schoonmaak uit de beleidsteksten heeft gehaald,
  // opgeteld over alle documenten van dit fonds.
  schoonmaak: SchoonmaakRapport;
};

// Splitst het modelantwoord in kaartje en profiel. Tolerant: ontbreken de
// markeringen, dan geldt het hele antwoord als profiel en is er geen kaartje —
// liever geen kaartje dan een kaartje dat de eerste 80 woorden van het profiel is,
// want dat mist per definitie de uitsluiting (die staat pas bij kopje drie).
export function splitsAntwoord(antwoord: string): {
  kaartje: string | null;
  profiel: string;
} {
  const tekst = antwoord.trim();
  const p = tekst.indexOf(PROFIEL_MARKERING);
  if (p < 0) return { kaartje: null, profiel: tekst };
  const kop = tekst.slice(0, p);
  const k = kop.indexOf(KAARTJE_MARKERING);
  const kaartje = (k >= 0 ? kop.slice(k + KAARTJE_MARKERING.length) : kop).trim();
  const profiel = tekst.slice(p + PROFIEL_MARKERING.length).trim();
  return { kaartje: kaartje.length ? kaartje : null, profiel };
}

// Deterministische controle op het kaartje. De prompt VRAAGT om een uitsluiting;
// dit is de plek waar gecontroleerd wordt of hij er ook staat. Een prompt is geen
// garantie, en juist dit onderdeel is de bestaansreden van het kaartje.
export function keurKaartje(kaartje: string | null): string[] {
  const bezwaren: string[] = [];
  if (!kaartje) return ["geen kaartje in het antwoord"];
  const woorden = telWoorden(kaartje);
  if (woorden < KAARTJE_MIN_WOORDEN) bezwaren.push(`kaartje te kort (${woorden} woorden)`);
  if (woorden > KAARTJE_MAX_WOORDEN) bezwaren.push(`kaartje te lang (${woorden} woorden)`);
  if (!/(^|[\s.;])Niet:/.test(kaartje)) {
    bezwaren.push("kaartje noemt geen uitsluiting (zin met 'Niet:' ontbreekt)");
  }
  return bezwaren;
}

function veld(label: string, waarde: unknown): string | null {
  if (waarde === null || waarde === undefined || waarde === "") return null;
  if (Array.isArray(waarde)) {
    if (waarde.length === 0) return null;
    return `${label}: ${waarde.join("; ")}`;
  }
  if (waarde === "onbekend") return null;
  return `${label}: ${String(waarde)}`;
}

// Kort de beleidsteksten in tot MAX_BRON_TEKENS, met een eerlijke verdeling over
// de documenten: één lange jaarrekening mag een kort maar cruciaal
// aanvraagreglement niet volledig verdringen. Er wordt zichtbaar geknipt
// (markering in de tekst) zodat het model weet dat het einde ontbreekt en niet
// concludeert dat er geen uitsluitingen zijn.
// SCHOONMAAK GAAT VOOR INKORTEN. Eerst deterministisch de boilerplate eruit, dán
// pas afkappen op de limiet — anders kost een jaarrekeningtabel de ruimte van een
// aanvraagreglement dat nu net wél binnen het budget past.
export function kortBeleidsteksten(
  documenten: Beleidsdocument[],
  max = MAX_BRON_TEKENS,
): {
  blokken: string[];
  tekens: number;
  ingekort: boolean;
  schoonmaak: SchoonmaakRapport;
} {
  const leegRapport = telRapporten([]);
  if (documenten.length === 0) {
    return { blokken: [], tekens: 0, ingekort: false, schoonmaak: leegRapport };
  }

  const schoongemaakt = documenten.map((d) => {
    const { tekst, rapport } = schoonBeleidstekst(d.tekst);
    return { doc: d, tekst, rapport };
  });
  const schoonmaak = telRapporten(schoongemaakt.map((s) => s.rapport));

  const budget = Math.max(1, Math.floor(max / schoongemaakt.length));

  // Documenten die onder hun deel blijven laten ruimte over; die verdelen we
  // over de documenten die er wél overheen gaan.
  const teVeel = schoongemaakt.filter((s) => s.tekst.length > budget);
  const over = schoongemaakt
    .filter((s) => s.tekst.length <= budget)
    .reduce((n, s) => n + (budget - s.tekst.length), 0);
  const extra = teVeel.length > 0 ? Math.floor(over / teVeel.length) : 0;

  let tekens = 0;
  let ingekort = false;
  const blokken = schoongemaakt.map(({ doc: d, tekst: schoon }) => {
    const ruimte = schoon.length > budget ? budget + extra : budget;
    const kort = schoon.length > ruimte;
    if (kort) ingekort = true;
    const tekst = kort
      ? `${schoon.slice(0, ruimte)}\n[... deze brontekst is hier afgekapt; er kan verderop meer staan, ook uitsluitingen ...]`
      : schoon;
    tekens += Math.min(schoon.length, ruimte);
    const kop = [
      `BRONDOCUMENT: ${d.bron_sleutel}`,
      d.bron_url ? `URL: ${d.bron_url}` : null,
      d.opgehaald_op ? `Opgehaald: ${d.opgehaald_op}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    return `${kop}\n---\n${tekst}`;
  });

  return { blokken, tekens, ingekort, schoonmaak };
}

export function bouwMatchprofielPrompt(
  bron: MatchprofielBron,
  max = MAX_BRON_TEKENS,
): PromptOpbouw {
  const structuur = [
    veld("Naam", bron.naam),
    veld("Koepel/organisatie", bron.organisatie),
    veld("Doelstelling (uit de catalogus)", bron.samenvatting),
    veld("Benaderbaarheid", bron.benaderbaarheid),
    veld("Citaat waarop de benaderbaarheid berust", bron.benaderwijze_notitie),
    veld("Type aanvrager", bron.aanvrager_type),
    veld("Geografisch niveau", bron.geo_niveau),
    veld("Werkgebied", bron.geo_waarden),
    veld("Bedrag minimaal (EUR)", bron.bedrag_min),
    veld("Bedrag maximaal (EUR)", bron.bedrag_max),
    veld("Bedrag-indicatie zoals gepubliceerd", bron.bedrag_indicatie),
    veld(
      "Cofinanciering vereist",
      bron.cofinanciering_vereist === null
        ? null
        : bron.cofinanciering_vereist
          ? "ja"
          : "nee",
    ),
    veld("Kostensoorten", bron.kostensoort),
    veld("Route voor een landgoed", bron.landgoed_route),
    veld("Onderbouwing van die route", bron.landgoed_route_reden),
    veld("Soort partnerorganisatie", bron.landgoed_partnertype),
  ].filter((r): r is string => r !== null);

  // Uitsluitingen apart en met nadruk: dit is de sectie die bij het destilleren
  // als eerste sneuvelt, dus staat ze vooraan én los van de rest.
  const uitsluitingen = bron.uitsluitingen.length
    ? bron.uitsluitingen.map((u, i) => `${i + 1}. ${u}`).join("\n")
    : "(In de verrijking zijn geen uitsluitingen vastgelegd. Neem uitsluitingen over die je in de beleidstekst hieronder tegenkomt; vind je die ook niet, schrijf dan dat er geen uitsluitingen gepubliceerd zijn.)";

  const { blokken, tekens, ingekort, schoonmaak } = kortBeleidsteksten(
    bron.beleidsteksten,
    max,
  );
  const beleid = blokken.length
    ? blokken.join("\n\n")
    : "(Er is geen integrale beleidstekst beschikbaar. Baseer het profiel uitsluitend op de gestructureerde gegevens hierboven en schrijf bij elk onbekend onderdeel dat daarover niets gepubliceerd is.)";

  const prompt = [
    `Maak het matchprofiel voor: ${bron.naam}`,
    "",
    "=== VASTGELEGDE UITSLUITINGEN (deze moeten allemaal in het profiel terug) ===",
    uitsluitingen,
    "",
    "=== GESTRUCTUREERDE VERRIJKING ===",
    structuur.length
      ? structuur.join("\n")
      : "(Geen gestructureerde velden vastgelegd.)",
    "",
    "=== INTEGRALE BELEIDSTEKST ===",
    beleid,
    "",
    `Schrijf nu eerst "${KAARTJE_MARKERING}" met het kaartje van 60-80 woorden (met de zin die met "Niet:" begint), daarna "${PROFIEL_MARKERING}" met het volledige profiel volgens de zes kopjes. Verder niets.`,
  ].join("\n");

  return {
    systeem: MATCHPROFIEL_SYSTEEM,
    prompt,
    bronTekens: tekens,
    ingekort,
    schoonmaak,
  };
}

// ---------------------------------------------------------------------------
// Generatie
// ---------------------------------------------------------------------------

export function telWoorden(tekst: string): number {
  return tekst.trim().split(/\s+/).filter(Boolean).length;
}

export type Matchprofiel = {
  regeling_id: string;
  profiel: string;
  woorden: number;
  // Het korte kaartje (60-80 woorden) dat de rankingstap over alle fondsen leest.
  // Null als het model zich niet aan het formaat hield; dan valt de ranking voor
  // dit fonds terug op het volledige profiel — duurder, maar nooit onvolledig.
  kaartje: string | null;
  kaartje_woorden: number;
  bron_hash: string;
  beleidstekst_hash: string;
  bron_tekens: number;
  model: string;
  herkomst: "ai_voorstel";
  geaccordeerd: false;
};

// Geeft null als de AI-laag niet beschikbaar is of de aanroep mislukt. Bewust
// geen fallback op een zelfgebouwde samenvatting: een half destillaat is
// gevaarlijker dan geen, want de uitsluitingen zouden er dan uit kunnen vallen.
export type MatchprofielResultaat = {
  profiel: Matchprofiel;
  // Wat de deterministische schoonmaak scheelde; door de ingestie per fonds gelogd.
  schoonmaak: SchoonmaakRapport;
  // Bezwaren tegen het kaartje (te kort, te lang, geen uitsluiting). Leeg = goed.
  // Het profiel wordt hoe dan ook bewaard: het volledige profiel is bruikbaar, ook
  // als het kaartje niet deugt.
  kaartje_bezwaren: string[];
};

export async function maakMatchprofiel(
  bron: MatchprofielBron,
  opties?: { model?: string; maxTekens?: number },
): Promise<MatchprofielResultaat | null> {
  const model = opties?.model ?? MATCHPROFIEL_MODEL;
  const opbouw = bouwMatchprofielPrompt(bron, opties?.maxTekens ?? MAX_BRON_TEKENS);
  const tekst = await vraagTekst(opbouw.systeem, opbouw.prompt, {
    model,
    maxTokens: MAX_PROFIEL_TOKENS,
    // Het systeemdeel is voor alle 238 fondsen identiek; markeren scheelt bij een
    // volledige ronde de herhaalde invoerkosten van de instructie.
    cacheSysteem: true,
    // Prefill: het model begint al met de kaartje-markering en kan er dus niet meer
    // met een inleidende zin omheen.
    aanhef: ANTWOORD_AANHEF,
  });
  if (!tekst) return null;

  // De prefill zit niet in het antwoord, dus die zetten we er weer voor terug.
  const volledig = tekst.startsWith(KAARTJE_MARKERING)
    ? tekst
    : `${KAARTJE_MARKERING}\n${tekst}`;
  const { kaartje, profiel } = splitsAntwoord(volledig);

  return {
    schoonmaak: opbouw.schoonmaak,
    kaartje_bezwaren: keurKaartje(kaartje),
    profiel: {
      regeling_id: bron.regeling_id,
      profiel,
      woorden: telWoorden(profiel),
      kaartje,
      kaartje_woorden: kaartje ? telWoorden(kaartje) : 0,
      bron_hash: bronHash(bron),
      beleidstekst_hash: beleidstekstHash(bron.beleidsteksten),
      bron_tekens: opbouw.bronTekens,
      model,
      // Alles komt binnen als voorstel. Pas na menselijke accordering telt het als
      // vastgesteld — §11: liever twaalf bronnen waarvan je het zeker weet.
      herkomst: "ai_voorstel",
      geaccordeerd: false,
    },
  };
}
