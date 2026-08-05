// Deterministisch boilerplate strippen uit beleidsteksten, VOORDAT ze het model in gaan.
//
// WAAROM
// De 238 beleidsteksten in `regeling_beleidstekst` zijn gemiddeld 9.000 tekens en
// bestaan voor een aanzienlijk deel uit dingen die geen beleid zijn:
// navigatiemenu's, cookiemeldingen, bestuurssamenstelling met namen, jaarrekening-
// tabellen, standaard ANBI-formuleringen, pagina-koppen die op elke pagina van een
// gescrapete site terugkomen. Dat is tekst waarvoor we per fonds betalen zonder dat
// het één matchbeslissing beter maakt.
//
// WAAROM DETERMINISTISCH EN NIET MET EEN MODEL
// Een model dat mag schrappen kan een uitsluiting schrappen, en dat is precies de
// fout die niemand later terugvindt: het profiel leest dan prima, alleen klopt het
// niet meer. Regex is dom maar controleerbaar — je kunt teruglezen wat de regel deed.
//
// DE GRONDHOUDING: TERUGHOUDEND
//   * elke regel die ook maar RIEKT naar beleid blijft staan (zie BELEIDSSIGNAAL);
//     dat filter gaat vóór elke schrapregel;
//   * er wordt alleen per REGEL geschrapt, nooit een blok "van hier tot daar" —
//     een verkeerd ingeschat blokeinde neemt beleid mee;
//   * wat geschrapt is wordt per categorie GETELD en teruggegeven, zodat per fonds
//     controleerbaar is hoeveel er weg is en waarom. Een schoonmaak die je niet kunt
//     narekenen is een schoonmaak die je niet moet vertrouwen.
//
// Ophogen bij elke inhoudelijke wijziging van de regels hieronder: de schoonmaak
// zit in de bronsamenstelling van het profiel, dus een andere schoonmaak hoort een
// nieuw profiel op te leveren (zie bronHash in matchprofiel.ts).
export const SCHOONMAAK_VERSIE = "schoonmaak-v1";

export type SchoonmaakCategorie =
  | "navigatie"
  | "cookie_privacy"
  | "bestuur_namen"
  | "jaarrekening"
  | "anbi_standaard"
  | "herhaalde_kop"
  | "witruimte";

export type SchoonmaakRapport = {
  tekens_voor: number;
  tekens_na: number;
  verwijderd: number;
  // Aandeel van de oorspronkelijke tekst dat is weggehaald, 0-1.
  aandeel: number;
  regels_voor: number;
  regels_na: number;
  // Per categorie het aantal weggehaalde tekens; leeg als er niets weg is.
  per_categorie: Partial<Record<SchoonmaakCategorie, number>>;
  // Hoeveel regels bleven staan puur omdat ze een beleidssignaal bevatten terwijl
  // een schrapregel ze anders had weggehaald. Dit getal hoort laag te zijn; loopt
  // het op, dan is een schrapregel te grof afgesteld.
  behouden_door_beleidssignaal: number;
};

// ---------------------------------------------------------------------------
// Het vangnet: wat nooit weg mag
// ---------------------------------------------------------------------------
// Alles wat op een voorwaarde, een uitsluiting, een doelstelling, een bedrag of een
// aanvraagroute wijst. Ruim afgesteld: liever tien regels boilerplate laten staan
// dan één uitsluiting verliezen. Een weggestripte uitsluiting is een fout die
// niemand meer terugvindt — het profiel leest dan nog steeds goed.
const BELEIDSSIGNAAL =
  /\b(niet|geen|nooit|zelden|uitgesloten|uitsluiting|uitgezonderd|uitzondering|tenzij|behalve|mits|alleen|uitsluitend|voorwaarde|vereist|verplicht|criteri|in aanmerking|aanvraag|aanvrag|indien|subsidie|donatie|bijdrage|financier|steun|schenk|toeken|afwijz|doelstelling|doel |project|begunstig|beleid|richtlijn|reglement|drempel|maximaal|minimaal|plafond)/i;

// Een bedrag in de regel is óók een beleidssignaal — dat is precies wat we willen
// bewaren en tegelijk het meest lijkt op een jaarrekeningregel.
const BEDRAGSIGNAAL = /(€|EUR\b|euro\b)/i;

function isBeleidsregel(regel: string): boolean {
  return BELEIDSSIGNAAL.test(regel) || BEDRAGSIGNAAL.test(regel);
}

// ---------------------------------------------------------------------------
// De schrapregels
// ---------------------------------------------------------------------------

// Navigatie: losse menu-items en broodkruimels. Alleen KORTE regels — een lange zin
// die toevallig met "Contact" begint is proza, geen menu-item.
const NAV_WOORDEN =
  /^(home|homepage|menu|zoek(en)?|contact|contactgegevens|over ons|wie zijn wij|nieuws|actueel|agenda|links|sitemap|inloggen|uitloggen|mijn account|english|deutsch|français|lees meer|meer lezen|verder lezen|terug|terug naar boven|naar boven|naar de inhoud|deel deze pagina|delen|print(en)?|volg ons|nieuwsbrief|downloads?|veelgestelde vragen|faq|vacatures?|pers|disclaimer|colofon|©.*)$/i;
// Broodkruimel: "Home > Over ons > Beleid" of "Home | Contact | Nieuws".
const BROODKRUIMEL = /^[^|>»]{1,40}([|>»][^|>»]{1,40}){1,8}$/;

function isNavigatie(regel: string): boolean {
  const r = regel.trim().replace(/[.•·-]+$/, "").trim();
  if (!r || r.length > 60) return false;
  if (NAV_WOORDEN.test(r)) return true;
  // Broodkruimels mogen wat langer zijn maar bestaan uit korte stukjes.
  if (regel.trim().length <= 120 && BROODKRUIMEL.test(regel.trim())) {
    const delen = regel.trim().split(/[|>»]/).map((d) => d.trim()).filter(Boolean);
    // Minstens twee delen die er allemaal als menu-item uitzien (kort, geen punt).
    return delen.length >= 2 && delen.every((d) => d.length <= 40 && !/[.!?]$/.test(d));
  }
  return false;
}

const COOKIE_PRIVACY =
  /(deze (website|site) (maakt )?gebruik(t)? van cookies|cookiebeleid|cookie-instellingen|cookies accepteren|alle cookies|noodzakelijke cookies|analytische cookies|tracking cookies|privacyverklaring|privacy statement|privacybeleid|avg[- ]?verklaring|algemene verordening gegevensbescherming|schakel javascript in|uw browser ondersteunt geen)/i;

function isCookieOfPrivacy(regel: string): boolean {
  return regel.trim().length <= 400 && COOKIE_PRIVACY.test(regel);
}

// Bestuurssamenstelling MET namen. Alleen de opsomming zelf ("Voorzitter: mw. J.
// de Vries"), niet een zin waarin het bestuur iets besluit over beleid. Een naam is
// hier: minstens één hoofdletterwoord of initialen na de rol.
const BESTUURSROL =
  /^(voorzitter|vice-?voorzitter|secretaris|penningmeester|bestuurslid|bestuursleden|lid|leden|directeur|directie|adviseur|notulist|toezichthouder|raad van toezicht|bestuur)\b/i;
const NAAM_PATROON =
  /(\b(dhr|mw|mevr|mevrouw|de heer|drs|mr|ir|ing|prof|dr)\b\.?|\b[A-Z]\.([A-Z]\.)*|\b[A-Z][a-zà-ÿ]+\s+(van|de|den|der|ten|te|van der|van den)?\s*[A-Z][a-zà-ÿ]+)/;

function isBestuurMetNamen(regel: string): boolean {
  const r = regel.trim().replace(/^[-*•]\s*/, "");
  if (r.length > 160) return false;
  if (!BESTUURSROL.test(r)) return false;
  // Na de rol moet een naam staan, anders is het gewoon een zin over het bestuur.
  const na = r.replace(BESTUURSROL, "").replace(/^[\s:–—-]+/, "");
  if (!na) return false;
  return NAAM_PATROON.test(na);
}

// Jaarrekening: regels die vooral uit getallen bestaan, plus de vaste koppen van een
// jaarrekening. Bedragen in proza ("wij verstrekken bijdragen tot € 15.000") worden
// hier niet door geraakt: die regel is grotendeels letters én bevat een bedragsignaal.
const JAARREKENING_KOP =
  /^(balans( per)?|staat van baten en lasten|winst[- ]en[- ]verliesrekening|kasstroomoverzicht|toelichting op de (balans|staat)|grondslagen (van|voor) (de )?(waardering|financiële verslaggeving)|activa|passiva|vlottende activa|liquide middelen|eigen vermogen|voorzieningen|langlopende schulden|kortlopende schulden|totaal (activa|passiva|baten|lasten)|begroting \d{4}|jaarrekening \d{4}|controleverklaring|samenstellingsverklaring)\b/i;

function cijferAandeel(regel: string): number {
  const zonderRuimte = regel.replace(/\s/g, "");
  if (!zonderRuimte.length) return 0;
  const cijferachtig = (zonderRuimte.match(/[\d.,()€%-]/g) ?? []).length;
  return cijferachtig / zonderRuimte.length;
}

function isJaarrekening(regel: string): boolean {
  const r = regel.trim();
  if (!r) return false;
  if (r.length <= 120 && JAARREKENING_KOP.test(r)) return true;
  // Een tabelregel: minstens twee getalkolommen en overwegend cijfers/leestekens.
  const getallen = r.match(/-?\d[\d.,]*/g) ?? [];
  if (getallen.length < 2) return false;
  return cijferAandeel(r) >= 0.45;
}

const ANBI_STANDAARD =
  /^(rsin|fiscaal ?nummer|kvk[- ]?(nummer)?|kamer van koophandel|iban|bankrekening(nummer)?|btw[- ]?nummer|rechtsvorm|statutaire naam|statutair adres|postadres|bezoekadres|telefoonnummer|e-?mailadres|website)\b\s*[:.]?/i;
const ANBI_ZIN =
  /(standaardformulier publicatieplicht|anbi[- ]status|algemeen nut beogende instelling|beloningsbeleid|vacatiegeld|de bestuurders? ontvang(t|en) geen bezoldiging|onbezoldigd|conform de richtlijn.{0,40}beloning)/i;

function isAnbiStandaard(regel: string): boolean {
  const r = regel.trim();
  if (!r || r.length > 300) return false;
  return ANBI_STANDAARD.test(r) || ANBI_ZIN.test(r);
}

// ---------------------------------------------------------------------------
// De schoonmaak zelf
// ---------------------------------------------------------------------------

type Regel = { tekst: string; weg: SchoonmaakCategorie | null };

function beoordeel(regel: string): SchoonmaakCategorie | null {
  if (!regel.trim()) return null;
  if (isCookieOfPrivacy(regel)) return "cookie_privacy";
  if (isNavigatie(regel)) return "navigatie";
  if (isBestuurMetNamen(regel)) return "bestuur_namen";
  if (isJaarrekening(regel)) return "jaarrekening";
  if (isAnbiStandaard(regel)) return "anbi_standaard";
  return null;
}

export function schoonBeleidstekst(tekst: string): {
  tekst: string;
  rapport: SchoonmaakRapport;
} {
  const ruweRegels = tekst.split(/\r?\n/);
  const perCategorie: Partial<Record<SchoonmaakCategorie, number>> = {};
  let behouden = 0;

  function tel(cat: SchoonmaakCategorie, tekens: number) {
    perCategorie[cat] = (perCategorie[cat] ?? 0) + tekens;
  }

  // Ronde 1: herhaalde korte regels opsporen (pagina-koppen en -voetteksten van een
  // gescrapete site). Pas vanaf drie keer, en alleen als de regel zelf geen beleid
  // bevat — een uitsluiting die op elke pagina herhaald staat mag blijven staan.
  const telling = new Map<string, number>();
  for (const r of ruweRegels) {
    const sleutel = r.trim();
    if (!sleutel || sleutel.length > 80) continue;
    telling.set(sleutel, (telling.get(sleutel) ?? 0) + 1);
  }
  const herhaald = new Set(
    [...telling.entries()]
      .filter(([sleutel, n]) => n >= 3 && !isBeleidsregel(sleutel))
      .map(([sleutel]) => sleutel),
  );

  const beoordeeld: Regel[] = ruweRegels.map((regel) => {
    if (!regel.trim()) return { tekst: regel, weg: null };

    // HET VANGNET GAAT VOOR ALLES. Een regel met een beleidssignaal blijft staan,
    // ook als hij er verder als boilerplate uitziet.
    const kandidaat = herhaald.has(regel.trim())
      ? "herhaalde_kop"
      : beoordeel(regel);
    if (!kandidaat) return { tekst: regel, weg: null };
    if (isBeleidsregel(regel)) {
      behouden++;
      return { tekst: regel, weg: null };
    }
    tel(kandidaat, regel.length + 1);
    return { tekst: regel, weg: kandidaat };
  });

  const behoudenRegels = beoordeeld.filter((r) => r.weg === null).map((r) => r.tekst);

  // Witruimte: drie of meer lege regels worden er twee. Puur cosmetisch, maar in
  // gescrapete pagina's loopt dit flink op.
  const samengevouwen: string[] = [];
  let leeg = 0;
  for (const r of behoudenRegels) {
    if (!r.trim()) {
      leeg++;
      if (leeg > 1) continue;
      samengevouwen.push("");
    } else {
      leeg = 0;
      // Regel-interne witruimte (tabelinspringing uit een PDF) inklappen.
      samengevouwen.push(r.replace(/[ \t ]{2,}/g, " ").trimEnd());
    }
  }
  const schoon = samengevouwen.join("\n").trim();

  const voor = tekst.length;
  const witruimteWinst = Math.max(
    0,
    voor - schoon.length - Object.values(perCategorie).reduce((a, b) => a + b, 0),
  );
  if (witruimteWinst > 0) tel("witruimte", witruimteWinst);

  return {
    tekst: schoon,
    rapport: {
      tekens_voor: voor,
      tekens_na: schoon.length,
      verwijderd: voor - schoon.length,
      aandeel: voor > 0 ? (voor - schoon.length) / voor : 0,
      regels_voor: ruweRegels.length,
      regels_na: samengevouwen.length,
      per_categorie: perCategorie,
      behouden_door_beleidssignaal: behouden,
    },
  };
}

// Eén regel log per fonds, zodat na een ronde te controleren is hoeveel er per fonds
// is weggehaald en waaruit dat bestond. Bewust compact: 238 fondsen moeten in een
// logvenster passen zonder dat je gaat scrollen.
export function schoonmaakRegel(naam: string, r: SchoonmaakRapport): string {
  const delen = Object.entries(r.per_categorie)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  return (
    `[schoonmaak] ${naam}: ${r.tekens_voor} -> ${r.tekens_na} tekens ` +
    `(-${Math.round(r.aandeel * 100)}%)` +
    (delen ? ` | ${delen}` : " | niets weggehaald") +
    (r.behouden_door_beleidssignaal
      ? ` | ${r.behouden_door_beleidssignaal} regel(s) behouden op beleidssignaal`
      : "")
  );
}

// Optelling over meerdere documenten, voor de rapportage van een hele ronde.
export function telRapporten(rapporten: SchoonmaakRapport[]): SchoonmaakRapport {
  const leeg: SchoonmaakRapport = {
    tekens_voor: 0,
    tekens_na: 0,
    verwijderd: 0,
    aandeel: 0,
    regels_voor: 0,
    regels_na: 0,
    per_categorie: {},
    behouden_door_beleidssignaal: 0,
  };
  const som = rapporten.reduce((acc, r) => {
    acc.tekens_voor += r.tekens_voor;
    acc.tekens_na += r.tekens_na;
    acc.verwijderd += r.verwijderd;
    acc.regels_voor += r.regels_voor;
    acc.regels_na += r.regels_na;
    acc.behouden_door_beleidssignaal += r.behouden_door_beleidssignaal;
    for (const [k, v] of Object.entries(r.per_categorie)) {
      const cat = k as SchoonmaakCategorie;
      acc.per_categorie[cat] = (acc.per_categorie[cat] ?? 0) + (v ?? 0);
    }
    return acc;
  }, leeg);
  som.aandeel = som.tekens_voor > 0 ? som.verwijderd / som.tekens_voor : 0;
  return som;
}
