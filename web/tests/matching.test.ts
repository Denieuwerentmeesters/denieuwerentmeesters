// Tests voor de matchmotor-kern: het toetsen van criteria tegen het landgoedprofiel.
// Dit is de logica die bepaalt welke subsidieregelingen als kans verschijnen.
import { describe, expect, it } from "vitest";
import {
  bepaalNevenreden,
  profielWaarde,
  scoorRegeling,
  toetsCriterium,
  waardeertNnnPositief,
  type Profiel,
} from "@/app/(app)/landgoed/[id]/subsidies/matching";

// Een compleet ingevuld testprofiel (naar het voorbeeld van Ter Hooge).
const profiel: Profiel = {
  provincie: "Zeeland",
  gemeente: "Middelburg",
  nsw_status: "actief",
  rechtsvorm: "stichting",
  hectare: 58.4,
  natuurbeheertypes: ["N16.03 Droog bos met productie", "N12.02 Kruiden- en faunarijk grasland"],
  agrarisch: true,
  aantalPachtpercelen: 4,
  ligt_in_natura2000: false,
  ligt_in_nnn: true,
  ligt_op_veengrond: null, // nog niet gecontroleerd -> moet 'onzeker' opleveren
  anlb_leefgebied: "a12 open akkerland (akkervogel)",
  themas: [],
  trefwoorden: [],
  drempel: 60,
};

describe("toetsCriterium", () => {
  it("operator 'is' vergelijkt exact, ongeacht hoofdletters", () => {
    expect(
      toetsCriterium(profiel, { veld: "provincie", operator: "is", waarde: "zeeland" }),
    ).toBe("voldoet");
    expect(
      toetsCriterium(profiel, { veld: "provincie", operator: "is", waarde: "Utrecht" }),
    ).toBe("voldoet_niet");
  });

  it("operator 'bevat' vindt een deelwoord (ANLb-leefgebied)", () => {
    expect(
      toetsCriterium(profiel, { veld: "anlb_leefgebied", operator: "bevat", waarde: "akkervogel" }),
    ).toBe("voldoet");
    expect(
      toetsCriterium(profiel, { veld: "anlb_leefgebied", operator: "bevat", waarde: "weidevogel" }),
    ).toBe("voldoet_niet");
  });

  it("operator 'in' toetst tegen een lijst opties", () => {
    expect(
      toetsCriterium(profiel, { veld: "provincie", operator: "in", waarde: "Zeeland; Groningen" }),
    ).toBe("voldoet");
    expect(
      toetsCriterium(profiel, { veld: "provincie", operator: "in", waarde: "Utrecht, Drenthe" }),
    ).toBe("voldoet_niet");
  });

  it("operator '>=' rekent met hectares", () => {
    expect(
      toetsCriterium(profiel, { veld: "hectare_min", operator: ">=", waarde: "50" }),
    ).toBe("voldoet");
    expect(
      toetsCriterium(profiel, { veld: "hectare_min", operator: ">=", waarde: "100" }),
    ).toBe("voldoet_niet");
  });

  it("een nog niet gecontroleerde profielwaarde geeft 'onzeker', geen afwijzing", () => {
    expect(
      toetsCriterium(profiel, { veld: "ligt_op_veengrond", operator: "is", waarde: "ja" }),
    ).toBe("onzeker");
  });

  it("een onvolledig criterium (geen veld of operator) geeft 'onzeker'", () => {
    expect(toetsCriterium(profiel, { veld: null, operator: "is", waarde: "x" })).toBe("onzeker");
    expect(toetsCriterium(profiel, { veld: "provincie", operator: null, waarde: "x" })).toBe("onzeker");
  });

  it("een onbekende operator geeft 'onzeker'", () => {
    expect(
      toetsCriterium(profiel, { veld: "provincie", operator: "lijkt_op", waarde: "Zeeland" }),
    ).toBe("onzeker");
  });
});

describe("profielWaarde", () => {
  it("vertaalt booleans naar ja/nee en null naar onbekend", () => {
    expect(profielWaarde(profiel, "ligt_in_nnn")).toBe("ja");
    expect(profielWaarde(profiel, "ligt_in_natura2000")).toBe("nee");
    expect(profielWaarde(profiel, "ligt_op_veengrond")).toBeNull();
  });

  it("voegt natuurbeheertypes samen tot één doorzoekbare tekst", () => {
    expect(profielWaarde(profiel, "natuurbeheertype")).toContain("N16.03");
  });

  it("geeft null voor een onbekend veld", () => {
    expect(profielWaarde(profiel, "bestaat_niet")).toBeNull();
  });
});

// Hulpje: een criterium met alle velden die scoorRegeling verwacht.
function crit(o: Partial<Parameters<typeof scoorRegeling>[1][number]> = {}) {
  return {
    regeling_id: "r1",
    omschrijving: "criterium",
    veld: null,
    operator: null,
    waarde: null,
    verplicht: true,
    soort: "eis",
    gewicht: 10,
    fase: "vooraf",
    ...o,
  };
}

describe("scoorRegeling — fase", () => {
  it("basisscore is 50 en klimt alleen door vervulde pré's", () => {
    const kaal = scoorRegeling(profiel, []);
    expect(kaal.score).toBe(50);

    const metPre = scoorRegeling(profiel, [
      crit({ soort: "pre", veld: "ligt_in_nnn", operator: "is", waarde: "ja", gewicht: 15 }),
    ]);
    expect(metPre.score).toBe(65);
  });

  it("negeert een criterium dat pas bij de aanvraag of ná toekenning speelt", () => {
    // Een procedurestap is veld-loos en zou als 'onzeker' in de handmatig-lijst
    // belanden. Met fase != 'vooraf' hoort hij helemaal niet mee te doen.
    const oordeel = scoorRegeling(profiel, [
      crit({ omschrijving: "Aanmelding bij RVO binnen 3 maanden", fase: "na_toekenning" }),
      crit({ omschrijving: "Beheerplan indienen", fase: "bij_aanvraag" }),
    ]);
    expect(oordeel.onzeker).toEqual([]);
    expect(oordeel.matcht).toBe(true);
  });

  it("laat een niet-vooraf eis de regeling niet laten afvallen", () => {
    const oordeel = scoorRegeling(profiel, [
      crit({ veld: "provincie", operator: "is", waarde: "Utrecht", fase: "bij_aanvraag" }),
    ]);
    expect(oordeel.matcht).toBe(true);

    // Dezelfde eis als toelatingsvraag laat hem wél afvallen.
    const vooraf = scoorRegeling(profiel, [
      crit({ veld: "provincie", operator: "is", waarde: "Utrecht", fase: "vooraf" }),
    ]);
    expect(vooraf.matcht).toBe(false);
    expect(vooraf.afvalreden).toBe("criterium");
  });

  it("behandelt fase=null als 'vooraf' (rijen van vóór migratie 0030)", () => {
    const oordeel = scoorRegeling(profiel, [
      crit({ veld: "provincie", operator: "is", waarde: "Utrecht", fase: null }),
    ]);
    expect(oordeel.matcht).toBe(false);
  });
});

describe("waardeertNnnPositief", () => {
  it("waar als de regeling NNN-ligging als eis of pré noemt", () => {
    expect(waardeertNnnPositief([{ veld: "ligt_in_nnn", waarde: "ja", soort: "pre" }])).toBe(true);
    expect(waardeertNnnPositief([{ veld: "ligt_in_nnn", waarde: "Ja", soort: "eis" }])).toBe(true);
  });

  it("onwaar bij een regeling die juist BUITEN het NNN geldt", () => {
    // "Bos en Houtige Landschapselementen buiten NNN Zeeland" — hier mag de zin
    // "uw ligging in NNN versterkt uw aanspraken" nooit verschijnen.
    expect(waardeertNnnPositief([{ veld: "ligt_in_nnn", waarde: "nee", soort: "pre" }])).toBe(false);
  });

  it("onwaar als de regeling niets over NNN zegt", () => {
    expect(waardeertNnnPositief([{ veld: "provincie", waarde: "Zeeland", soort: "eis" }])).toBe(false);
    expect(waardeertNnnPositief([])).toBe(false);
  });
});

describe("bepaalNevenreden", () => {
  const regeling = {
    naam: "Subsidie Kleine Landschapselementen (KLE)",
    doelgroep_type: "eigenaar",
    instap_drempel: null as string | null,
    vereist_collectief: false,
    categorie_ui: "natuur" as string | null,
  };
  const stichting = { rechtsvorm: "stichting" };
  const bv = { rechtsvorm: "bv" };

  it("geeft null voor een gewone primaire kans", () => {
    expect(bepaalNevenreden(regeling, stichting, [])).toBeNull();
  });

  it("'dubbel' gaat voor alles — het is de ruis die je als eerste weg wil", () => {
    const r = { ...regeling, doelgroep_type: "pachter", vereist_collectief: true };
    expect(
      bepaalNevenreden({ ...r, naam: "Subsidieverordening Natuur- en Landschapsbeheer Zeeland" }, stichting, [
        "SNL — Natuur- en Landschapsbeheer",
      ]),
    ).toBe("dubbel");
  });

  it("'collectief' gaat vóór 'pachter', want ANLb hoort in de ANLb-bak", () => {
    const anlb = {
      naam: "ANLb Droge Dooradering — Houtwallen, Heggen en Bomenrijen",
      doelgroep_type: "pachter",
      instap_drempel: null,
      vereist_collectief: true,
      categorie_ui: "landbouw",
    };
    expect(bepaalNevenreden(anlb, stichting, [])).toBe("collectief");
  });

  it("een landgoed dat zélf een collectief is wordt niet gedegradeerd", () => {
    const anlb = { ...regeling, vereist_collectief: true };
    expect(bepaalNevenreden(anlb, { rechtsvorm: "collectief" }, [])).toBeNull();
    // ...en hoofdletters/spaties mogen dat niet breken.
    expect(bepaalNevenreden(anlb, { rechtsvorm: " Collectief " }, [])).toBeNull();
  });

  it("herkent pachter-regelingen en te grote regelingen", () => {
    expect(bepaalNevenreden({ ...regeling, doelgroep_type: "pachter" }, stichting, [])).toBe("pachter");
    expect(bepaalNevenreden({ ...regeling, instap_drempel: "hoog" }, stichting, [])).toBe("te_groot");
    // 'laag' en 'middel' degraderen niet.
    expect(bepaalNevenreden({ ...regeling, instap_drempel: "laag" }, stichting, [])).toBeNull();
  });

  it("'organisatie' geldt alleen als het landgoed zelf geen stichting/vereniging is", () => {
    const fonds = { ...regeling, doelgroep_type: "organisatie" };
    expect(bepaalNevenreden(fonds, bv, [])).toBe("organisatie");
    expect(bepaalNevenreden(fonds, stichting, [])).toBeNull();
    // 'te_groot' gaat vóór 'organisatie': een consortium-eis blokkeert harder.
    expect(bepaalNevenreden({ ...fonds, instap_drempel: "hoog" }, bv, [])).toBe("te_groot");
  });

  it("'onbewerkt' is het vangnet voor een nog niet verrijkte regeling", () => {
    const ruw = {
      naam: "Openstellingsbesluit van Gedeputeerde Staten van Zeeland houdende GLB | NSP",
      doelgroep_type: null,
      instap_drempel: null,
      vereist_collectief: false,
      categorie_ui: null,
    };
    expect(bepaalNevenreden(ruw, bv, [])).toBe("onbewerkt");
    // Half verrijkt is verrijkt genoeg: één van de twee volstaat om primair te blijven.
    expect(bepaalNevenreden({ ...ruw, categorie_ui: "landbouw" }, bv, [])).toBeNull();
    // ...en wat we wél weten wint: consortium-gebonden hoort in 'te_groot'.
    expect(bepaalNevenreden({ ...ruw, instap_drempel: "hoog" }, bv, [])).toBe("te_groot");
  });
});
