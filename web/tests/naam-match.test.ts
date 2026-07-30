// Tests voor de naam-matcher: beslist of twee subsidienamen dezelfde regeling zijn.
// Een stille regressie hier betekent dubbele of gemiste regelingen in de radar.
import { describe, expect, it } from "vitest";
import {
  lijktOpRegeling,
  naamOverlap,
  vindBesteRegelingMatch,
  zijnZelfdeRegeling,
} from "../lib/subsidie/naam-match";

describe("zijnZelfdeRegeling", () => {
  it("herkent dezelfde regeling met kleine naamverschillen", () => {
    expect(
      zijnZelfdeRegeling(
        "SNL — Natuur- en Landschapsbeheer",
        "Subsidie Natuur- en Landschapsbeheer (SNL)",
      ),
    ).toBe(true);
  });

  it("matcht niet op één toevallig gedeeld woord", () => {
    expect(
      zijnZelfdeRegeling(
        "Subsidie instandhouding monumenten",
        "Subsidie kwaliteitsimpuls natuur",
      ),
    ).toBe(false);
  });

  it("eist bij eenwoordsnamen een exacte match", () => {
    expect(zijnZelfdeRegeling("SIM", "SIM")).toBe(true);
    expect(zijnZelfdeRegeling("SIM", "SKNL")).toBe(false);
  });

  it("is niet gevoelig voor hoofdletters en leestekens", () => {
    expect(
      zijnZelfdeRegeling("sknl kwaliteitsimpuls", "SKNL — Kwaliteitsimpuls!"),
    ).toBe(true);
  });

  it("geeft false op lege namen", () => {
    expect(zijnZelfdeRegeling("", "SNL")).toBe(false);
  });
});

describe("naamOverlap", () => {
  it("geeft 1 bij identieke namen en 0 bij geen overlap", () => {
    expect(naamOverlap("kwaliteitsimpuls sknl", "kwaliteitsimpuls sknl")).toBe(1);
    expect(naamOverlap("monumenten onderhoud", "akkerranden beheer")).toBe(0);
  });
});

describe("vindBesteRegelingMatch", () => {
  const catalogus = [
    { naam: "SIM — Instandhouding monumenten" },
    { naam: "SKNL — Kwaliteitsimpuls Natuur en Landschap" },
    { naam: "SNL — Natuur- en Landschapsbeheer" },
  ];

  it("vindt de juiste regeling bij een afwijkende schrijfwijze", () => {
    const match = vindBesteRegelingMatch(
      "Kwaliteitsimpuls natuur en landschap (SKNL)",
      catalogus,
    );
    expect(match?.naam).toBe("SKNL — Kwaliteitsimpuls Natuur en Landschap");
  });

  it("geeft null als niets in de buurt komt", () => {
    expect(vindBesteRegelingMatch("Pachtcheck 2028", catalogus)).toBeNull();
  });
});

describe("lijktOpRegeling", () => {
  it("vlagt de CVDR-variant naast de lopende SNL", () => {
    // Overlap 0.5 op één woord: te weinig om te onderdrukken, genoeg om te melden.
    expect(
      lijktOpRegeling("Subsidieverordening Natuur- en Landschapsbeheer Zeeland", "SNL — Natuur- en Landschapsbeheer"),
    ).toBe(true);
  });

  it("vlagt niet wat al als dezelfde regeling wordt onderdrukt", () => {
    expect(
      lijktOpRegeling("SKNL — Kwaliteitsimpuls Natuur en Landschap", "SKNL Zeeland — Subsidie Kwaliteitsimpuls Natuur en Landschap"),
    ).toBe(false);
  });

  it("vlagt niets bij losstaande regelingen", () => {
    expect(lijktOpRegeling("Subsidie Erfbeplanting Landelijk Gebied", "SDE++ — Stimulering Duurzame Energieproductie")).toBe(false);
    expect(lijktOpRegeling("", "SNL — Natuur- en Landschapsbeheer")).toBe(false);
  });

  it("KENT ZIJN GRENS: acroniemen worden niet herkend", () => {
    // Vermoedelijk dezelfde regeling, maar geen enkel gedeeld woord. Daarom moet de
    // gebruiker een kans ook zelf kunnen wegklikken.
    expect(
      lijktOpRegeling("Subsidieverordening inrichting landelijk gebied Zeeland", "SKNL — Kwaliteitsimpuls Natuur en Landschap"),
    ).toBe(false);
  });
});
