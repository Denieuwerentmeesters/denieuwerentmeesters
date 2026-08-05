import { toetsCriterium, type Profiel } from "@/app/(app)/landgoed/[id]/subsidies/matching";

// Fondsenradar fase 2 — DE POORT (laag 1 van §5 van het implementatieplan).
//
// Harde, deterministische filters die per landgoed bepalen welke fondsen
// überhaupt in aanmerking komen. Nul databaseaanroepen in deze module: alles is
// pure functie op (fonds, landgoedprofiel, vraag, regio-aliassen). Dat maakt de
// poort testbaar en houdt de kosten op nul — pas wat hier doorheen komt gaat
// straks naar laag 2 (weging) en laag 3 (taalmodel).
//
// DRIE UITKOMSTEN, NIET TWEE. Bij fondsen is "niet gepubliceerd" de meest
// voorkomende waarde (§2). Leest de poort NULL als "voldoet niet", dan
// verdwijnen goede fondsen; leest hij het als "voldoet wel", dan krijg je valse
// hoop. Daarom kent elke poort `doorgelaten` / `afgevallen` / `onbekend`, en is
// `onbekend` een zichtbare actie ("dit moeten we navragen") in plaats van een
// stille kant-keuze.
//
// AFVALLEN IS NIET VERDWIJNEN. Elk oordeel draagt zijn reden mee. De reden
// tonen is hier belangrijker dan de shortlist zelf (§10, fase 2): daarmee wordt
// zichtbaar wat er aan het landgoed zou moeten veranderen — geen ANBI-vehikel,
// geen publiekscomponent, verkeerde provincie.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const POORTEN = [
  "benaderbaarheid",
  "geografie",
  "rechtsvorm",
  "aanvrager_route",
  "bedragband",
  "projectstatus",
  "kostensoort",
] as const;
export type PoortNaam = (typeof POORTEN)[number];

export type PoortUitkomst = "doorgelaten" | "afgevallen" | "onbekend";

export type PoortOordeel = {
  poort: PoortNaam;
  uitkomst: PoortUitkomst;
  reden: string;
  // Een ánder handelingsperspectief dan "schrijf dit fonds aan". Een fonds met
  // een actie is uitdrukkelijk NIET afgewezen (§1 van de opdracht: bij
  // `via_intermediair` en `derde_partij` valt het fonds niet af).
  actie?: string;
  // Herkadering bij de kostensoort-poort (§9.2): als onderhoud is er niets, als
  // restauratie of als afgebakend project wél.
  herkadering?: string;
};

export type FondsOordeel = {
  fonds_id: string;
  naam: string;
  uitkomst: PoortUitkomst;
  reden: string; // de reden van de poort die de uitkomst bepaalde
  poorten: PoortOordeel[];
  acties: string[];
  waarschuwingen: string[]; // redenen van de poorten die 'onbekend' gaven
  herkaderingen: string[];
};

// De projectstatus is een parameter van de VRAAG, niet van het fonds (§6).
export const PROJECTSTATUSSEN = [
  "idee",
  "in_voorbereiding",
  "gegund",
  "gestart",
  "afgerond",
] as const;
export type Projectstatus = (typeof PROJECTSTATUSSEN)[number];

// Wat de gebruiker wil financieren. Alles optioneel: zonder vraag toetst de
// poort alleen de landgoedgebonden dingen, en dat is de stand op de
// catalogus-pagina.
export type Vraag = {
  projectstatus?: Projectstatus | null;
  bedrag?: number | null;
  kostensoort?: string | null;
};

// Het landgoedprofiel voor de poort. Bewust een SUPERSET van wat `Profiel` uit
// de subsidie-matcher nodig heeft, zodat `toetsCriterium` hergebruikt kan
// worden in plaats van gedupliceerd.
export type Landgoedprofiel = Profiel;

export type PoortFonds = {
  id: string;
  naam: string;
  benaderbaarheid: string;
  benaderwijze_notitie?: string | null;
  aanvrager_type: string;
  landgoed_route?: string | null;
  landgoed_partnertype?: string | null;
  geo_niveau?: string | null;
  geo_waarden?: string[] | null;
  bedrag_min?: number | null;
  bedrag_max?: number | null;
  kostensoort?: string[] | null;
  // Machine-toetsbare criteria uit `regeling_criterium` (fase 'vooraf').
  criteria?: PoortCriterium[];
};

export type PoortCriterium = {
  omschrijving: string;
  veld: string | null;
  operator: string | null;
  waarde: string | null;
  soort: string | null; // 'eis' | 'pre' | 'uitsluiting'
  fase?: string | null;
};

// Eén rij uit `regio_alias`: een regionaam vertaald naar provincie + gemeenten.
export type RegioAlias = {
  alias: string;
  provincie: string | null;
  gemeenten: string[];
  landelijk: boolean;
  geaccordeerd: boolean;
};

// ---------------------------------------------------------------------------
// Hulpjes
// ---------------------------------------------------------------------------

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function aliasIndex(rijen: RegioAlias[]): Map<string, RegioAlias> {
  const m = new Map<string, RegioAlias>();
  for (const r of rijen) m.set(norm(r.alias), r);
  return m;
}

export const PROVINCIES = [
  "Drenthe",
  "Flevoland",
  "Friesland",
  "Gelderland",
  "Groningen",
  "Limburg",
  "Noord-Brabant",
  "Noord-Holland",
  "Overijssel",
  "Utrecht",
  "Zeeland",
  "Zuid-Holland",
];
const PROVINCIE_SET = new Set(PROVINCIES.map(norm));

// Knipt een vrije-tekst werkgebied in brokjes die apart herkenbaar zijn.
// "Noord-Holland (Kennemerland: Haarlem, Bloemendaal)" ->
// ["noord-holland", "kennemerland", "haarlem", "bloemendaal"]
export function splitsWerkgebied(waarde: string): string[] {
  // Haakjes zijn zelf een scheiding: "Noord-Holland (Kennemerland)" zijn twee
  // aanduidingen, geen één.
  const zonderHaakjes = waarde.replace(/[()]/g, ";");
  return zonderHaakjes
    .split(/[,;:/+]| en | of /i)
    .map(norm)
    .filter((s) => s.length > 1);
}

// ---------------------------------------------------------------------------
// Poort 1 — benaderbaarheid (§3)
// ---------------------------------------------------------------------------
// Geen matchcriterium maar een poort, en hij geldt alleen aan de fondsenkant.
// De kosten van een fout zijn asymmetrisch: een fonds ten onrechte aanschrijven
// kost goodwill in een kleine sector. Daarom valt `op_uitnodiging`/`gesloten`
// af (maar blijft zichtbaar mét reden), en levert `via_intermediair` een ándere
// actie op in plaats van een afwijzing.

export function toetsBenaderbaarheid(f: PoortFonds): PoortOordeel {
  const citaat = f.benaderwijze_notitie ? ` Bron: “${kort(f.benaderwijze_notitie, 160)}”` : "";
  switch (f.benaderbaarheid) {
    case "open":
      return {
        poort: "benaderbaarheid",
        uitkomst: "doorgelaten",
        reden: "Publiek aanvraagloket — iedereen mag indienen.",
      };
    case "open_met_drempel":
      return {
        poort: "benaderbaarheid",
        uitkomst: "doorgelaten",
        reden:
          "Aanvragen kan, maar met een voorwaarde vooraf (ANBI-status, oriënterend contact of een portaal)." +
          citaat,
      };
    case "via_intermediair":
      return {
        poort: "benaderbaarheid",
        uitkomst: "doorgelaten",
        reden:
          "Dit fonds neemt directe aanvragen niet in behandeling; het loopt via een derde partij." +
          citaat,
        actie:
          "Leg contact met de partij die hier wél mag indienen (doorgaans het provinciale Landschap of een andere intermediair) — schrijf dit fonds niet zelf aan.",
      };
    case "op_uitnodiging":
      return {
        poort: "benaderbaarheid",
        uitkomst: "afgevallen",
        reden: "Uitsluitend op uitnodiging; ongevraagd aanschrijven kost goodwill." + citaat,
      };
    case "gesloten":
      return {
        poort: "benaderbaarheid",
        uitkomst: "afgevallen",
        reden: "Financiert alleen eigen doelen en neemt geen aanvragen aan." + citaat,
      };
    default:
      // 'onbekend' (of een waarde die we niet kennen): doorlaten mét
      // waarschuwing. Onbekend is geen nee.
      return {
        poort: "benaderbaarheid",
        uitkomst: "onbekend",
        reden:
          "Niet vastgesteld of en hoe hier aangevraagd kan worden. Dit is geen 'nee' — het is werk dat nog gedaan moet worden, en polsen vóór indienen is hier verstandig.",
      };
  }
}

function kort(s: string, n: number): string {
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

// ---------------------------------------------------------------------------
// Poort 2 — geografie (§5)
// ---------------------------------------------------------------------------
// De valkuil zit aan twee kanten. `internationaal` moet expliciet UITSLUITEN
// (Prince Bernhard Nature Fund draagt de tag "Natuur" maar financiert alleen
// buiten Nederland). En een werkgebied dat als vrije tekst is vastgelegd
// ("Kennemerland", "de Achterhoek") moet ONBEKEND opleveren en nooit "voldoet
// niet" — zolang `regio_alias` die naam niet naar gemeenten vertaalt, weten we
// het domweg niet.
//
// Een NIET-geaccordeerde alias mag daarom alleen doorlaten of onbekend maken,
// nooit laten afvallen: een vertaling die nog geen mens heeft gezien is geen
// grond om een fonds weg te strepen.

export function toetsGeografie(
  f: PoortFonds,
  p: Landgoedprofiel,
  aliassen: Map<string, RegioAlias> = new Map(),
): PoortOordeel {
  const niveau = f.geo_niveau ?? null;
  const waarden = (f.geo_waarden ?? []).filter(Boolean);
  const prov = norm(p.provincie);
  const gem = norm(p.gemeente);

  if (niveau === null) {
    return {
      poort: "geografie",
      uitkomst: "onbekend",
      reden: "Werkgebied is niet vastgesteld. NULL is iets anders dan landelijk.",
    };
  }
  if (niveau === "landelijk") {
    return { poort: "geografie", uitkomst: "doorgelaten", reden: "Landelijk werkgebied." };
  }
  if (niveau === "internationaal") {
    return {
      poort: "geografie",
      uitkomst: "afgevallen",
      reden:
        "Financiert uitsluitend buiten Nederland. Een Nederlandse tag (bijvoorbeeld 'Natuur') maakt dit fonds nog geen Nederlandse kans.",
    };
  }

  if (niveau === "provincie") {
    if (!prov)
      return {
        poort: "geografie",
        uitkomst: "onbekend",
        reden: "Fonds werkt provinciaal, maar van dit landgoed is geen provincie bekend.",
      };
    const treffer = waarden.find((w) => norm(w) === prov);
    if (treffer)
      return {
        poort: "geografie",
        uitkomst: "doorgelaten",
        reden: `Werkgebied ${treffer} omvat dit landgoed.`,
      };
    // Vrije tekst in een provincieveld ("Landelijk / internationaal") is geen
    // provincienaam: dan weten we het niet.
    const alleZuiverProvincie = waarden.length > 0 && waarden.every((w) => PROVINCIE_SET.has(norm(w)));
    if (alleZuiverProvincie)
      return {
        poort: "geografie",
        uitkomst: "afgevallen",
        reden: `Werkt alleen in ${waarden.join(", ")}; dit landgoed ligt in ${p.provincie}.`,
      };
    return {
      poort: "geografie",
      uitkomst: "onbekend",
      reden: `Werkgebied staat als vrije tekst ("${kort(waarden.join("; "), 120)}") en is niet naar een provincie te herleiden.`,
    };
  }

  if (niveau === "gemeente") {
    if (!gem)
      return {
        poort: "geografie",
        uitkomst: "onbekend",
        reden: "Fonds werkt gemeentelijk, maar van dit landgoed is geen gemeente bekend.",
      };
    if (waarden.some((w) => norm(w) === gem))
      return { poort: "geografie", uitkomst: "doorgelaten", reden: `Gemeente ${p.gemeente} valt in het werkgebied.` };
    return {
      poort: "geografie",
      uitkomst: "afgevallen",
      reden: `Werkt alleen in ${waarden.join(", ")}; dit landgoed ligt in ${p.gemeente}.`,
    };
  }

  if (niveau === "plaats") {
    if (gem && waarden.some((w) => norm(w) === gem))
      return { poort: "geografie", uitkomst: "doorgelaten", reden: `Plaatsnaam valt samen met gemeente ${p.gemeente}.` };
    // Een plaatsnaam is niet zonder woordenboek naar een gemeente te herleiden.
    return {
      poort: "geografie",
      uitkomst: "onbekend",
      reden: `Werkgebied is een plaatsnaam (${waarden.join(", ")}) die nog niet naar een gemeente vertaald is.`,
    };
  }

  // niveau === 'regio' — hier zit de bulk van de vrije tekst.
  return toetsRegio(waarden, p, aliassen);
}

function toetsRegio(
  waarden: string[],
  p: Landgoedprofiel,
  aliassen: Map<string, RegioAlias>,
): PoortOordeel {
  const prov = norm(p.provincie);
  const gem = norm(p.gemeente);
  let ietsHerkend = false;
  const tegenspraak: string[] = [];

  for (const w of waarden) {
    // 1. Hele string als alias (de curatiestap: precies zoals hij in
    //    geo_waarden staat, dus zonder interpretatie).
    const heel = aliassen.get(norm(w));
    const fragmenten = splitsWerkgebied(w);
    const kandidaten: RegioAlias[] = [];
    if (heel) kandidaten.push(heel);
    for (const fr of fragmenten) {
      const a = aliassen.get(fr);
      if (a) kandidaten.push(a);
    }

    for (const a of kandidaten) {
      ietsHerkend = true;
      if (a.landelijk)
        return { poort: "geografie", uitkomst: "doorgelaten", reden: `Werkgebied "${w}" is landelijk.` };
      if (prov && norm(a.provincie) === prov)
        return {
          poort: "geografie",
          uitkomst: "doorgelaten",
          reden: `Regio "${a.alias}" ligt in ${p.provincie}.`,
        };
      if (gem && a.gemeenten.some((g) => norm(g) === gem))
        return {
          poort: "geografie",
          uitkomst: "doorgelaten",
          reden: `Gemeente ${p.gemeente} valt binnen regio "${a.alias}".`,
        };
      if (a.geaccordeerd) tegenspraak.push(a.alias);
    }

    // 2. Zonder alias: alleen dingen die letterlijk in de tekst staan.
    for (const fr of fragmenten) {
      if (fr.startsWith("landelijk") || fr === "nederland")
        return {
          poort: "geografie",
          uitkomst: "doorgelaten",
          reden: `Werkgebied "${kort(w, 100)}" is in de kern landelijk; de regionale toevoeging is een voorkeur, geen begrenzing.`,
        };
      if (prov && fr === prov)
        return { poort: "geografie", uitkomst: "doorgelaten", reden: `Werkgebied noemt ${p.provincie}.` };
      if (gem && fr === gem)
        return { poort: "geografie", uitkomst: "doorgelaten", reden: `Werkgebied noemt ${p.gemeente}.` };
    }
  }

  // Alleen een GEACCORDEERDE vertaling mag een fonds laten afvallen.
  if (tegenspraak.length > 0)
    return {
      poort: "geografie",
      uitkomst: "afgevallen",
      reden: `Werkgebied ${tegenspraak.join(", ")} omvat ${p.gemeente ?? p.provincie ?? "dit landgoed"} niet (geaccordeerde regiovertaling).`,
    };

  return {
    poort: "geografie",
    uitkomst: "onbekend",
    reden: ietsHerkend
      ? `Werkgebied "${kort(waarden.join("; "), 120)}" is vertaald maar de vertaling is nog niet geaccordeerd — daarom geen conclusie.`
      : `Werkgebied staat als vrije tekst ("${kort(waarden.join("; "), 120)}") en is nog niet naar gemeenten vertaald. Dit is uitdrukkelijk geen "voldoet niet".`,
  };
}

// ---------------------------------------------------------------------------
// Poort 3 — rechtsvorm (§9.1, de grootste harde filter)
// ---------------------------------------------------------------------------
// Veel fondsen geven uitsluitend aan stichtingen of verenigingen. Voor een
// landgoed in privébezit valt daarmee in één klap een groot deel van de lijst
// af, hoe goed het project ook past.
//
// UITZONDERING uit de verrijkingsslag: de Cultuurfonds-voorwaarden staan bij
// restauratie van een historische buitenplaats een NSW-familie-B.V. expliciet
// toe waar de hoofdregel stichting/vereniging eist ("Uitzondering: in het geval
// van historische buitenplaatsen mag het erfgoed ook in bezit zijn van een
// familie-B.V. die verbonden is aan de Natuurschoonwet."). Zo'n landgoed mag
// hier dus niet hard afvallen; het wordt `onbekend` met de uitzondering erbij.

const ORGANISATIEVORMEN = new Set(["stichting", "vereniging", "collectief"]);
const BV_VORMEN = new Set(["bv", "b.v.", "besloten vennootschap", "nsw-bv", "nsw bv", "landgoed-bv"]);

export function isNswFamilieBv(p: Landgoedprofiel): boolean {
  return BV_VORMEN.has(norm(p.rechtsvorm)) && norm(p.nsw_status) === "actief";
}

export function toetsRechtsvorm(f: PoortFonds, p: Landgoedprofiel): PoortOordeel {
  const criteria = (f.criteria ?? []).filter(
    (c) => c.veld === "rechtsvorm" && (c.fase ?? "vooraf") === "vooraf",
  );
  if (criteria.length === 0)
    return {
      poort: "rechtsvorm",
      uitkomst: "doorgelaten",
      reden: "Geen rechtsvormeis vastgelegd bij dit fonds.",
    };

  if (!norm(p.rechtsvorm))
    return {
      poort: "rechtsvorm",
      uitkomst: "onbekend",
      reden:
        "Dit fonds stelt een eis aan de rechtsvorm van de aanvrager, maar van dit landgoed is de rechtsvorm niet vastgelegd. Vul die eerst in — dit is de grootste harde filter van de hele lijst.",
    };

  for (const c of criteria) {
    const soort = c.soort ?? "eis";
    // Hergebruik van de subsidie-matcher: dezelfde operatoren, dezelfde
    // drie-waardige uitslag. Niet dupliceren.
    const uitslag = toetsCriterium(p, c);
    const eistOrganisatie = (c.waarde ?? "")
      .toLowerCase()
      .split(/[,;]/)
      .map((s) => s.trim())
      .some((s) => ORGANISATIEVORMEN.has(s));

    if (soort === "uitsluiting" ? uitslag === "voldoet" : uitslag === "voldoet_niet") {
      if (eistOrganisatie && isNswFamilieBv(p))
        return {
          poort: "rechtsvorm",
          uitkomst: "onbekend",
          reden:
            `${c.omschrijving}. Maar dit landgoed is een NSW-gerangschikte familie-B.V., en de Cultuurfonds-voorwaarden laten die bij restauratie van een historische buitenplaats uitdrukkelijk toe. Navragen of dat hier ook geldt.`,
        };
      return {
        poort: "rechtsvorm",
        uitkomst: "afgevallen",
        reden: `${c.omschrijving}; dit landgoed is een ${p.rechtsvorm}.`,
      };
    }
    if (uitslag === "onzeker")
      return {
        poort: "rechtsvorm",
        uitkomst: "onbekend",
        reden: `Rechtsvormeis niet machinaal te toetsen: ${c.omschrijving}.`,
      };
  }

  return {
    poort: "rechtsvorm",
    uitkomst: "doorgelaten",
    reden: `Rechtsvorm ${p.rechtsvorm} voldoet aan de eis van dit fonds.`,
  };
}

// ---------------------------------------------------------------------------
// Poort 4 — aanvrager-route
// ---------------------------------------------------------------------------
// `derde_partij` is géén afwijzing. Er valt geld te verdienen, maar via een
// ander: het landgoed komt als locatiepost op de begroting van een zorg-,
// jeugd- of welzijnsorganisatie. Het handelingsperspectief is "zoek een
// partner", niet "schrijf een aanvraag" — en dát is de informatie die de
// gebruiker nodig heeft.

export function toetsAanvragerRoute(f: PoortFonds): PoortOordeel {
  if (f.landgoed_route === "niet_relevant")
    return {
      poort: "aanvrager_route",
      uitkomst: "afgevallen",
      reden: "Er is geen denkbare route waarlangs dit geld bij een landgoed komt.",
    };

  switch (f.aanvrager_type) {
    case "landgoedeigenaar":
    case "beide":
      return {
        poort: "aanvrager_route",
        uitkomst: "doorgelaten",
        reden: "Het landgoed is zelf een toegestane aanvrager.",
      };
    case "derde_partij":
      return {
        poort: "aanvrager_route",
        uitkomst: "doorgelaten",
        reden: "Alleen een derde organisatie kan hier aanvragen; het landgoed komt op háár begroting terecht.",
        actie: f.landgoed_partnertype
          ? `Zoek een partner: ${kort(f.landgoed_partnertype, 200)}`
          : "Zoek een partner die dit kan aanvragen — zelf aanschrijven heeft geen zin.",
      };
    case "nvt":
      return {
        poort: "aanvrager_route",
        uitkomst: "afgevallen",
        reden: "Geen aanvraagbaar instrument (donatie-instrument of anderszins niet aan te vragen).",
      };
    default:
      return {
        poort: "aanvrager_route",
        uitkomst: "onbekend",
        reden:
          "Niet vastgesteld wie hier mag aanvragen. Een gok op dit punt levert de verkeerde actie op; dit hoort uitgezocht te worden.",
      };
  }
}

// ---------------------------------------------------------------------------
// Poort 5 — bedragband
// ---------------------------------------------------------------------------
// Alleen toetsen als er een projectbedrag bekend is. Geen bedrag = geen toets:
// een fonds mag nooit afvallen op een vraag die nog niet gesteld is.

export function toetsBedragband(f: PoortFonds, v: Vraag): PoortOordeel {
  const bedrag = v.bedrag ?? null;
  if (bedrag == null || !Number.isFinite(bedrag))
    return {
      poort: "bedragband",
      uitkomst: "doorgelaten",
      reden: "Geen projectbedrag bekend — niet getoetst.",
    };
  const min = f.bedrag_min ?? null;
  const max = f.bedrag_max ?? null;
  if (min == null && max == null)
    return {
      poort: "bedragband",
      uitkomst: "onbekend",
      reden: "Dit fonds publiceert geen bedragband, dus of het gevraagde bedrag past is niet te zeggen.",
    };
  if (min != null && bedrag < min)
    return {
      poort: "bedragband",
      uitkomst: "afgevallen",
      reden: `Gevraagd bedrag (${euro(bedrag)}) ligt onder de ondergrens van dit fonds (${euro(min)}).`,
    };
  if (max != null && bedrag > max)
    return {
      poort: "bedragband",
      uitkomst: "afgevallen",
      reden: `Gevraagd bedrag (${euro(bedrag)}) ligt boven wat dit fonds per toekenning geeft (${euro(max)}). Als deelpost in een gestapelde begroting kan het wel.`,
    };
  return {
    poort: "bedragband",
    uitkomst: "doorgelaten",
    reden: `Gevraagd bedrag (${euro(bedrag)}) valt binnen de band ${min != null ? euro(min) : "onbekend"}–${max != null ? euro(max) : "onbekend"}.`,
  };
}

function euro(n: number): string {
  return `EUR ${Math.round(n).toLocaleString("nl-NL")}`;
}

// ---------------------------------------------------------------------------
// Poort 6 — projectstatus (§6, de timing-val)
// ---------------------------------------------------------------------------
// Bijna geen enkele bron financiert met terugwerkende kracht. Is de opdracht
// gegund of de schop de grond in, dan ben je te laat. Dit is een parameter van
// de VRAAG, niet van het fonds: hij knijpt alle suggesties tegelijk af, en de
// uitleg waarom hoort er dwingend bij — anders lijkt de radar leeg terwijl er
// alleen te laat gekeken is.

const TE_LAAT: Record<string, string> = {
  gegund: "de opdracht is al gegund",
  gestart: "het werk is al gestart",
  afgerond: "het werk is al afgerond",
};

export function toetsProjectstatus(v: Vraag): PoortOordeel {
  const status = v.projectstatus ?? null;
  if (!status)
    return {
      poort: "projectstatus",
      uitkomst: "doorgelaten",
      reden: "Geen projectstatus opgegeven — niet getoetst.",
    };
  const telaat = TE_LAAT[status];
  if (telaat)
    return {
      poort: "projectstatus",
      uitkomst: "afgevallen",
      reden:
        `Te laat: ${telaat}. Vrijwel geen enkel fonds of subsidie financiert met terugwerkende kracht — ` +
        "de aanvraag moet vóór gunning liggen. Voor een volgende fase van hetzelfde project kan het wél.",
    };
  return {
    poort: "projectstatus",
    uitkomst: "doorgelaten",
    reden:
      status === "idee"
        ? "Project is nog een idee — precies het moment waarop financiering nog kan."
        : "Project is in voorbereiding en nog niet gegund; op tijd dus.",
  };
}

// ---------------------------------------------------------------------------
// Poort 7 — kostensoort (§9.2, herkaderen in plaats van stil laten mislukken)
// ---------------------------------------------------------------------------
// Regulier onderhoud en exploitatie staan bij vrijwel alle fondsen expliciet op
// de uitsluitingslijst. Er wordt geïnvesteerd, gerestaureerd en geprojecteerd,
// niet onderhouden. Het systeem moet dat niet stilzwijgend laten mislukken maar
// actief herkaderen.

const HERKADERING =
  "Als 'onderhoud' is er vrijwel niets. Geformuleerd als restauratie van een monumentaal onderdeel, " +
  "of als het wegwerken van achterstallig onderhoud in één afgebakend project met begin en eind, " +
  "komen er wél bronnen in beeld.";

// Fondsen waarvan uit de verrijking blijkt dat ze onderhoud wél financieren.
// Vangnet voor rijen waar `kostensoort` nog leeg is; staat de kostensoort er
// eenmaal in, dan doet de data het werk en is deze lijst overbodig.
export const ONDERHOUD_UITZONDERINGEN = [
  "brabants erfgoedfonds",
  "bomenfonds",
  "bouwman boerema",
  "volkskracht natuurmonumenten",
];

const HERKADER_SOORTEN = new Set(["regulier_onderhoud", "exploitatie"]);

export function toetsKostensoort(f: PoortFonds, v: Vraag): PoortOordeel {
  const gevraagd = v.kostensoort ?? null;
  if (!gevraagd)
    return {
      poort: "kostensoort",
      uitkomst: "doorgelaten",
      reden: "Geen kostensoort opgegeven — niet getoetst.",
    };
  const lijst = (f.kostensoort ?? []).map(norm);
  const naam = norm(f.naam);
  const uitzondering = ONDERHOUD_UITZONDERINGEN.some((u) => naam.includes(u));

  if (lijst.includes(norm(gevraagd)))
    return {
      poort: "kostensoort",
      uitkomst: "doorgelaten",
      reden: `Dit fonds financiert ${gevraagd.replace("_", " ")}.`,
    };

  if (uitzondering && HERKADER_SOORTEN.has(gevraagd))
    return {
      poort: "kostensoort",
      uitkomst: "doorgelaten",
      reden: `Uitzondering: dit fonds financiert ${gevraagd.replace("_", " ")} wél (vastgesteld in de verrijkingsslag).`,
    };

  if (lijst.length === 0)
    return {
      poort: "kostensoort",
      uitkomst: "onbekend",
      reden: "Dit fonds heeft nog geen kostensoorten vastgelegd; of het hierop past is niet te zeggen.",
      herkadering: HERKADER_SOORTEN.has(gevraagd) ? HERKADERING : undefined,
    };

  if (HERKADER_SOORTEN.has(gevraagd))
    return {
      poort: "kostensoort",
      uitkomst: "afgevallen",
      reden: `Dit fonds financiert geen ${gevraagd.replace("_", " ")} (wel: ${lijst.join(", ")}).`,
      herkadering: HERKADERING,
    };

  return {
    poort: "kostensoort",
    uitkomst: "afgevallen",
    reden: `Dit fonds financiert geen ${gevraagd.replace("_", " ")} (wel: ${lijst.join(", ")}).`,
  };
}

// ---------------------------------------------------------------------------
// De poort als geheel
// ---------------------------------------------------------------------------
// ALLE poorten worden geëvalueerd, ook nadat er één is afgevallen. Dat kost
// niets (het zijn stringvergelijkingen) en levert de trechtercijfers op waarmee
// te zien is of het filter te streng staat — kortsluiten zou precies de meting
// wegnemen waar §9.7 om vraagt.
//
// Samenvoegregel: één afgevallen poort => afgevallen (de eerste in
// POORTEN-volgorde is de hoofdreden). Anders: één onbekend => onbekend.
// Anders: doorgelaten.

export function toetsPoort(
  f: PoortFonds,
  p: Landgoedprofiel,
  v: Vraag = {},
  aliassen: Map<string, RegioAlias> = new Map(),
): FondsOordeel {
  const poorten: PoortOordeel[] = [
    toetsBenaderbaarheid(f),
    toetsGeografie(f, p, aliassen),
    toetsRechtsvorm(f, p),
    toetsAanvragerRoute(f),
    toetsBedragband(f, v),
    toetsProjectstatus(v),
    toetsKostensoort(f, v),
  ];

  const afgevallen = poorten.filter((o) => o.uitkomst === "afgevallen");
  const onbekend = poorten.filter((o) => o.uitkomst === "onbekend");
  const uitkomst: PoortUitkomst =
    afgevallen.length > 0 ? "afgevallen" : onbekend.length > 0 ? "onbekend" : "doorgelaten";

  return {
    fonds_id: f.id,
    naam: f.naam,
    uitkomst,
    reden:
      afgevallen[0]?.reden ??
      onbekend[0]?.reden ??
      "Komt door alle harde poorten heen.",
    poorten,
    acties: poorten.map((o) => o.actie).filter((a): a is string => Boolean(a)),
    waarschuwingen: onbekend.map((o) => o.reden),
    herkaderingen: poorten.map((o) => o.herkadering).filter((h): h is string => Boolean(h)),
  };
}

// ---------------------------------------------------------------------------
// Trechtercijfers (§9.7)
// ---------------------------------------------------------------------------
// Zelfde patroon als `omgeving_run`: hoeveel gingen erin, hoeveel kwamen door
// elke poort, hoeveel bleven er over. Zonder die cijfers is niet te zien of het
// filter te streng staat. Let op dezelfde beperking als daar: dit meet alleen
// wat de catalogus bevat — wat er nooit in kwam telt nergens mee, en daarvoor
// is een blinde steekproef nodig.

export type PoortTelling = { door: number; af: number; onbekend: number };

export type Trechter = {
  totaal: number;
  doorgelaten: number;
  afgevallen: number;
  onbekend: number;
  met_actie: number;
  per_poort: Record<PoortNaam, PoortTelling>;
  // Waarop viel het af? Per poort het aantal keer dat hij de HOOFDreden was.
  hoofdreden: Record<PoortNaam, number>;
};

export function trechter(oordelen: FondsOordeel[]): Trechter {
  const leeg = () => ({ door: 0, af: 0, onbekend: 0 });
  const per_poort = Object.fromEntries(POORTEN.map((n) => [n, leeg()])) as Record<
    PoortNaam,
    PoortTelling
  >;
  const hoofdreden = Object.fromEntries(POORTEN.map((n) => [n, 0])) as Record<PoortNaam, number>;

  for (const o of oordelen) {
    for (const po of o.poorten) {
      const t = per_poort[po.poort];
      if (po.uitkomst === "doorgelaten") t.door++;
      else if (po.uitkomst === "afgevallen") t.af++;
      else t.onbekend++;
    }
    if (o.uitkomst === "afgevallen") {
      const eerste = o.poorten.find((po) => po.uitkomst === "afgevallen");
      if (eerste) hoofdreden[eerste.poort]++;
    }
  }

  return {
    totaal: oordelen.length,
    doorgelaten: oordelen.filter((o) => o.uitkomst === "doorgelaten").length,
    afgevallen: oordelen.filter((o) => o.uitkomst === "afgevallen").length,
    onbekend: oordelen.filter((o) => o.uitkomst === "onbekend").length,
    met_actie: oordelen.filter((o) => o.acties.length > 0).length,
    per_poort,
    hoofdreden,
  };
}
