// Officiële bekendmakingen ophalen via de SRU-koppeling van KOOP.
//
// Let op de endpoint: `zoek.officielebekendmakingen.nl/sru/Search` met
// `x-connection=oep` (zoals in oudere documentatie staat) geeft alleen
// HTML-foutpagina's. De werkende ingang is `repository.overheid.nl/sru` met
// `c.product-area==officielepublicaties`.
//
// Wat de bron NIET levert: machineleesbare geometrie. De locatie zit in de
// titel als vrije tekst. Zie plaatsen.ts voor wat daar mee gebeurt.

const SRU = "https://repository.overheid.nl/sru";
const TIMEOUT_MS = 30000;

export type Publicatie = {
  /** dcterms:identifier, bv. "gmb-2026-371513" — uniek, gebruikt voor dedup. */
  externe_id: string;
  titel: string;
  /** OVERHEIDop.Rubriek, bv. "omgevingsvergunning". */
  rubriek: string | null;
  /** Het publicerende bestuursorgaan zoals de bron het noemt. */
  organisatie: string | null;
  datum: string | null;
  url: string | null;
};

// Documenttypen die een landgoed per definitie niet raken. Dit is het
// goedkoopste filter dat er is — het scheelt op Middelburg 16% van het volume
// (23 van 142 in juli 2026) vóór er één geocodeer- of AI-actie plaatsvindt.
// Bewust kort: wegfilteren op type is onomkeerbaar, dus alleen wat evident
// niets met grond of gebouwen te maken heeft.
export const NIET_RELEVANTE_RUBRIEKEN = new Set([
  "uitschrijving basisregistratie personen",
  "oproeping",
  "verkiezingen",
]);

function tussen(blok: string, tag: string): string | null {
  const m = blok.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  if (!m) return null;
  const s = m[1]
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
  return s || null;
}

/** Escapet een waarde voor gebruik binnen een CQL-string. */
function cqlWaarde(v: string): string {
  return v.replace(/"/g, "");
}

export type SruVraag = {
  /** Naam van het bestuursorgaan zoals KOOP het schrijft, bv. "Middelburg". */
  organisatie: string;
  vanaf: string; // YYYY-MM-DD
  tot: string; // YYYY-MM-DD
  maximaal?: number;
  /**
   * Alleen deze documenttypen ophalen. Leeg = alles.
   *
   * Bedoeld voor provincie en waterschap. Gemeten op een jaar Waterschap
   * Scheldestromen: 2156 publicaties, waarvan 959 "andere vergunning" en 803
   * omgevingsvergunning. Van een steekproef van 360 lag er nul binnen 500 m
   * van Ter Hooge en was de mediaan-afstand 22,8 km — het beheergebied beslaat
   * heel Zeeland. Die vergunningen ophalen kost dus veel en levert niets.
   *
   * Wat er wél toe doet zijn de verordeningen, peilbesluiten en ruimtelijke
   * plannen: achttien per jaar, en die werken op omvatting (lig ik in dit
   * peilvak) in plaats van op afstand.
   */
  alleenRubrieken?: string[];
};

/**
 * Besluitsoorten van een provincie of waterschap die een landgoed kunnen
 * raken. Bewust smal: alles wat op één adres slaat valt af, want zulke
 * besluiten liggen bij een bestuursorgaan dat een hele provincie beslaat
 * vrijwel nooit bij jou in de buurt.
 */
export const GEBIEDSDEKKENDE_RUBRIEKEN = [
  "algemeen verbindend voorschrift (verordening)",
  "ruimtelijk plan of omgevingsdocument",
  "ander besluit van algemene strekking",
  "beleidsregel",
  "peilbesluit",
  "participatie",
];

/**
 * Haalt publicaties op voor één bestuursorgaan in een periode.
 *
 * Pagineert zelf; `maximaal` is een harde bovengrens zodat een te ruime vraag
 * niet ongemerkt duizenden records binnentrekt.
 */
export async function haalPublicaties(v: SruVraag): Promise<{
  publicaties: Publicatie[];
  totaal: number;
  afgekapt: boolean;
}> {
  // Ruim genoeg voor een jaar van een grote gemeente: Middelburg publiceerde
  // er 1231 in twaalf maanden, Veere 1374. Met de oude grens van 500 zagen we
  // ongeveer 40% van het jaar — en dat is precies het soort stille
  // onvolledigheid waar deze module aan kapot gaat. De grens blijft bestaan
  // als noodrem, maar ligt nu boven het werkelijke volume.
  const maximaal = v.maximaal ?? 5000;
  // Het typefilter gaat mee in de CQL-query, niet achteraf: dan haalt de bron
  // die duizenden vergunningen niet eens op. Voor Waterschap Scheldestromen
  // scheelt dat 2156 -> 25 publicaties per jaar.
  const typeFilter = v.alleenRubrieken?.length
    ? ` and (${v.alleenRubrieken.map((r) => `dt.type=="${cqlWaarde(r)}"`).join(" or ")})`
    : "";

  const query =
    `c.product-area==officielepublicaties` +
    ` and dt.creator=="${cqlWaarde(v.organisatie)}"` +
    ` and dt.modified>=${v.vanaf}` +
    ` and dt.modified<=${v.tot}` +
    typeFilter;

  const publicaties: Publicatie[] = [];
  let totaal = 0;
  let start = 1;

  while (publicaties.length < maximaal) {
    const perPagina = Math.min(100, maximaal - publicaties.length);
    const url =
      `${SRU}?version=2.0&operation=searchRetrieve` +
      `&query=${encodeURIComponent(query)}` +
      `&maximumRecords=${perPagina}&startRecord=${start}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`SRU ${v.organisatie}: HTTP ${res.status}`);
    const xml = await res.text();

    if (!xml.includes("<sru:searchRetrieveResponse")) {
      // De bron antwoordt bij een foute query met een HTML-pagina en status
      // 200. Zonder deze check zou dat "geen resultaten" lijken.
      throw new Error(`SRU ${v.organisatie}: onverwacht antwoord (geen SRU-XML)`);
    }

    const n = xml.match(/<sru:numberOfRecords>(\d+)</);
    totaal = n ? Number(n[1]) : 0;

    const blokken = xml.split("<sru:record>").slice(1);
    if (blokken.length === 0) break;

    for (const blok of blokken) {
      const externe_id = tussen(blok, "dcterms:identifier");
      const titel = tussen(blok, "dcterms:title");
      if (!externe_id || !titel) continue;

      const rubriek = blok.match(
        /<dcterms:type[^>]*scheme="OVERHEIDop\.Rubriek"[^>]*>([\s\S]*?)<\/dcterms:type>/,
      );
      const link = blok.match(/resourceIdentifier="([^"]+)"/);

      publicaties.push({
        externe_id,
        titel,
        rubriek: rubriek ? rubriek[1].trim() || null : null,
        organisatie: tussen(blok, "dcterms:creator") ?? v.organisatie,
        datum: tussen(blok, "dcterms:date") ?? tussen(blok, "dcterms:modified"),
        url: link
          ? link[1]
          : `https://zoek.officielebekendmakingen.nl/${externe_id}.html`,
      });
    }

    start += blokken.length;
    if (start > totaal || blokken.length < perPagina) break;
  }

  return { publicaties, totaal, afgekapt: totaal > publicaties.length };
}
