import { createHash } from "node:crypto";
import { vraagTekst } from "@/lib/ai";

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

// Ruimte voor 300-500 woorden Nederlands plus wat marge.
export const MAX_PROFIEL_TOKENS = 1600;

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
  ].join("");
  return sha256(kern);
}

// Ophogen bij elke inhoudelijke wijziging van de prompt hieronder.
export const PROMPT_VERSIE = "matchprofiel-v1";

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

VORM
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

export type PromptOpbouw = {
  systeem: string;
  prompt: string;
  bronTekens: number;
  ingekort: boolean;
};

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
export function kortBeleidsteksten(
  documenten: Beleidsdocument[],
  max = MAX_BRON_TEKENS,
): { blokken: string[]; tekens: number; ingekort: boolean } {
  if (documenten.length === 0) return { blokken: [], tekens: 0, ingekort: false };
  const budget = Math.max(1, Math.floor(max / documenten.length));

  // Documenten die onder hun deel blijven laten ruimte over; die verdelen we
  // over de documenten die er wél overheen gaan.
  const teVeel = documenten.filter((d) => d.tekst.length > budget);
  const over = documenten
    .filter((d) => d.tekst.length <= budget)
    .reduce((n, d) => n + (budget - d.tekst.length), 0);
  const extra = teVeel.length > 0 ? Math.floor(over / teVeel.length) : 0;

  let tekens = 0;
  let ingekort = false;
  const blokken = documenten.map((d) => {
    const ruimte = d.tekst.length > budget ? budget + extra : budget;
    const kort = d.tekst.length > ruimte;
    if (kort) ingekort = true;
    const tekst = kort
      ? `${d.tekst.slice(0, ruimte)}\n[... deze brontekst is hier afgekapt; er kan verderop meer staan, ook uitsluitingen ...]`
      : d.tekst;
    tekens += Math.min(d.tekst.length, ruimte);
    const kop = [
      `BRONDOCUMENT: ${d.bron_sleutel}`,
      d.bron_url ? `URL: ${d.bron_url}` : null,
      d.opgehaald_op ? `Opgehaald: ${d.opgehaald_op}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    return `${kop}\n---\n${tekst}`;
  });

  return { blokken, tekens, ingekort };
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

  const { blokken, tekens, ingekort } = kortBeleidsteksten(bron.beleidsteksten, max);
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
    "Schrijf nu het profiel volgens de zes kopjes. Alleen het profiel, geen inleiding.",
  ].join("\n");

  return { systeem: MATCHPROFIEL_SYSTEEM, prompt, bronTekens: tekens, ingekort };
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
export async function maakMatchprofiel(
  bron: MatchprofielBron,
  opties?: { model?: string; maxTekens?: number },
): Promise<Matchprofiel | null> {
  const model = opties?.model ?? MATCHPROFIEL_MODEL;
  const opbouw = bouwMatchprofielPrompt(bron, opties?.maxTekens ?? MAX_BRON_TEKENS);
  const tekst = await vraagTekst(opbouw.systeem, opbouw.prompt, {
    model,
    maxTokens: MAX_PROFIEL_TOKENS,
  });
  if (!tekst) return null;

  return {
    regeling_id: bron.regeling_id,
    profiel: tekst,
    woorden: telWoorden(tekst),
    bron_hash: bronHash(bron),
    beleidstekst_hash: beleidstekstHash(bron.beleidsteksten),
    bron_tekens: opbouw.bronTekens,
    model,
    // Alles komt binnen als voorstel. Pas na menselijke accordering telt het als
    // vastgesteld — §11: liever twaalf bronnen waarvan je het zeker weet.
    herkomst: "ai_voorstel",
    geaccordeerd: false,
  };
}
