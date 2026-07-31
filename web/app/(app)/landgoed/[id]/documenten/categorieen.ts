// Documentcategorieën — de enige bron van waarheid.
//
// Deze lijst voedt drie dingen tegelijk: de check-constraint in migratie 0036, de
// keuzelijst in het uploadformulier én de classificatieprompt in lib/ai.ts. Zodra
// hij ergens gedupliceerd wordt, lopen overzicht en formulier uit elkaar — dat is
// precies de fout die deze module moet voorkomen. Voeg je een categorie toe, dan
// hoort daar dus ook een migratie bij die de constraint verruimt.
//
// Een categorie is een LABEL, geen map. Eén document bestaat één keer en wordt op
// meerdere plekken getoond; koppelingen naar contracten, objecten en subsidies
// lopen via document_koppeling, niet via een pad.

export type CategorieSleutel =
  | "eigendom_rechten"
  | "governance"
  | "contracten_verhuur"
  | "leveranciers"
  | "beheerplannen"
  | "subsidies"
  | "vergunningen"
  | "keuringen"
  | "onderzoeken"
  | "verzekeringen"
  | "personeel"
  | "vergaderingen"
  | "historisch"
  | "nog_in_te_delen";

export type Categorie = {
  sleutel: CategorieSleutel;
  label: string;
  /** Eén regel context onder de titel; ook de kern van de classificatieprompt. */
  omschrijving: string;
  /** Waar de classificatie op let. Niet uitputtend, wél sturend. */
  trefwoorden: string[];
};

export const NOG_IN_TE_DELEN: CategorieSleutel = "nog_in_te_delen";

export const CATEGORIEEN: Categorie[] = [
  {
    sleutel: "eigendom_rechten",
    label: "Eigendom en rechten",
    omschrijving:
      "Aktes van levering, kadastrale uittreksels en kaarten, erfdienstbaarheden, erfpacht- en opstalaktes, grensbepalingen.",
    trefwoorden: [
      "akte van levering",
      "notariële akte",
      "kadaster",
      "kadastraal uittreksel",
      "erfdienstbaarheid",
      "erfpacht",
      "opstalrecht",
      "recht van overpad",
      "grensreconstructie",
      "eigendomsbewijs",
    ],
  },
  {
    sleutel: "governance",
    label: "Governance en eigendomsstructuur",
    omschrijving:
      "Statuten, aandeelhoudersovereenkomsten, familiestatuut, testamenten, schenkingsaktes, NSW-rangschikking qua eigendomsstructuur.",
    trefwoorden: [
      "statuten",
      "aandeelhoudersovereenkomst",
      "familiestatuut",
      "testament",
      "schenkingsakte",
      "maatschapscontract",
      "certificering aandelen",
      "nsw-rangschikking",
      "bestuursreglement",
    ],
  },
  {
    sleutel: "contracten_verhuur",
    label: "Contracten en verhuur",
    omschrijving:
      "Pacht, huur van woningen en bedrijfsruimtes, jachthuur, gebruiksovereenkomsten, opleverrapporten bij in- en uithuizing.",
    trefwoorden: [
      "pachtovereenkomst",
      "huurovereenkomst",
      "jachthuurovereenkomst",
      "gebruiksovereenkomst",
      "huurder",
      "pachter",
      "opleverrapport",
      "inspectierapport woning",
      "huurprijs",
      "pachtprijs",
    ],
  },
  {
    sleutel: "leveranciers",
    label: "Leveranciers en opdrachten",
    omschrijving:
      "Aannemersovereenkomsten, onderhoudscontracten, raamafspraken, offertes, leverancierscertificeringen.",
    trefwoorden: [
      "aannemingsovereenkomst",
      "offerte",
      "opdrachtbevestiging",
      "onderhoudscontract",
      "raamovereenkomst",
      "aannemer",
      "leverancier",
      "servicecontract",
      "werkbon",
    ],
  },
  {
    sleutel: "beheerplannen",
    label: "Beheerplannen en werkplannen",
    omschrijving:
      "Bosbeheerplan, natuurbeheerplan, MJOP, jaarlijkse werkplannen, bosbouwkundige inventarisaties.",
    trefwoorden: [
      "bosbeheerplan",
      "natuurbeheerplan",
      "beheerplan",
      "mjop",
      "meerjarenonderhoudsplan",
      "werkplan",
      "bosbouwkundige inventarisatie",
      "kapplan",
      "dunning",
    ],
  },
  {
    sleutel: "subsidies",
    label: "Subsidies en verplichtingen",
    omschrijving:
      "Aanvragen, beschikkingen, verantwoordingen en controlerapporten — SNL, ANLb, SKNL, restauratiesubsidies.",
    trefwoorden: [
      "subsidiebeschikking",
      "subsidieaanvraag",
      "vaststellingsbeschikking",
      "snl",
      "anlb",
      "sknl",
      "instandhoudingssubsidie",
      "sim",
      "verantwoording",
      "controlerapport",
      "rvo",
    ],
  },
  {
    sleutel: "vergunningen",
    label: "Vergunningen en overheidscorrespondentie",
    omschrijving:
      "Omgevings- en kapvergunningen, ontheffingen, brieven van gemeente, provincie, waterschap en RVO, bezwaar en beroep.",
    trefwoorden: [
      "omgevingsvergunning",
      "kapvergunning",
      "ontheffing",
      "wet natuurbescherming",
      "bezwaarschrift",
      "beroepschrift",
      "gemeente",
      "provincie",
      "waterschap",
      "handhavingsbrief",
      "melding activiteitenbesluit",
    ],
  },
  {
    sleutel: "keuringen",
    label: "Keuringen en certificaten",
    omschrijving:
      "NEN 3140 elektra, legionellabeheer, brandmeldinstallatie, liftkeuring, asbestinventarisatie, VTA-boomveiligheidscontroles.",
    trefwoorden: [
      "nen 3140",
      "keuringsrapport",
      "legionella",
      "brandmeldinstallatie",
      "liftkeuring",
      "asbestinventarisatie",
      "vta",
      "boomveiligheidscontrole",
      "certificaat",
      "geldig tot",
      "herkeuring",
    ],
  },
  {
    sleutel: "onderzoeken",
    label: "Onderzoeken en rapportages",
    omschrijving:
      "Ecologische quickscans, bouwhistorisch onderzoek, bodemonderzoek, taxatierapporten, energielabels.",
    trefwoorden: [
      "quickscan",
      "ecologisch onderzoek",
      "bouwhistorisch onderzoek",
      "bodemonderzoek",
      "taxatierapport",
      "energielabel",
      "onderzoeksrapport",
      "nulmeting",
      "archeologisch",
    ],
  },
  {
    sleutel: "verzekeringen",
    label: "Verzekeringen, schade en incidenten",
    omschrijving:
      "Polissen, schadedossiers, aansprakelijkheidskwesties, ongevals- en incidentrapportages.",
    trefwoorden: [
      "polisblad",
      "verzekeringspolis",
      "schadeclaim",
      "schadedossier",
      "aansprakelijkheidstelling",
      "expertiserapport",
      "incidentrapportage",
      "ongevalsrapport",
      "premie",
    ],
  },
  {
    sleutel: "personeel",
    label: "Personeel en inzet",
    omschrijving:
      "Arbeidsovereenkomsten van rentmeester, boswachter of hovenier, en vrijwilligersafspraken.",
    trefwoorden: [
      "arbeidsovereenkomst",
      "loonstrook",
      "vrijwilligersovereenkomst",
      "functieomschrijving",
      "cao",
      "rentmeester",
      "boswachter",
      "hovenier",
      "stageovereenkomst",
    ],
  },
  {
    sleutel: "vergaderingen",
    label: "Vergaderingen en verslagen",
    omschrijving: "Notulen, gespreksverslagen en besluitenlijsten.",
    trefwoorden: [
      "notulen",
      "verslag",
      "besluitenlijst",
      "actiepuntenlijst",
      "agenda vergadering",
      "aanwezig",
      "afwezig met kennisgeving",
    ],
  },
  {
    sleutel: "historisch",
    label: "Historisch archief",
    omschrijving:
      "Oude kaarten, tekeningen, foto's, familiegeschiedenis en publicaties over het landgoed.",
    trefwoorden: [
      "historische kaart",
      "familiegeschiedenis",
      "archiefstuk",
      "oude tekening",
      "publicatie",
      "jubileumboek",
      "krantenknipsel",
    ],
  },
  {
    sleutel: NOG_IN_TE_DELEN,
    label: "Nog in te delen",
    omschrijving: "Classificatie nog niet bevestigd.",
    trefwoorden: [],
  },
];

export const CATEGORIE_SLEUTELS: CategorieSleutel[] = CATEGORIEEN.map(
  (c) => c.sleutel,
);

const PER_SLEUTEL = new Map(CATEGORIEEN.map((c) => [c.sleutel, c]));

export function isCategorie(waarde: string): waarde is CategorieSleutel {
  return PER_SLEUTEL.has(waarde as CategorieSleutel);
}

export function categorieLabel(sleutel: string): string {
  return PER_SLEUTEL.get(sleutel as CategorieSleutel)?.label ?? sleutel;
}

export function categorieOmschrijving(sleutel: string): string {
  return PER_SLEUTEL.get(sleutel as CategorieSleutel)?.omschrijving ?? "";
}

// ── Relevantie ────────────────────────────────────────────────────────────
//
// Een nieuw landgoed moet niet tegen twaalf lege vakken aankijken. Daarom drie
// standen: gevuld (gewoon zichtbaar), leeg-maar-relevant (gedempt, als openstaand
// gat) en leeg-en-niet-relevant (weggevouwen achter "Toon alle categorieën").
//
// De regels staan bewust hier, als één pure functie, zodat ze op één plek te tunen
// zijn en in een test vastgelegd kunnen worden. Alleen kolommen die echt bestaan:
// landgoed.rechtsvorm (0017), stamobject.categorie (0018), relatie.type (0001).

export type RelevantieFeiten = {
  heeftContracten: boolean;
  heeftLopendeSubsidies: boolean;
  rechtsvorm: string | null;
  heeftGebouwObjecten: boolean;
  heeftGroenObjecten: boolean;
  heeftMedewerkers: boolean;
  heeftGesprekken: boolean;
};

export type Zichtbaarheid = "gevuld" | "relevant" | "verborgen";

/** Rechtsvormen waarbij governance-stukken (statuten, aandeelhouders) horen. */
const ENTITEIT_RECHTSVORMEN = [
  "bv",
  "b.v.",
  "stichting",
  "maatschap",
  "vof",
  "v.o.f.",
  "nv",
  "n.v.",
  "cooperatie",
  "coöperatie",
  "vereniging",
];

/** stamobject-categorieën die om keuringen vragen. */
const GEBOUW_CATEGORIEEN = ["gebouw", "woning", "opstal", "rijksmonument", "brug"];

/** stamobject-categorieën die om een beheerplan vragen. */
const GROEN_CATEGORIEEN = [
  "natuur",
  "natuurbeheertype",
  "bomenlaan",
  "tuin",
  "onderhoudszone",
  "pachtperceel",
];

export function isEntiteitRechtsvorm(rechtsvorm: string | null): boolean {
  if (!rechtsvorm) return false;
  const laag = rechtsvorm.toLowerCase();
  return ENTITEIT_RECHTSVORMEN.some((r) => laag.includes(r));
}

export function isGebouwCategorie(categorie: string): boolean {
  return GEBOUW_CATEGORIEEN.includes(categorie);
}

export function isGroenCategorie(categorie: string): boolean {
  return GROEN_CATEGORIEEN.includes(categorie);
}

/** Rollen in relatie.type die op eigen personeel wijzen. */
const MEDEWERKER_ROLLEN = [
  "medewerker",
  "personeel",
  "rentmeester",
  "boswachter",
  "hovenier",
  "vrijwilliger",
  "beheerder",
];

export function isMedewerkerRol(type: string | null): boolean {
  if (!type) return false;
  const laag = type.toLowerCase();
  return MEDEWERKER_ROLLEN.some((r) => laag.includes(r));
}

/**
 * Bepaalt per categorie of het blok zichtbaar, gedempt of weggevouwen is.
 * `nog_in_te_delen` volgt deze logica niet: dat blok verschijnt alleen als er
 * iets in staat — het is een werkvoorraad, geen onderwerp.
 */
export function bepaalRelevantie(
  feiten: RelevantieFeiten,
  tellingen: Record<string, number>,
): Record<CategorieSleutel, Zichtbaarheid> {
  const relevantZonderInhoud: Record<CategorieSleutel, boolean> = {
    eigendom_rechten: true, // altijd — dit is de basis onder alles
    governance: isEntiteitRechtsvorm(feiten.rechtsvorm),
    contracten_verhuur: feiten.heeftContracten,
    leveranciers: false,
    beheerplannen: feiten.heeftGroenObjecten,
    subsidies: feiten.heeftLopendeSubsidies,
    vergunningen: false,
    keuringen: feiten.heeftGebouwObjecten,
    onderzoeken: false,
    verzekeringen: false,
    personeel: feiten.heeftMedewerkers,
    vergaderingen: feiten.heeftGesprekken,
    historisch: false,
    nog_in_te_delen: false,
  };

  const uit = {} as Record<CategorieSleutel, Zichtbaarheid>;
  for (const c of CATEGORIEEN) {
    const aantal = tellingen[c.sleutel] ?? 0;
    if (aantal > 0) uit[c.sleutel] = "gevuld";
    else if (relevantZonderInhoud[c.sleutel]) uit[c.sleutel] = "relevant";
    else uit[c.sleutel] = "verborgen";
  }
  return uit;
}
