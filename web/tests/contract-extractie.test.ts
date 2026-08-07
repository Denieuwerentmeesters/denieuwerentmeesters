import { describe, expect, it } from "vitest";
import {
  maakContentBlokken,
  normaliseerAanduiding,
  valideerContractVoorstel,
} from "@/lib/contracten/extractie";
import { bepaalBestandsSoort } from "@/lib/contracten/bestanden";

// De validatie is de grens tussen AI-uitvoer en het dossier: alles wat
// buiten de eigen lijsten valt moet null/leeg worden, nooit doorsijpelen.

describe("valideerContractVoorstel", () => {
  it("neemt geldige velden over (het Dreessen-voorbeeld)", () => {
    const v = valideerContractVoorstel({
      titel: "Pacht bouwland Kriekeweg (Mts. Dreessen)",
      contractnummer: "20108",
      type: "pacht",
      pachtvorm: "geliberaliseerde_pacht",
      looptijd_type: "bepaald",
      ingangsdatum: "2026-05-01",
      einddatum: "2028-12-31",
      bedrag_per_jaar: 1,
      partijen: [
        { naam: "Lynden-Ter Hooge Stichting", rol: "verpachter" },
        { naam: "Maatschap Dreessen", rol: "pachter" },
      ],
      kadastrale_aanduidingen: ["Valkenisse K 2226"],
      onzekerheden: null,
    });
    expect(v.contractnummer).toBe("20108");
    expect(v.pachtvorm).toBe("geliberaliseerde_pacht");
    expect(v.ingangsdatum).toBe("2026-05-01");
    expect(v.bedrag_per_jaar).toBe(1);
    expect(v.partijen).toHaveLength(2);
    expect(v.kadastrale_aanduidingen).toEqual(["Valkenisse K 2226"]);
  });

  it("maakt waarden buiten de lijsten null in plaats van ze door te laten", () => {
    const v = valideerContractVoorstel({
      type: "koopcontract",
      pachtvorm: "erfpacht",
      looptijd_type: "eeuwigdurend",
      ingangsdatum: "1 mei 2026",
      bedrag_per_jaar: "veel",
    });
    expect(v.type).toBeNull();
    expect(v.pachtvorm).toBeNull();
    expect(v.looptijd_type).toBeNull();
    expect(v.ingangsdatum).toBeNull();
    expect(v.bedrag_per_jaar).toBeNull();
  });

  it("valt bij een onbekende partijrol terug op 'partij' en gooit lege namen weg", () => {
    const v = valideerContractVoorstel({
      partijen: [
        { naam: "Jan", rol: "notaris" },
        { naam: "  ", rol: "pachter" },
      ],
    });
    expect(v.partijen).toEqual([{ naam: "Jan", rol: "partij" }]);
  });

  it("laat een negatief bedrag niet door", () => {
    expect(valideerContractVoorstel({ bedrag_per_jaar: -500 }).bedrag_per_jaar).toBeNull();
  });
});

describe("normaliseerAanduiding", () => {
  it("maakt hoofdletters en dubbele spaties gelijk", () => {
    expect(normaliseerAanduiding("VALKENISSE  K  2226")).toBe(
      normaliseerAanduiding("Valkenisse K 2226"),
    );
  });
});

describe("bepaalBestandsSoort", () => {
  it("herkent de soorten op mime-type", () => {
    expect(bepaalBestandsSoort("application/pdf", "x")).toBe("pdf");
    expect(bepaalBestandsSoort("image/jpeg", "x")).toBe("afbeelding");
    expect(
      bepaalBestandsSoort(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "x",
      ),
    ).toBe("docx");
    expect(bepaalBestandsSoort("image/heic", "x")).toBe("heic");
  });

  it("valt terug op de bestandsnaam als het mime-type leeg is", () => {
    expect(bepaalBestandsSoort("", "contract.PDF")).toBe("pdf");
    expect(bepaalBestandsSoort("", "scan pagina 2.jpeg")).toBe("afbeelding");
    expect(bepaalBestandsSoort("", "concept.docx")).toBe("docx");
    expect(bepaalBestandsSoort("", "IMG_0123.HEIC")).toBe("heic");
  });

  it("wijst onleesbare bestanden af", () => {
    expect(bepaalBestandsSoort("application/zip", "archief.zip")).toBeNull();
    expect(bepaalBestandsSoort("", "aantekeningen.txt")).toBeNull();
    expect(bepaalBestandsSoort("application/msword", "oud.doc")).toBeNull();
  });
});

describe("maakContentBlokken", () => {
  it("zet elke bronsoort om naar het juiste API-blok", () => {
    const blokken = maakContentBlokken([
      { soort: "pdf", base64: "AAA" },
      { soort: "afbeelding", mediaType: "image/jpeg", base64: "BBB" },
      { soort: "tekst", naam: "concept.docx", tekst: "PACHTOVEREENKOMST…" },
    ]);
    expect(blokken).toEqual([
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: "AAA" },
      },
      {
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: "BBB" },
      },
      {
        type: "document",
        title: "concept.docx",
        source: {
          type: "text",
          media_type: "text/plain",
          data: "PACHTOVEREENKOMST…",
        },
      },
    ]);
  });
});
