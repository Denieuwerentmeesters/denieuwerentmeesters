import { describe, expect, it } from "vitest";
import {
  afloopTekst,
  beoordeelAfloop,
  verlengtermijnDagen,
} from "@/lib/contracten/afloop";

describe("verlengtermijnDagen", () => {
  it("kortlopend contract (< 3 jaar): half jaar van tevoren", () => {
    expect(verlengtermijnDagen("2026-05-01", "2028-04-30")).toBe(182);
  });
  it("langlopend contract: een jaar van tevoren", () => {
    expect(verlengtermijnDagen("2020-01-01", "2032-01-01")).toBe(365);
  });
  it("onbekende ingangsdatum telt als langlopend", () => {
    expect(verlengtermijnDagen(null, "2030-01-01")).toBe(365);
  });
});

describe("beoordeelAfloop", () => {
  it("geen einddatum → geen oordeel", () => {
    expect(beoordeelAfloop("2026-08-08", "2026-01-01", null)).toBeNull();
  });
  it("verstreken einddatum → verlopen", () => {
    expect(beoordeelAfloop("2026-08-08", null, "2026-08-01")?.oordeel).toBe("verlopen");
  });
  it("kort contract binnen half jaar → aandacht, daarbuiten rustig", () => {
    // looptijd 2 jaar, einde 2028-04-30
    expect(beoordeelAfloop("2028-01-01", "2026-05-01", "2028-04-30")?.oordeel).toBe(
      "aandacht",
    );
    expect(beoordeelAfloop("2026-09-01", "2026-05-01", "2028-04-30")?.oordeel).toBe(
      "rustig",
    );
  });
  it("lang contract al een jaar van tevoren aandacht", () => {
    expect(beoordeelAfloop("2031-06-01", "2020-01-01", "2032-01-01")?.oordeel).toBe(
      "aandacht",
    );
  });
});

describe("afloopTekst", () => {
  it("dichtbij in dagen, verder weg in maanden", () => {
    expect(afloopTekst(12)).toBe("over 12 dagen");
    expect(afloopTekst(200)).toBe("over 7 maanden");
    expect(afloopTekst(-3)).toBe("verlopen");
  });
});
