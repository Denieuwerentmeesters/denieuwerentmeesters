// Tests voor de documentvereisten-destillatie (regeling_beleidstekst ->
// regeling_bewijs).
//
// Wat hier stuk mag gaan is precies wat later niet meer als fout te herkennen is:
//   * een rij die zonder letterlijk citaat toch wordt aangemaakt (dan destilleert
//     het systeem een vereiste die het fonds nooit heeft gesteld);
//   * een hash die niet meebeweegt met de bron (dan blijft een verouderde
//     vereistenlijst staan) of juist wél beweegt zonder inhoudelijke wijziging
//     (dan kost elke ronde opnieuw geld over alle fondsen);
//   * een eigen kopie van de "wat maken wij zelf op"-mapping die uit de pas gaat
//     lopen met dossier.ts, waar de detailpagina dezelfde vraag beantwoordt.
import { describe, expect, it } from "vitest";
import {
  citaatKomtUitBron,
  filterOpLetterlijkCitaat,
  naarRijen,
  parseVereisten,
  vereistenHash,
  ZELF_OP_TE_STELLEN_VASTE_TYPEN,
  type GedestilleerdeVereiste,
  type VereistenBron,
} from "@/lib/fondsen/vereisten";
import { CATEGORIE_PER_VEREISTE, GENEREERBARE_TYPEN, EXTERN_VAN_NATURE } from "@/lib/fondsen/dossier";
import type { Beleidsdocument } from "@/lib/fondsen/matchprofiel";

function doc(extra: Partial<Beleidsdocument> = {}): Beleidsdocument {
  return {
    bron_sleutel: "testfonds",
    bron_url: "https://testfonds.nl",
    tekst:
      "De aanvraag bevat: een projectplan, een gespecificeerde kostenbegroting en, " +
      "als aanvrager een rechtspersoon is, een uittreksel KvK niet ouder dan 1 jaar.",
    tekst_hash: "a".repeat(64),
    opgehaald_op: "2026-08-05",
    ...extra,
  };
}

function bron(extra: Partial<VereistenBron> = {}): VereistenBron {
  return {
    regeling_id: "11111111-1111-1111-1111-111111111111",
    naam: "Testfonds",
    beleidsteksten: [doc()],
    ...extra,
  };
}

function vereiste(extra: Partial<GedestilleerdeVereiste> = {}): GedestilleerdeVereiste {
  return {
    omschrijving: "Projectplan",
    vereiste_type: "projectplan",
    fase: "bij_aanvraag",
    verplichtheid: "verplicht",
    citaat: "een projectplan",
    ...extra,
  };
}

describe("citaatKomtUitBron / filterOpLetterlijkCitaat — de harde 'geen rij zonder citaat'-regel", () => {
  it("accepteert een citaat dat letterlijk in de bron staat", () => {
    expect(citaatKomtUitBron("een projectplan", doc().tekst)).toBe(true);
  });

  it("verwerpt een citaat dat er niet letterlijk staat, ook als het plausibel klinkt", () => {
    expect(citaatKomtUitBron("een taxatierapport van een beëdigd taxateur", doc().tekst)).toBe(
      false,
    );
  });

  it("verwerpt een geparafraseerd citaat (andere woorden dan de bron)", () => {
    // De bron zegt "een projectplan"; dit is een parafrase, geen citaat.
    expect(citaatKomtUitBron("een uitgebreide projectbeschrijving", doc().tekst)).toBe(false);
  });

  it("is tolerant voor witruimteverschillen, niet voor woordverschillen", () => {
    const ruweBron = "De aanvraag bevat:\n  een   projectplan\nen een begroting.";
    expect(citaatKomtUitBron("een projectplan", ruweBron)).toBe(true);
  });

  it("verwerpt een leeg of triviaal kort 'citaat'", () => {
    expect(citaatKomtUitBron("", doc().tekst)).toBe(false);
    expect(citaatKomtUitBron("plan", doc().tekst)).toBe(false);
  });

  it("filterOpLetterlijkCitaat laat alleen vereisten met een bruikbaar citaat staan", () => {
    const vereisten = [
      vereiste({ citaat: "een projectplan" }),
      vereiste({ omschrijving: "Verzonnen taxatie", citaat: "een verzonnen taxatierapport" }),
      vereiste({ omschrijving: "Begroting", citaat: "gespecificeerde kostenbegroting" }),
    ];
    const overgebleven = filterOpLetterlijkCitaat(vereisten, [doc()]);
    expect(overgebleven.map((v) => v.omschrijving)).toEqual(["Projectplan", "Begroting"]);
  });

  it("controleert tegen de RUWE bron, niet tegen wat het model zelf beweert", () => {
    // Een citaat dat nergens in de brondocumenten voorkomt, ook niet met een
    // andere schrijfwijze, hoort onherroepelijk te sneuvelen.
    const vereisten = [vereiste({ citaat: "iets wat het fonds nooit gezegd heeft" })];
    expect(filterOpLetterlijkCitaat(vereisten, [doc()])).toHaveLength(0);
  });
});

describe("parseVereisten", () => {
  it("parseert een geldige JSON-array", () => {
    const tekst = JSON.stringify([
      {
        omschrijving: "Projectplan",
        vereiste_type: "projectplan",
        fase: "bij_aanvraag",
        verplichtheid: "verplicht",
        citaat: "een projectplan",
      },
    ]);
    const resultaat = parseVereisten(tekst);
    expect(resultaat).toHaveLength(1);
    expect(resultaat[0].omschrijving).toBe("Projectplan");
  });

  it("levert een lege lijst bij [] (eerlijk antwoord, geen fout)", () => {
    expect(parseVereisten("[]")).toEqual([]);
  });

  it("levert een lege lijst bij onbruikbare tekst", () => {
    expect(parseVereisten("dit is geen JSON")).toEqual([]);
    expect(parseVereisten(null)).toEqual([]);
  });

  it("valt terug op 'overig' bij een onbekend vereiste_type in plaats van te falen", () => {
    const tekst = JSON.stringify([
      {
        omschrijving: "Iets vreemds",
        vereiste_type: "onbestaand_type",
        fase: "bij_aanvraag",
        verplichtheid: "verplicht",
        citaat: "een lang genoeg citaat uit de bron",
      },
    ]);
    expect(parseVereisten(tekst)[0].vereiste_type).toBe("overig");
  });

  it("laat een object zonder omschrijving of te kort citaat vallen", () => {
    const tekst = JSON.stringify([
      { omschrijving: "", vereiste_type: "projectplan", fase: "vooraf", verplichtheid: "verplicht", citaat: "een projectplan" },
      { omschrijving: "Iets", vereiste_type: "projectplan", fase: "vooraf", verplichtheid: "verplicht", citaat: "kort" },
    ]);
    expect(parseVereisten(tekst)).toEqual([]);
  });
});

describe("vereistenHash", () => {
  it("is stabiel over dezelfde bron", () => {
    expect(vereistenHash(bron())).toBe(vereistenHash(bron()));
  });

  it("verandert wanneer de beleidstekst wijzigt", () => {
    expect(
      vereistenHash(bron({ beleidsteksten: [doc({ tekst_hash: "b".repeat(64) })] })),
    ).not.toBe(vereistenHash(bron()));
  });

  it("verandert NIET door een andere volgorde van documenten", () => {
    const a = bron({
      beleidsteksten: [doc({ bron_sleutel: "a" }), doc({ bron_sleutel: "b" })],
    });
    const b = bron({
      beleidsteksten: [doc({ bron_sleutel: "b" }), doc({ bron_sleutel: "a" })],
    });
    expect(vereistenHash(a)).toBe(vereistenHash(b));
  });

  it("verandert niet door het regeling_id (dat hoort niet bij de inhoud)", () => {
    expect(vereistenHash(bron({ regeling_id: "22222222-2222-2222-2222-222222222222" }))).toBe(
      vereistenHash(bron()),
    );
  });

  it("verandert niet door de naam van het fonds (die gaat niet in de hash)", () => {
    expect(vereistenHash(bron({ naam: "Ander Fonds" }))).toBe(vereistenHash(bron()));
  });
});

describe("ZELF_OP_TE_STELLEN_VASTE_TYPEN — hergebruik van dossier.ts, geen dubbele lijst", () => {
  it("zet elk type uit GENEREERBARE_TYPEN op true", () => {
    for (const type of GENEREERBARE_TYPEN) {
      expect(ZELF_OP_TE_STELLEN_VASTE_TYPEN[type as keyof typeof ZELF_OP_TE_STELLEN_VASTE_TYPEN]).toBe(
        true,
      );
    }
  });

  it("zet elk type uit EXTERN_VAN_NATURE op false", () => {
    for (const type of EXTERN_VAN_NATURE) {
      expect(ZELF_OP_TE_STELLEN_VASTE_TYPEN[type as keyof typeof ZELF_OP_TE_STELLEN_VASTE_TYPEN]).toBe(
        false,
      );
    }
  });

  it("laat een type dat in geen van beide lijsten staat op null (geen gok)", () => {
    expect(ZELF_OP_TE_STELLEN_VASTE_TYPEN.overig).toBeNull();
  });
});

describe("naarRijen", () => {
  it("leidt document_categorie af via de GEÏMPORTEERDE CATEGORIE_PER_VEREISTE, niet via een eigen kopie", () => {
    const rijen = naarRijen("regeling-1", [
      vereiste({ vereiste_type: "kvk_uittreksel", citaat: "uittreksel KvK niet ouder dan 1 jaar" }),
    ]);
    expect(rijen[0].document_categorie).toBe(CATEGORIE_PER_VEREISTE.kvk_uittreksel);
    expect(rijen[0].document_categorie).toBe("governance");
  });

  it("zet herkomst op ai_voorstel en geaccordeerd op false, altijd", () => {
    const [rij] = naarRijen("regeling-1", [vereiste()]);
    expect(rij.herkomst).toBe("ai_voorstel");
    expect(rij.geaccordeerd).toBe(false);
  });

  it("zet bron_tekst gelijk aan het citaat (het letterlijke fragment)", () => {
    const [rij] = naarRijen("regeling-1", [vereiste({ citaat: "een projectplan" })]);
    expect(rij.bron_tekst).toBe("een projectplan");
  });

  it("een type zonder vastgestelde regel (bv. 'overig') levert null op, geen gok", () => {
    const [rij] = naarRijen("regeling-1", [
      vereiste({ vereiste_type: "overig", citaat: "iets wat niet goed te typeren was" }),
    ]);
    expect(rij.zelf_op_te_stellen).toBeNull();
    expect(rij.document_categorie).toBeNull();
  });
});
