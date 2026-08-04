// De vangnetregel bepaalt wat er bewaard wordt van berichten die de radar
// niet op de kaart kon leggen. Hij was eerst veel te ruim: van de eerste 49
// bewaarde berichten kwamen er 46 langs deze route binnen, vrijwel allemaal
// gewone vergunningen kilometers verderop. Deze tests houden de smallere
// regel op zijn plek.
import { describe, it, expect } from "vitest";
import { vangnetGeldt } from "@/lib/omgeving/ingest";

const overMaanden = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
};

const toekomst = { soort: "zienswijze", einddatum: overMaanden(1) };
const verleden = { soort: "zienswijze", einddatum: overMaanden(-3) };

describe("vangnetGeldt", () => {
  it("laat een lopende zienswijzetermijn door", () => {
    expect(vangnetGeldt("onplaatsbaar", toekomst, "omgevingsplan")).toBe(true);
  });

  it("laat een zienswijze door ongeacht de rubriek", () => {
    // De zienswijze zelf is het onherstelbare moment.
    expect(vangnetGeldt("onplaatsbaar", toekomst, "iets onbekends")).toBe(true);
    expect(vangnetGeldt("geen_locatie", toekomst, null)).toBe(true);
  });

  it("houdt een gewone bouwvergunning met bezwaartermijn tegen", () => {
    // Dit is de categorie die de eerste ronde volstopte: een dakkapel in
    // Vlissingen met een bezwaartermijn, kilometers van het landgoed.
    expect(
      vangnetGeldt("onplaatsbaar", { soort: "bezwaar", einddatum: overMaanden(1) }, "omgevingsvergunning"),
    ).toBe(false);
  });

  it("houdt een verstreken termijn tegen", () => {
    // Bij een eerste ronde over twaalf maanden is dit het verschil tussen een
    // handvol actuele punten en een jaar oud nieuws.
    expect(vangnetGeldt("onplaatsbaar", verleden, "omgevingsplan")).toBe(false);
  });

  it("geldt nooit voor een bericht dat wél geplaatst is", () => {
    // Dan beslist de ruimtelijke poort, niet het vangnet.
    expect(vangnetGeldt("geplaatst", toekomst, "omgevingsplan")).toBe(false);
  });

  it("geldt niet zonder termijn", () => {
    expect(vangnetGeldt("onplaatsbaar", null, "omgevingsplan")).toBe(false);
  });

  it("laat zware besluitsoorten door, ook met een bezwaartermijn", () => {
    const bezwaar = { soort: "bezwaar", einddatum: overMaanden(1) };
    for (const r of ["omgevingsplan", "peilbesluit", "waterschapsverordening"]) {
      expect(vangnetGeldt("onplaatsbaar", bezwaar, r), r).toBe(true);
    }
  });
});
