import { describe, expect, it } from "vitest";
import { normaliseerContactNaam } from "@/lib/contacten/namen";

// De aanleiding uit de praktijk: "Mts Dreessen" en "Maatschap Dreessen"
// kwamen als twee AI-contacten binnen uit twee documenten.

describe("normaliseerContactNaam", () => {
  it("herkent afkortingen als dezelfde naam", () => {
    expect(normaliseerContactNaam("Mts. Dreessen")).toBe(
      normaliseerContactNaam("Maatschap Dreessen"),
    );
    expect(normaliseerContactNaam("Fa. Jansen & Zn.")).toBe(
      normaliseerContactNaam("Firma Jansen Zonen"),
    );
    expect(normaliseerContactNaam("St. Het Groene Erf")).toBe(
      normaliseerContactNaam("Stichting Het Groene Erf"),
    );
  });

  it("negeert leestekens, koppeltekens en hoofdletters", () => {
    expect(normaliseerContactNaam("Lynden-Ter Hooge Stichting")).toBe(
      normaliseerContactNaam("lynden ter hooge stichting"),
    );
  });

  it("voegt losse letters samen (b.v. wordt bv)", () => {
    expect(normaliseerContactNaam("Dreessen B.V.")).toBe(
      normaliseerContactNaam("Dreessen BV"),
    );
    expect(normaliseerContactNaam("Jansen V.O.F.")).toBe(
      normaliseerContactNaam("Jansen VOF"),
    );
  });

  it("laat verschillende namen ook echt verschillend", () => {
    expect(normaliseerContactNaam("Maatschap Dreessen")).not.toBe(
      normaliseerContactNaam("Maatschap Driessen"),
    );
    expect(normaliseerContactNaam("Jansen BV")).not.toBe(
      normaliseerContactNaam("Jansen VOF"),
    );
  });
});
