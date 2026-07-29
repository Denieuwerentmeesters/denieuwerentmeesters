// Tests voor de matchmotor-kern: het toetsen van criteria tegen het landgoedprofiel.
// Dit is de logica die bepaalt welke subsidieregelingen als kans verschijnen.
import { describe, expect, it } from "vitest";
import {
  profielWaarde,
  toetsCriterium,
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
