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

  it("houdt beide onderzoeksronden uit elkaar en heeft geen naamoverlap", () => {
    const perTabblad = new Map<string, string[]>();
    for (const f of fondsen) {
      const t = f.tabblad ?? "(onbekend)";
      perTabblad.set(t, [...(perTabblad.get(t) ?? []), f.naam]);
    }
    expect([...perTabblad.keys()].sort()).toEqual(["Fondsenoverzicht", "Sheet1"]);
    const a = new Set(perTabblad.get("Fondsenoverzicht"));
    const overlap = perTabblad.get("Sheet1")!.filter((n) => a.has(n));
    expect(overlap, `Onverwachte overlap tussen de tabbladen: ${overlap.join(", ")}`).toEqual([]);
  });

  it("gokt aanvrager_type en verdienmodel niet voor het tabblad zonder die kolommen", () => {
    for (const f of fondsen.filter((x) => x.tabblad === "Fondsenoverzicht")) {
      const r = naarRegeling(f);
      expect(r.aanvrager_type).toBe("onbekend");
      expect(r.verdienmodel).toBe("onbekend");
    }
    // Op Sheet1 moet het onderscheid er wél zijn — anders is de mapping stuk en
    // verdwijnt het verschil tussen "vraag aan" en "zoek een partner".
    const sheet1 = fondsen.filter((x) => x.tabblad === "Sheet1").map(naarRegeling);
    expect(sheet1.some((r) => r.aanvrager_type === "derde_partij")).toBe(true);
    expect(sheet1.some((r) => r.verdienmodel === "locatievergoeding")).toBe(true);
  });

  it("bewaart bij elk bewijsstuk de brontekst (§4, niets gegokt)", () => {
    for (const f of fondsen) {
      for (const b of f.bewijs ?? []) {
        expect(b.bron_tekst).toBeTruthy();
      }
    }
  });
});
