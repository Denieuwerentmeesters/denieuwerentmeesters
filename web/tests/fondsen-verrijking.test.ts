// Tests voor de leeslaag van de verrijkingsslag en voor de matchbaarheids-
// formule. Wat hier stuk mag gaan is precies wat in de database niet meer als
// fout te herkennen zou zijn: een enumwaarde die stilletjes doorglipt, een
// poortwaarde zonder citaat, een route zonder onderbouwing.
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  berekenMatchbaarheid,
  leesVerrijkingen,
  naamSleutel,
  ophaaldatum,
  telKernvelden,
  valideerVerrijking,
  verrijkingsMap,
  VerrijkingFout,
} from "@/lib/fondsen/verrijking";

const MD = "# Fonds X\n\nOphaaldatum: 2026-08-05\n\nBeleidstekst.\n";

function geldig(extra: Record<string, unknown> = {}) {
  return {
    naam: "Testfonds",
    bronnen: [{ soort: "website", url: "https://x.nl", jaar: 2026, gelezen: true }],
    doelstelling: "Behoud van landgoederen.",
    benaderbaarheid: "open",
    benaderwijze_notitie: "\"U kunt het hele jaar door een aanvraag indienen.\"",
    aanvrager_type: "landgoedeigenaar",
    geo_niveau: "landelijk",
    geo_waarden: ["Nederland"],
    bedrag_min: 1000,
    bedrag_max: 15000,
    bedrag_indicatie: "tussen €1.000 en €15.000",
    cofinanciering_vereist: true,
    uitsluitingen: ["\"Wij financieren geen regulier onderhoud.\""],
    kostensoort: ["restauratie"],
    landgoed_relevantie: {
      route: "zelf",
      onderbouwing: "\"Particuliere eigenaren van monumenten kunnen aanvragen.\"",
      partnertype: null,
    },
    onderliggende_fondsen: [],
    niet_gevonden: [],
    ...extra,
  };
}

const lees = (obj: unknown) => valideerVerrijking(obj, "testfonds", MD);

describe("valideerVerrijking", () => {
  it("leest een geldig bestand en hasht de beleidstekst", () => {
    const v = lees(geldig());
    expect(v.naam).toBe("Testfonds");
    expect(v.landgoed_route).toBe("zelf");
    expect(v.beleidstekst_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(v.beleidstekst_opgehaald_op).toBe("2026-08-05");
  });

  it("weigert een onbekende enumwaarde in plaats van 'm te negeren", () => {
    expect(() => lees(geldig({ benaderbaarheid: "misschien" }))).toThrow(VerrijkingFout);
    expect(() => lees(geldig({ aanvrager_type: "iemand" }))).toThrow(/aanvrager_type/);
    expect(() => lees(geldig({ geo_niveau: "werelddeel" }))).toThrow(/geo_niveau/);
    expect(() => lees(geldig({ kostensoort: ["kantoorhuur"] }))).toThrow(/kostensoort/);
    expect(() =>
      lees(geldig({ bronnen: [{ soort: "blogpost", url: "x", jaar: null, gelezen: true }] })),
    ).toThrow(/bronnen\[0\]\.soort/);
  });

  it("eist een citaat bij een benaderbaarheid die niet 'onbekend' is", () => {
    expect(() => lees(geldig({ benaderwijze_notitie: null }))).toThrow(
      /benaderwijze_notitie/,
    );
    // 'onbekend' mag zonder citaat — dat is een eerlijk leeg antwoord.
    expect(
      lees(geldig({ benaderbaarheid: "onbekend", benaderwijze_notitie: null }))
        .benaderbaarheid,
    ).toBe("onbekend");
  });

  it("eist onderbouwing bij een route, en partnertype bij via_partner", () => {
    expect(() =>
      lees(geldig({ landgoed_relevantie: { route: "niet_relevant" } })),
    ).toThrow(/onderbouwing/);
    expect(() =>
      lees(
        geldig({
          landgoed_relevantie: { route: "via_partner", onderbouwing: "\"citaat\"" },
        }),
      ),
    ).toThrow(/partnertype/);
    expect(
      lees(geldig({ landgoed_relevantie: { route: "onbekend" } })).landgoed_route,
    ).toBe("onbekend");
  });

  it("verzint geen bedragen en weigert een omgekeerde band", () => {
    expect(() => lees(geldig({ bedrag_min: 20000, bedrag_max: 1000 }))).toThrow(
      /bedrag_min/,
    );
    const v = lees(geldig({ bedrag_min: null, bedrag_max: null, bedrag_indicatie: null }));
    expect(v.bedrag_min).toBeNull();
    expect(v.bedrag_indicatie).toBeNull();
  });

  it("houdt cofinanciering drie-waardig: true/false/null, nooit een string", () => {
    expect(lees(geldig({ cofinanciering_vereist: null })).cofinanciering_vereist).toBeNull();
    expect(() => lees(geldig({ cofinanciering_vereist: "ja" }))).toThrow(
      /cofinanciering_vereist/,
    );
  });

  it("eist minstens één bron", () => {
    expect(() => lees(geldig({ bronnen: [] }))).toThrow(/bronnen/);
  });

  it("weigert een leeg element in een tekstlijst", () => {
    expect(() => lees(geldig({ uitsluitingen: ["", "iets"] }))).toThrow(
      /uitsluitingen\[0\]/,
    );
  });
});

describe("leesVerrijkingen", () => {
  it("slaat een .json zonder .md over als onvolledig in plaats van te falen", () => {
    // De verrijkingsmap wordt door parallelle agents gevuld; een half paar is
    // een race, geen datafout.
    const map = mkdtempSync(join(tmpdir(), "verrijking-"));
    writeFileSync(join(map, "af.json"), JSON.stringify(geldig()));
    writeFileSync(join(map, "af.md"), MD);
    writeFileSync(join(map, "half.json"), JSON.stringify(geldig({ naam: "Half" })));
    const lezing = leesVerrijkingen(map);
    expect(lezing.fondsen.map((f) => f.slug)).toEqual(["af"]);
    expect(lezing.onvolledig).toEqual([{ slug: "half", reden: "half.md ontbreekt nog" }]);
  });

  it("gooit met bestandsnaam erbij als een bestand ongeldig is", () => {
    const map = mkdtempSync(join(tmpdir(), "verrijking-"));
    writeFileSync(join(map, "stuk.json"), JSON.stringify(geldig({ benaderbaarheid: "x" })));
    writeFileSync(join(map, "stuk.md"), MD);
    expect(() => leesVerrijkingen(map)).toThrow(/stuk\.json/);
  });

  it("leest de echte verrijkingsmap zonder fouten", () => {
    // Geen vast aantal: de map groeit terwijl de agents doorwerken.
    const lezing = leesVerrijkingen(verrijkingsMap());
    expect(lezing.fondsen.length).toBeGreaterThan(0);
    for (const f of lezing.fondsen) {
      expect(f.beleidstekst.length).toBeGreaterThan(0);
    }
  });

  it("meldt netjes als de map niet bestaat", () => {
    const map = join(mkdtempSync(join(tmpdir(), "verrijking-")), "bestaat-niet");
    expect(() => leesVerrijkingen(map)).toThrow(/Verrijkingsmap niet gevonden/);
    mkdirSync(map);
    expect(leesVerrijkingen(map).fondsen).toEqual([]);
  });
});

describe("naamSleutel", () => {
  it("matcht de naam van het fonds op de naam uit de catalogus", () => {
    expect(naamSleutel("Stichting Ars Donandi (koepelstichting fondsen op naam)")).toBe(
      naamSleutel("Ars Donandi (koepelstichting fondsen op naam)"),
    );
    expect(naamSleutel("Pfältzer-Birnie Fonds (Cultuurfonds)")).toBe(
      naamSleutel("Pfaltzer-Birnie Fonds"),
    );
    expect(naamSleutel("Stichting Fonds 1819")).toBe(naamSleutel("Fonds 1819"));
  });

  it("gooit twee verschillende fondsen niet op één hoop", () => {
    expect(naamSleutel("Fonds 1818")).not.toBe(naamSleutel("Fonds 1819"));
    expect(naamSleutel("Turing Foundation")).not.toBe(naamSleutel("ANWB Fonds"));
  });
});

describe("ophaaldatum", () => {
  it("leest de datum uit de kop, en geeft null als die er niet staat", () => {
    expect(ophaaldatum("Bronnen (opgehaald 2026-08-05)\n")).toBe("2026-08-05");
    expect(ophaaldatum("# Fonds\n\nGeen datum hier.\n")).toBeNull();
  });
});

describe("berekenMatchbaarheid", () => {
  it("geeft een fonds met alleen een sector-tag een lage score", () => {
    expect(
      berekenMatchbaarheid({ herkomst: "afgeleid_tag", bronnen: [], kernveldenGevuld: 0 }),
    ).toBe(10);
  });

  it("geeft een volledig verrijkt fonds 100", () => {
    expect(
      berekenMatchbaarheid({
        herkomst: "geverifieerd_bron",
        bronnen: [
          { soort: "beleidsplan", gelezen: true },
          { soort: "aanvraagvoorwaarden", gelezen: true },
          { soort: "website", gelezen: true },
        ],
        kernveldenGevuld: 8,
      }),
    ).toBe(100);
  });

  it("telt niet-gelezen bronnen niet mee", () => {
    const basis = { herkomst: "geverifieerd_bron", kernveldenGevuld: 0 };
    expect(berekenMatchbaarheid({ ...basis, bronnen: [{ soort: "beleidsplan", gelezen: false }] }))
      .toBe(40);
    expect(berekenMatchbaarheid({ ...basis, bronnen: [{ soort: "beleidsplan", gelezen: true }] }))
      .toBe(55);
  });

  it("waardeert een beleidsplan hoger dan een website", () => {
    const website = berekenMatchbaarheid({
      herkomst: "geverifieerd_bron",
      bronnen: [{ soort: "website", gelezen: true }],
      kernveldenGevuld: 0,
    });
    const beleidsplan = berekenMatchbaarheid({
      herkomst: "geverifieerd_bron",
      bronnen: [{ soort: "beleidsplan", gelezen: true }],
      kernveldenGevuld: 0,
    });
    expect(beleidsplan).toBeGreaterThan(website);
  });

  it("blijft binnen 0-100 en is monotoon in het aantal kernvelden", () => {
    let vorige = -1;
    for (let n = 0; n <= 8; n++) {
      const score = berekenMatchbaarheid({
        herkomst: "geverifieerd_bron",
        bronnen: [
          { soort: "beleidsplan", gelezen: true },
          { soort: "website", gelezen: true },
          { soort: "jaarverslag", gelezen: true },
          { soort: "statuten", gelezen: true },
        ],
        kernveldenGevuld: n,
      });
      expect(score).toBeGreaterThanOrEqual(vorige);
      expect(score).toBeLessThanOrEqual(100);
      vorige = score;
    }
  });

  it("kent een onbekende herkomst geen punten toe (geen stille bonus)", () => {
    expect(
      berekenMatchbaarheid({ herkomst: "verzonnen", bronnen: [], kernveldenGevuld: 0 }),
    ).toBe(0);
  });
});

describe("telKernvelden", () => {
  it("telt 'onbekend', null en de lege lijst niet als kennis", () => {
    expect(
      telKernvelden({
        benaderbaarheid: "onbekend",
        aanvrager_type: "onbekend",
        geo_niveau: null,
        bedrag_min: null,
        bedrag_max: null,
        bedrag_indicatie: null,
        cofinanciering_vereist: null,
        kostensoort: [],
        uitsluitingen_aantal: 0,
        landgoed_route: "onbekend",
      }),
    ).toBe(0);
  });

  it("telt alle acht als ze gevuld zijn", () => {
    expect(
      telKernvelden({
        benaderbaarheid: "open",
        aanvrager_type: "beide",
        geo_niveau: "landelijk",
        bedrag_indicatie: "max €10.000",
        cofinanciering_vereist: false,
        kostensoort: ["restauratie"],
        uitsluitingen_aantal: 3,
        landgoed_route: "via_partner",
      }),
    ).toBe(8);
  });

  it("telt cofinanciering=false wél mee (false is kennis, null niet)", () => {
    expect(telKernvelden({ cofinanciering_vereist: false })).toBe(1);
    expect(telKernvelden({ cofinanciering_vereist: null })).toBe(0);
  });
});
