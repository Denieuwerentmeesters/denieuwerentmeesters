// Tests voor de promptopbouw en de hash-logica van het matchprofiel.
//
// Wat hier stuk mag gaan is precies wat later niet meer als fout te herkennen is:
//   * een uitsluiting die niet in de prompt terechtkomt (dan destilleert het
//     model een fonds als passend terwijl het dat niet is);
//   * een hash die niet meebeweegt met de bron (dan blijft een verouderd profiel
//     staan) of juist wél beweegt zonder inhoudelijke wijziging (dan kost elke
//     ronde opnieuw geld over 238 fondsen);
//   * een inkorting die stil gebeurt (dan berust het profiel op een halve bron
//     zonder dat iemand dat ziet).
import { describe, expect, it } from "vitest";
import {
  beleidstekstHash,
  bouwMatchprofielPrompt,
  bronHash,
  kortBeleidsteksten,
  telWoorden,
  MATCHPROFIEL_SYSTEEM,
  type Beleidsdocument,
  type MatchprofielBron,
} from "@/lib/fondsen/matchprofiel";

function doc(extra: Partial<Beleidsdocument> = {}): Beleidsdocument {
  return {
    bron_sleutel: "testfonds",
    bron_url: "https://testfonds.nl",
    tekst: "Wij steunen natuurbehoud op landgoederen.",
    tekst_hash: "a".repeat(64),
    opgehaald_op: "2026-08-05",
    ...extra,
  };
}

function bron(extra: Partial<MatchprofielBron> = {}): MatchprofielBron {
  return {
    regeling_id: "11111111-1111-1111-1111-111111111111",
    naam: "Testfonds",
    organisatie: null,
    samenvatting: "Behoud van landgoederen.",
    benaderbaarheid: "open",
    benaderwijze_notitie: '"U kunt het hele jaar door een aanvraag indienen."',
    aanvrager_type: "landgoedeigenaar",
    geo_niveau: "landelijk",
    geo_waarden: ["Nederland"],
    bedrag_min: 1000,
    bedrag_max: 15000,
    bedrag_indicatie: "tussen EUR 1.000 en EUR 15.000",
    cofinanciering_vereist: true,
    kostensoort: ["restauratie"],
    landgoed_route: "zelf",
    landgoed_route_reden: '"Particuliere eigenaren kunnen aanvragen."',
    landgoed_partnertype: null,
    uitsluitingen: ['"Wij financieren geen regulier onderhoud."'],
    beleidsteksten: [doc()],
    ...extra,
  };
}

describe("bouwMatchprofielPrompt", () => {
  it("zet ALLE uitsluitingen in de prompt, met nadruk", () => {
    const { prompt } = bouwMatchprofielPrompt(
      bron({
        uitsluitingen: [
          "Geen restauratie van monumenten.",
          "Geen exploitatiekosten.",
          "Geen aanvragen van particulieren.",
        ],
      }),
    );
    expect(prompt).toContain("VASTGELEGDE UITSLUITINGEN");
    expect(prompt).toContain("Geen restauratie van monumenten.");
    expect(prompt).toContain("Geen exploitatiekosten.");
    expect(prompt).toContain("Geen aanvragen van particulieren.");
    // Uitsluitingen staan vóór de beleidstekst, zodat ze niet in de staart van
    // een lange prompt verdwijnen.
    expect(prompt.indexOf("VASTGELEGDE UITSLUITINGEN")).toBeLessThan(
      prompt.indexOf("INTEGRALE BELEIDSTEKST"),
    );
  });

  it("zegt expliciet wat te doen als er geen uitsluitingen zijn vastgelegd", () => {
    const { prompt } = bouwMatchprofielPrompt(bron({ uitsluitingen: [] }));
    expect(prompt).toContain("geen uitsluitingen");
  });

  it("neemt de gestructureerde verrijking over maar laat 'onbekend' weg", () => {
    const { prompt } = bouwMatchprofielPrompt(
      bron({ benaderbaarheid: "onbekend", aanvrager_type: "onbekend" }),
    );
    // 'onbekend' is geen kennis (§2): het veld verdwijnt uit de prompt in plaats
    // van als vastgestelde waarde mee te gaan.
    expect(prompt).not.toContain("Type aanvrager");
    expect(prompt).not.toContain("Benaderbaarheid");
    // De velden die wél gevuld zijn blijven staan.
    expect(prompt).toContain("Route voor een landgoed: zelf");
  });

  it("houdt beide kanten van een tegenstrijdigheid in de prompt", () => {
    const { prompt } = bouwMatchprofielPrompt(
      bron({
        bedrag_max: 10000,
        bedrag_indicatie: "site zegt maximaal EUR 15.000, beleidsplan EUR 10.000",
      }),
    );
    expect(prompt).toContain("Bedrag maximaal (EUR): 10000");
    expect(prompt).toContain("EUR 15.000");
    // En de instructie om die spanning te bewaren staat in het systeemdeel.
    expect(MATCHPROFIEL_SYSTEEM).toContain("Tegenstrijdigheden blijven staan");
  });

  it("vertaalt cofinanciering naar ja/nee en laat null weg (drie-waardige logica)", () => {
    expect(bouwMatchprofielPrompt(bron({ cofinanciering_vereist: true })).prompt).toContain(
      "Cofinanciering vereist: ja",
    );
    expect(bouwMatchprofielPrompt(bron({ cofinanciering_vereist: false })).prompt).toContain(
      "Cofinanciering vereist: nee",
    );
    expect(
      bouwMatchprofielPrompt(bron({ cofinanciering_vereist: null })).prompt,
    ).not.toContain("Cofinanciering vereist");
  });

  it("meldt het als er helemaal geen beleidstekst is, in plaats van te gokken", () => {
    const opbouw = bouwMatchprofielPrompt(bron({ beleidsteksten: [] }));
    expect(opbouw.bronTekens).toBe(0);
    expect(opbouw.ingekort).toBe(false);
    expect(opbouw.prompt).toContain("geen integrale beleidstekst");
  });

  it("telt de brontekens die daadwerkelijk in de prompt gaan", () => {
    const tekst = "x".repeat(500);
    const opbouw = bouwMatchprofielPrompt(bron({ beleidsteksten: [doc({ tekst })] }));
    expect(opbouw.bronTekens).toBe(500);
    expect(opbouw.ingekort).toBe(false);
  });
});

describe("kortBeleidsteksten", () => {
  it("laat korte teksten ongemoeid", () => {
    const r = kortBeleidsteksten([doc({ tekst: "kort" })], 1000);
    expect(r.ingekort).toBe(false);
    expect(r.tekens).toBe(4);
  });

  it("kapt af boven de limiet en zegt in de tekst dat er meer kan volgen", () => {
    const r = kortBeleidsteksten([doc({ tekst: "y".repeat(5000) })], 1000);
    expect(r.ingekort).toBe(true);
    expect(r.tekens).toBe(1000);
    // Zonder deze markering zou het model kunnen concluderen dat er verderop
    // geen uitsluitingen meer staan.
    expect(r.blokken[0]).toContain("afgekapt");
  });

  it("verdringt een kort document niet met een lang document", () => {
    const r = kortBeleidsteksten(
      [
        doc({ bron_sleutel: "jaarrekening", tekst: "j".repeat(9000) }),
        doc({ bron_sleutel: "voorwaarden", tekst: "v".repeat(50) }),
      ],
      1000,
    );
    // Het korte document staat er volledig in...
    expect(r.blokken[1]).toContain("v".repeat(50));
    expect(r.blokken[1]).not.toContain("afgekapt");
    // ...en de vrijgekomen ruimte gaat naar het lange.
    expect(r.tekens).toBeLessThanOrEqual(1000);
    expect(r.tekens).toBeGreaterThan(900);
  });
});

describe("bronHash", () => {
  it("is stabiel over dezelfde bron (geen nodeloze tweede ronde)", () => {
    expect(bronHash(bron())).toBe(bronHash(bron()));
  });

  it("verandert wanneer de beleidstekst wijzigt", () => {
    expect(bronHash(bron({ beleidsteksten: [doc({ tekst_hash: "b".repeat(64) })] }))).not.toBe(
      bronHash(bron()),
    );
  });

  it("verandert wanneer er een uitsluiting bij komt", () => {
    expect(
      bronHash(bron({ uitsluitingen: ["Geen onderhoud.", "Geen exploitatie."] })),
    ).not.toBe(bronHash(bron({ uitsluitingen: ["Geen onderhoud."] })));
  });

  it("verandert wanneer een bedrag wordt gecorrigeerd", () => {
    expect(bronHash(bron({ bedrag_max: 10000 }))).not.toBe(bronHash(bron()));
  });

  it("verandert NIET door een andere volgorde van uitsluitingen of documenten", () => {
    const a = bron({
      uitsluitingen: ["Geen onderhoud.", "Geen exploitatie."],
      beleidsteksten: [doc({ bron_sleutel: "a" }), doc({ bron_sleutel: "b" })],
    });
    const b = bron({
      uitsluitingen: ["Geen exploitatie.", "Geen onderhoud."],
      beleidsteksten: [doc({ bron_sleutel: "b" }), doc({ bron_sleutel: "a" })],
    });
    expect(bronHash(a)).toBe(bronHash(b));
  });

  it("verandert niet door het regeling_id (dat hoort niet bij de inhoud)", () => {
    expect(bronHash(bron({ regeling_id: "22222222-2222-2222-2222-222222222222" }))).toBe(
      bronHash(bron()),
    );
  });
});

describe("beleidstekstHash", () => {
  it("is een sha256 en onafhankelijk van de documentvolgorde", () => {
    const een = beleidstekstHash([doc({ bron_sleutel: "a" }), doc({ bron_sleutel: "b" })]);
    const twee = beleidstekstHash([doc({ bron_sleutel: "b" }), doc({ bron_sleutel: "a" })]);
    expect(een).toMatch(/^[0-9a-f]{64}$/);
    expect(een).toBe(twee);
  });

  it("verandert wanneer een document wordt vervangen", () => {
    expect(beleidstekstHash([doc({ tekst_hash: "c".repeat(64) })])).not.toBe(
      beleidstekstHash([doc()]),
    );
  });
});

describe("telWoorden", () => {
  it("telt woorden en negeert dubbele witruimte", () => {
    expect(telWoorden("  een  twee\n\ndrie ")).toBe(3);
    expect(telWoorden("   ")).toBe(0);
  });
});
