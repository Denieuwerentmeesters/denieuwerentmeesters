// De locatie-extractie is de zwakste schakel van de omgevingsradar: als hier
// een adres gemist wordt, ziet de radar het bericht nooit en merkt niemand het.
// Alle titels hieronder zijn echte publicaties van gemeente Middelburg uit
// juli 2026, opgehaald via de SRU-koppeling.
import { describe, it, expect } from "vitest";
import { locatieUitTekst } from "@/lib/omgeving/plaatsen";

describe("locatieUitTekst", () => {
  it("pakt een volledig adres met postcode", () => {
    const r = locatieUitTekst(
      "Aanvraag omgevingsvergunning reguliere procedure Torentrans 107, 4336 JN Middelburg",
    );
    expect(r?.verwacht).toBe(2);
    expect(r?.term).toContain("Torentrans 107");
    expect(r?.term).toContain("4336 JN");
  });

  it("stript de aanhef en houdt straat met huisnummer over", () => {
    const r = locatieUitTekst("Toestemming voor het kappen van een boom aan de Molenweg 12");
    expect(r?.verwacht).toBe(2);
    expect(r?.term).toMatch(/Molenweg\s*12/);
  });

  it("houdt een kavelaanduiding overeind", () => {
    const r = locatieUitTekst(
      "Aanvraag omgevingsvergunning reguliere procedure Slaak Kavel A29 Arnemuiden",
    );
    expect(r?.term).toContain("Slaak");
  });

  it("herkent straatnamen zonder -weg of -laan", () => {
    // Dit is waarom er geen suffixlijst is: dit zijn allemaal echte
    // Middelburgse straatnamen die een lijst met -straat/-weg zou missen.
    for (const [titel, verwachtInTerm] of [
      [
        "Inspraak voorlopig ontwerp herinrichting speel- en sportvoorzieningen Park Toorenvliedt",
        "Toorenvliedt",
      ],
      ["Aanvraag omgevingsvergunning reguliere procedure Hof ter Veste te Middelburg", "Hof ter Veste"],
      ["Toestemming voor vervangen kade Arnestein II", "Arnestein"],
    ] as const) {
      const r = locatieUitTekst(titel);
      expect(r, `"${titel}" hoort een zoekterm op te leveren`).not.toBeNull();
      expect(r?.term).toContain(verwachtInTerm);
    }
  });

  it("geeft null als er na het strippen niets overblijft", () => {
    for (const t of [
      "Ingetrokken aanvraag omgevingsvergunning",
      "uitschrijving basisregistratie personen",
    ]) {
      expect(locatieUitTekst(t), `"${t}" hoort geen zoekterm op te leveren`).toBeNull();
    }
  });

  it("laat twijfelgevallen door naar de geocoder, die op gemeente begrenst", () => {
    // "Bevoegdhedenbesluit 2026" ziet er locatie-achtig uit (hoofdletter +
    // cijfer) en komt hier dus door. Dat is bewust: zonder gemeentefilter
    // geocodeert dat naar een dorp in Friesland, mét filter naar niets. Het
    // oordeel hoort bij de partij die de straatnamen kent, niet bij een regex.
    expect(locatieUitTekst("Bevoegdhedenbesluit 2026")).not.toBeNull();
  });

  it("neemt bij een postcode genoeg context mee om te kunnen geocoderen", () => {
    // Zonder voorloop zou alleen "4336 JN Middelburg" overblijven en dat
    // geocodeert naar het midden van een postcodegebied in plaats van het pand.
    const r = locatieUitTekst(
      "Kennisgeving verlengde beslistermijn Briandlaan 2, 4334 GP Middelburg",
    );
    expect(r?.term).toContain("Briandlaan");
  });
});
