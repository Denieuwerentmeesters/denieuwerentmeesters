import type { CategorieSleutel } from "@/app/(app)/landgoed/[id]/documenten/categorieen";

// Fondsenradar — HET AANVRAAGDOSSIER PER FONDS (§4, §7 en §8 van het plan).
//
// Deze module beantwoordt drie vragen die op de detailpagina van een fonds
// achter elkaar gesteld worden, en doet dat zonder één databaseaanroep: alles is
// pure functie op (vereisten, documenten, vandaag). Net als de poort
// (lib/fondsen/poort.ts) is dat bewust — het maakt de redenering testbaar en
// houdt de pagina zelf een opmaaklaag.
//
//   1. Wat moet er aangeleverd worden, en door WIE? Twee stapels: "dit maken wij
//      voor u" en "dit moet u regelen" (§4). Dat onderscheid is de sleutel van
//      de hele module.
//   2. Wat kunnen wij NIET maken? Uitdrukkelijk benoemen in plaats van
//      verzwijgen (§7 slot). Een lijst die suggereert dat alles vanzelf gaat is
//      erger dan een eerlijke "dit kunnen wij niet voor u samenstellen": de
//      gebruiker ontdekt het verschil anders pas een week voor de deadline.
//   3. Wat ligt er al, en is dat nog geldig? De koppeling naar de
//      documentenmodule (0036 + 0057). Dit onderscheid is de bestaansreden van
//      het gedeelde dossier: na één aanvraag ligt de halve stapel klaar voor de
//      volgende.
//
// EEN ONTBREKENDE WAARDE IS NOOIT EEN GERUSTSTELLING. Overal waar iets niet is
// vastgesteld (zelf_op_te_stellen NULL, geen geldigheidsdatum op een stuk dat
// veroudert) levert deze module een eigen, zichtbare stand op — niet stilzwijgend
// de gunstige kant. Dat is dezelfde drie-waardige logica als in de poort.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const FASEN = ["vooraf", "bij_aanvraag", "achteraf"] as const;
export type Fase = (typeof FASEN)[number];

export const VERPLICHTHEDEN = ["verplicht", "aanbevolen", "soms"] as const;
export type Verplichtheid = (typeof VERPLICHTHEDEN)[number];

/** Eén rij uit `regeling_bewijs`, zoals de detailpagina hem ophaalt. */
export type Vereiste = {
  id: string;
  omschrijving: string;
  vereiste_type: string;
  fase: string;
  verplichtheid: string;
  /** true = wij stellen op, false = extern regelen, null = niet vastgesteld. */
  zelf_op_te_stellen: boolean | null;
  doorlooptijd_indicatie?: string | null;
  document_categorie?: string | null;
  document_type?: string | null;
  bron_tekst?: string | null;
  geaccordeerd: boolean;
};

/** Eén rij uit `document` van dit landgoed. */
export type Archiefstuk = {
  id: string;
  titel: string;
  categorie: string;
  geldig_tot: string | null;
  categorie_geaccordeerd?: boolean | null;
};

// ---------------------------------------------------------------------------
// Wat kunnen de generatoren maken, en wat niet?
// ---------------------------------------------------------------------------
// §7 noemt de documenten die het systeem straks opstelt (projectplan als
// verhaal, begroting, dekkingsplan, aanvraagbrief) en zegt er in één adem bij
// welke het NOOIT kan maken: "Offertes, bouwkundig of restauratierapport,
// onafhankelijke kostenraming, ecologisch onderzoek, vergunningen, jaarrekening,
// accountantsverklaring en KVK-uittreksel. Dit wordt een externe taak met een
// doorlooptijd, niet een generatieopdracht."
//
// Die tweede lijst staat hier expliciet, en niet als "alles wat niet in de
// eerste lijst staat", om één reden: een verrijkingsronde die per ongeluk
// `zelf_op_te_stellen = true` op een offerte zet, moet zichtbaar botsen in
// plaats van stilletjes een belofte doen die geen generator kan waarmaken.
// `strijdigeToezegging` hieronder is precies die botsing.

export const GENEREERBARE_TYPEN = new Set([
  "projectplan",
  "begroting",
  "dekkingsplan",
  "aanvraagformulier",
]);

/** Wat er zou worden gegenereerd, in gewone woorden. Voedt de "volgt later"-lijst. */
export const GENERATOR_LABELS: Record<string, string> = {
  projectplan: "Projectplan als verhaal — aanleiding, wat het oplevert en voor wie",
  begroting: "Begroting in vrij format, met expliciete btw-positie",
  dekkingsplan: "Dekkingsplan — alle bronnen, bedragen en hun status",
  aanvraagformulier: "Aanvraagbrief, toegeschreven op de doelstelling van dit fonds",
};

/**
 * Stukken die per definitie van buiten komen, ook als de rij anders beweert.
 * Letterlijk de opsomming uit §7 ("Wat het systeem niet kan maken").
 */
export const EXTERN_VAN_NATURE = new Set([
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
]);

// ---------------------------------------------------------------------------
// Waar hoort een vereist stuk in het archief?
// ---------------------------------------------------------------------------
// Vuistregel, geen vaststelling — daarom in code en niet als gegeven in de
// database (zie het commentaar bij migratie 0057). Staat er wél een
// `document_categorie` op de rij, dan wint die: dat is een vaststelling uit de
// bron en die hoort een afleiding te overrulen.
//
// Een type dat hier ontbreekt levert `null` op, en `null` betekent "niet in het
// archief te zoeken" — niet "ontbreekt". Een projectplan of dekkingsplan bestaat
// nog niet als archiefstuk; dat als gat tellen zou de teller "6 van de 9" laten
// liegen in de richting die de gebruiker het duurst komt te staan.

export const CATEGORIE_PER_VEREISTE: Record<string, CategorieSleutel> = {
  offerte: "leveranciers",
  kostenraming: "leveranciers",
  jaarrekening: "governance",
  jaarverslag: "governance",
  statuten: "governance",
  kvk_uittreksel: "governance",
  anbi_bewijs: "governance",
  bestuurssamenstelling: "governance",
  bankgegevens: "governance",
  eigendomsbewijs: "eigendom_rechten",
  vergunning: "vergunningen",
  monumentgegevens: "historisch",
  beheerplan: "beheerplannen",
};

export function categorieVoor(v: Vereiste): CategorieSleutel | null {
  const vast = (v.document_categorie ?? "").trim();
  if (vast && vast !== "nog_in_te_delen") return vast as CategorieSleutel;
  return CATEGORIE_PER_VEREISTE[v.vereiste_type] ?? null;
}

/**
 * Stukken die verouderen. Een KVK-uittreksel mag bij vrijwel elk fonds niet
 * ouder zijn dan een jaar; een jaarrekening moet die van het laatste boekjaar
 * zijn. Staat er op zo'n stuk geen `geldig_tot`, dan is de geldigheid ONBEKEND —
 * en dat is uitdrukkelijk iets anders dan "in orde".
 */
export const VEROUDERT: Record<string, string> = {
  kvk_uittreksel: "mag meestal niet ouder zijn dan een jaar",
  jaarrekening: "moet die van het laatste boekjaar zijn",
  jaarverslag: "moet dat van het laatste boekjaar zijn",
  bestuurssamenstelling: "moet de actuele samenstelling zijn",
  vergunning: "moet nog geldig zijn op de startdatum van het werk",
  anbi_bewijs: "de status moet actueel zijn",
};

// ---------------------------------------------------------------------------
// De twee stapels (§4)
// ---------------------------------------------------------------------------

export type Stapel = "wij" | "u" | "onbepaald";

export function stapelVan(v: Vereiste): Stapel {
  // Een van nature extern stuk komt nooit op de "wij maken dit"-stapel, wat de
  // rij ook beweert. Zie `strijdigeToezegging` voor de melding daarover.
  if (EXTERN_VAN_NATURE.has(v.vereiste_type)) return "u";
  if (v.zelf_op_te_stellen === true) return "wij";
  if (v.zelf_op_te_stellen === false) return "u";
  return "onbepaald";
}

/**
 * De rij zegt "wij stellen dit op" terwijl er geen generator is die dat kan.
 * Levert de zin op die dat toegeeft; null als er niets aan de hand is.
 */
export function strijdigeToezegging(v: Vereiste): string | null {
  if (v.zelf_op_te_stellen !== true) return null;
  if (GENEREERBARE_TYPEN.has(v.vereiste_type)) return null;
  return `De bronverrijking merkte dit aan als "stellen wij op", maar dit is geen stuk dat wij kunnen samenstellen — het moet van buiten komen.`;
}

export type Stapels = {
  wij: Vereiste[];
  u: Vereiste[];
  onbepaald: Vereiste[];
  /** Vereisten in de "wij"-stapel waar geen generator voor bestaat. */
  strijdig: { vereiste: Vereiste; uitleg: string }[];
};

export function deelStapels(vereisten: Vereiste[]): Stapels {
  const wij: Vereiste[] = [];
  const u: Vereiste[] = [];
  const onbepaald: Vereiste[] = [];
  const strijdig: { vereiste: Vereiste; uitleg: string }[] = [];
  for (const v of vereisten) {
    const uitleg = strijdigeToezegging(v);
    if (uitleg) strijdig.push({ vereiste: v, uitleg });
    const s = stapelVan(v);
    if (s === "wij") wij.push(v);
    else if (s === "u") u.push(v);
    else onbepaald.push(v);
  }
  return { wij, u, onbepaald, strijdig };
}

// ---------------------------------------------------------------------------
// Wat hebben we al? (§4, koppeling met de documentenmodule)
// ---------------------------------------------------------------------------

export type DekkingStand =
  | "aanwezig" // ligt er en is geldig
  | "verloopt" // ligt er, maar verloopt binnen 90 dagen
  | "verlopen" // ligt er, maar is niet meer geldig
  | "geldigheid_onbekend" // ligt er, veroudert, maar geen geldigheidsdatum vastgelegd
  | "ontbreekt" // hoort in het archief te liggen en ligt er niet
  | "niet_archiefstuk"; // wordt opgesteld, is niets om in het archief te zoeken

export type Dekking = {
  vereiste: Vereiste;
  categorie: CategorieSleutel | null;
  stand: DekkingStand;
  stukken: Archiefstuk[];
  toelichting: string | null;
};

/** Binnen hoeveel dagen een geldigheidsdatum als "let op" telt (zoals 0036 voor vergunningen). */
export const VERLOOPT_BINNEN_DAGEN = 90;

function dagenTot(datum: string, vandaag: Date): number {
  return Math.ceil((new Date(`${datum}T00:00:00Z`).getTime() - vandaag.getTime()) / 86_400_000);
}

export function bepaalDekking(
  vereisten: Vereiste[],
  documenten: Archiefstuk[],
  vandaag: Date = new Date(),
): Dekking[] {
  return vereisten.map((v) => {
    const categorie = categorieVoor(v);
    if (categorie === null) {
      return {
        vereiste: v,
        categorie,
        stand: "niet_archiefstuk" as const,
        stukken: [],
        toelichting: null,
      };
    }
    const stukken = documenten.filter((d) => d.categorie === categorie);
    if (stukken.length === 0) {
      return {
        vereiste: v,
        categorie,
        stand: "ontbreekt" as const,
        stukken: [],
        toelichting: null,
      };
    }

    const veroudert = VEROUDERT[v.vereiste_type] ?? null;
    // Het gunstigste stuk in de categorie bepaalt de stand: één geldig
    // exemplaar is genoeg, ook als er een verlopen versie naast ligt.
    const metDatum = stukken.filter((d) => d.geldig_tot);
    if (metDatum.length > 0) {
      const langste = Math.max(...metDatum.map((d) => dagenTot(d.geldig_tot as string, vandaag)));
      if (langste < 0)
        return {
          vereiste: v,
          categorie,
          stand: "verlopen" as const,
          stukken,
          toelichting: `De geldigheid is ${Math.abs(langste)} dagen geleden verlopen.`,
        };
      if (langste <= VERLOOPT_BINNEN_DAGEN)
        return {
          vereiste: v,
          categorie,
          stand: "verloopt" as const,
          stukken,
          toelichting: `Nog ${langste} dagen geldig — vernieuw dit vóór de aanvraag de deur uit gaat.`,
        };
      return { vereiste: v, categorie, stand: "aanwezig" as const, stukken, toelichting: null };
    }

    if (veroudert)
      return {
        vereiste: v,
        categorie,
        stand: "geldigheid_onbekend" as const,
        stukken,
        toelichting: `Er ligt een stuk in deze categorie, maar zonder geldigheidsdatum — en dit stuk ${veroudert}. Controleer of het nog bruikbaar is.`,
      };

    return { vereiste: v, categorie, stand: "aanwezig" as const, stukken, toelichting: null };
  });
}

export type DekkingTelling = {
  /** Vereisten die überhaupt in het archief te vinden zijn. De noemer. */
  telbaar: number;
  binnen: number;
  aandacht: number; // verlopen, verloopt of geldigheid onbekend
  ontbreekt: number;
  /** Alleen wat als 'verplicht' te boek staat — dat is wat een aanvraag blokkeert. */
  verplicht_telbaar: number;
  verplicht_binnen: number;
};

export function telDekking(dekkingen: Dekking[]): DekkingTelling {
  const telbaar = dekkingen.filter((d) => d.stand !== "niet_archiefstuk");
  const isBinnen = (d: Dekking) => d.stand === "aanwezig";
  const verplicht = telbaar.filter((d) => d.vereiste.verplichtheid === "verplicht");
  return {
    telbaar: telbaar.length,
    binnen: telbaar.filter(isBinnen).length,
    aandacht: telbaar.filter(
      (d) => d.stand === "verlopen" || d.stand === "verloopt" || d.stand === "geldigheid_onbekend",
    ).length,
    ontbreekt: telbaar.filter((d) => d.stand === "ontbreekt").length,
    verplicht_telbaar: verplicht.length,
    verplicht_binnen: verplicht.filter(isBinnen).length,
  };
}

// ---------------------------------------------------------------------------
// Het matchprofiel leesbaar maken (§5)
// ---------------------------------------------------------------------------
// De prompt in lib/fondsen/matchprofiel.ts dwingt zes vaste kopjes af. Die
// splitsing hier ongedaan maken zou het profiel tot één grijze lap tekst maken
// waarin de uitsluitingen — het belangrijkste onderdeel — wegvallen tussen de
// rest. Houdt het model zich niet aan het formaat, dan komt de hele tekst als
// één blok terug onder een lege kop; liever een lelijke weergave dan een
// onvolledige.

export const PROFIEL_KOPJES = [
  "Wat dit fonds wil bereiken:",
  "Wat ze wél financieren:",
  "Wat ze uitdrukkelijk NIET financieren:",
  "Wie mag aanvragen en langs welke route:",
  "Waar het geldt en in welke orde van grootte:",
  "Haakjes:",
] as const;

export type ProfielDeel = { kop: string; tekst: string };

export function splitsProfiel(profiel: string | null | undefined): ProfielDeel[] {
  const tekst = (profiel ?? "").trim();
  if (!tekst) return [];
  const regels = tekst.split("\n");
  const delen: ProfielDeel[] = [];
  let huidig: ProfielDeel | null = null;
  for (const regel of regels) {
    const schoon = regel.trim();
    const kop = PROFIEL_KOPJES.find((k) => schoon.toLowerCase() === k.toLowerCase());
    if (kop) {
      huidig = { kop, tekst: "" };
      delen.push(huidig);
      continue;
    }
    if (!schoon) continue;
    if (!huidig) {
      huidig = { kop: "", tekst: "" };
      delen.push(huidig);
    }
    huidig.tekst = huidig.tekst ? `${huidig.tekst}\n${schoon}` : schoon;
  }
  return delen.filter((d) => d.tekst.length > 0 || d.kop.length > 0);
}

/**
 * Tegenstrijdigheden die de verrijking vastlegde, opgevist uit de tekst.
 *
 * De matchprofiel-prompt draagt het model op tegenstrijdigheden te BENOEMEN in
 * plaats van te kiezen; er is geen apart kolommetje waar ze in landen. Wie ze
 * dan niet opzoekt, laat ze onderin een alinea verdwijnen — precies het
 * gladstrijken dat de prompt wilde voorkomen. Vandaar deze eenvoudige greep op
 * de woorden die het model daarvoor gebruikt.
 */
const STRIJDIG_WOORDEN = [
  "tegenstrijdig",
  "tegenstrijdigheid",
  "spreken elkaar tegen",
  "spreekt dit tegen",
  "spreekt de site tegen",
  "in tegenspraak",
  "terwijl de site",
  "terwijl het beleidsplan",
  "elders staat",
  "wijkt af van",
];

// Zelfreferentiële vlag: het model markeert een passage soms alleen als
// "tegenstrijdig gepubliceerd" (evt. met "dit is"/"dat is" ervoor) zonder te
// zeggen WAT er tegenstrijdig is. Zo'n zin benoemt geen enkele concrete
// tegenstrijdigheid en voegt naast de wél concrete meldingen van
// `botsendeBedragen` niets toe.
const CONTENTLOOZE_VLAG = /^(dit|dat|het)?\s*(is\s+)?tegenstrijdig gepubliceerd\.?$/i;

export function vindTegenstrijdigheden(...teksten: (string | null | undefined)[]): string[] {
  const gevonden: string[] = [];
  for (const t of teksten) {
    if (!t) continue;
    // Op zinnen splitsen, maar niet op de punt in "€ 10.000" of "bv.".
    for (const zin of t.split(/(?<=[.!?])\s+(?=[A-Z(“"])/)) {
      const schoon = zin.trim();
      if (!schoon || CONTENTLOOZE_VLAG.test(schoon)) continue;
      const laag = schoon.toLowerCase();
      if (!STRIJDIG_WOORDEN.some((w) => laag.includes(w))) continue;

      // Dedupe op inhoud, niet op exacte string: "Dit is tegenstrijdig X"
      // bevat "Tegenstrijdig X" vaak al letterlijk, en dat is dezelfde
      // melding twee keer.
      if (gevonden.some((g) => g.toLowerCase().includes(laag) || laag.includes(g.toLowerCase()))) continue;

      gevonden.push(schoon);
    }
  }
  return gevonden;
}

// ---------------------------------------------------------------------------
// Contactgegevens — AVG (§9 slot)
// ---------------------------------------------------------------------------
// `regeling.contact` bevat wat de bron publiceert, en dat is soms een naam met
// een mobiel nummer ("zeeland@cultuurfonds.nl, Esther Prince 06-38363946").
// Bestuurders en medewerkers van fondsen zijn geïdentificeerde natuurlijke
// personen; hun naam en 06-nummer hier herpubliceren is een verwerking waarvoor
// dit platform geen grondslag heeft.
//
// Daarom een OPBOUWENDE en geen wegstrepende aanpak: we halen de algemene
// kanalen uit de tekst en gooien al het overige weg. Een filter dat namen
// probeert te herkennen mist er altijd één; een filter dat alleen doorlaat wat
// het herkent als algemeen kanaal, kan hoogstens te weinig tonen. Die kant van
// de fout is de goedkope.

/** Mailboxen die naar een organisatie wijzen, niet naar een persoon. */
export const ALGEMENE_MAILBOXEN = new Set([
  "info",
  "contact",
  "algemeen",
  "secretariaat",
  "secretaris",
  "bureau",
  "post",
  "mail",
  "aanvraag",
  "aanvragen",
  "subsidie",
  "subsidies",
  "fonds",
  "fondsen",
  "stichting",
  "administratie",
  "office",
  "bestuur",
  "loket",
]);

/** Provincienamen komen voor als afdelingsmailbox (zeeland@cultuurfonds.nl). */
const AFDELINGSWOORDEN = new Set([
  "drenthe",
  "flevoland",
  "friesland",
  "fryslan",
  "gelderland",
  "groningen",
  "limburg",
  "noordbrabant",
  "noord-brabant",
  "noordholland",
  "noord-holland",
  "overijssel",
  "utrecht",
  "zeeland",
  "zuidholland",
  "zuid-holland",
]);

export function isAlgemeenAdres(adres: string): boolean {
  const lokaal = adres.split("@")[0]?.toLowerCase() ?? "";
  if (!lokaal) return false;
  if (ALGEMENE_MAILBOXEN.has(lokaal)) return true;
  if (AFDELINGSWOORDEN.has(lokaal)) return true;
  return false;
}

export type SchoonContact = {
  emails: string[];
  telefoons: string[];
  urls: string[];
  /** true als er iets uit de bron is weggelaten omdat het een persoon kon zijn. */
  weggelaten: boolean;
};

export function schoonContact(ruw: string | null | undefined): SchoonContact {
  const tekst = (ruw ?? "").trim();
  const leeg: SchoonContact = { emails: [], telefoons: [], urls: [], weggelaten: false };
  if (!tekst) return leeg;

  const emails = [...tekst.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/g)].map((m) => m[0]);
  const algemeen = emails.filter(isAlgemeenAdres);

  const urls = [...tekst.matchAll(/https?:\/\/[^\s,;]+/g)].map((m) => m[0]);

  // Vaste nummers doorlaten, mobiele niet: een 06-nummer is in Nederland vrijwel
  // altijd het toestel van één persoon, een 070-nummer het bureau.
  const nummers = [...tekst.matchAll(/(?:\+31[\s-]?|0)\d[\d\s-]{7,12}\d/g)].map((m) =>
    m[0].trim(),
  );
  const vast = nummers.filter((n) => {
    const cijfers = n.replace(/[^\d]/g, "").replace(/^31/, "0");
    return !cijfers.startsWith("06");
  });

  const weggelaten =
    emails.length > algemeen.length ||
    nummers.length > vast.length ||
    // Alles wat geen adres, nummer of url is, is vrije tekst — en dáár staan de
    // namen. Blijft er na het wegknippen nog letterwerk over, dan is er iets
    // weggelaten en zeggen we dat.
    /[A-Za-z]{2,}/.test(
      tekst
        .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, " ")
        .replace(/https?:\/\/[^\s,;]+/g, " ")
        .replace(/(?:\+31[\s-]?|0)\d[\d\s-]{7,12}\d/g, " ")
        .replace(/\b(di|wo|do|vr|ma|za|zo|t|tel|telefoon|e|mail|email)\b/gi, " "),
    );

  return { emails: algemeen, telefoons: vast, urls, weggelaten };
}
