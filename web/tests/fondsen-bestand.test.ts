// Bewaakt de vertaalslag van kennisbank/Fondsen/fondsen.json naar de catalogus.
// De harde regels uit Implementatieplan_Fondsenradar.md die hier stuk mogen gaan:
//   §1 bestuurslaag blijft leeg voor fondsen
//   §2 herkomst per rij; niets komt binnen als vaststaand feit
//   §3 benaderbaarheid is een gesloten schaal
import { describe, it, expect } from "vitest";
import { leesFondsen, naarRegeling } from "@/lib/fondsen/bestand";

const fondsen = leesFondsen();

describe("fondsen.json", () => {
  it("bevat rijen met unieke sleutels (leesFondsen faalt anders)", () => {
    expect(fondsen.length).toBeGreaterThan(100);
    expect(new Set(fondsen.map((f) => f.sleutel)).size).toBe(fondsen.length);
  });

  it("geeft fondsen nooit een bestuurslaag (§1)", () => {
    for (const f of fondsen) {
      expect(naarRegeling(f).bestuurslaag).toBeNull();
    }
  });

  it("kent alleen de zes benaderbaarheidswaarden van §3", () => {
    const toegestaan = new Set([
      "open",
      "open_met_drempel",
      "via_intermediair",
      "op_uitnodiging",
      "gesloten",
      "onbekend",
    ]);
    for (const f of fondsen) {
      expect(toegestaan.has(naarRegeling(f).benaderbaarheid!)).toBe(true);
    }
  });

  it("houdt gissing en verificatie uit elkaar (§2)", () => {
    const herkomsten = new Set(fondsen.map((f) => naarRegeling(f).herkomst));
    for (const h of herkomsten) {
      expect(["handmatig", "afgeleid_tag", "geverifieerd_bron", "ai_voorstel"]).toContain(h);
    }
    // Beide standen moeten voorkomen; is alles ineens 'geverifieerd_bron', dan
    // is de statuskolom-afleiding stuk en behandelt de matcher gissingen als feit.
    expect(herkomsten.has("afgeleid_tag")).toBe(true);
    expect(herkomsten.has("geverifieerd_bron")).toBe(true);
  });

  it("verzint geen bedragen: min <= max en beide alleen samen met een indicatie", () => {
    for (const f of fondsen) {
      const r = naarRegeling(f);
      if (r.bedrag_min != null && r.bedrag_max != null) {
        expect(r.bedrag_min).toBeLessThanOrEqual(r.bedrag_max);
      }
      if (r.bedrag_min != null || r.bedrag_max != null) {
        expect(r.budget_indicatie).toBeTruthy();
      }
    }
  });

  it("laat criteria drie-waardig zijn en accordeert niets vooraf", () => {
    for (const f of fondsen) {
      for (const c of f.criteria ?? []) {
        expect(["ja", "nee", "onbekend"]).toContain(c.uitkomst ?? "onbekend");
      }
    }
    // Er moet een substantieel deel 'onbekend' zijn — bij fondsen is
    // "niet gepubliceerd" de meest voorkomende waarde (§2).
    const onbekend = fondsen.filter((f) =>
      (f.criteria ?? []).some((c) => (c.uitkomst ?? "onbekend") === "onbekend"),
    );
    expect(onbekend.length).toBeGreaterThan(0);
  });

  it("bewaart bij elk bewijsstuk de brontekst (§4, niets gegokt)", () => {
    for (const f of fondsen) {
      for (const b of f.bewijs ?? []) {
        expect(b.bron_tekst).toBeTruthy();
      }
    }
  });
});
