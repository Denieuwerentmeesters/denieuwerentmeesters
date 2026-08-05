// Tests voor het deterministisch strippen van boilerplate uit beleidsteksten.
//
// De belangrijkste test in dit bestand is de eerste: er mag NOOIT een uitsluiting
// verdwijnen. Alle andere winst (minder tokens, minder ruis) is niets waard als de
// schoonmaak ook maar één keer een "wij financieren geen restauratie" weghaalt —
// dat is een fout die niemand later nog terugvindt, want het profiel leest daarna
// nog steeds prima.
import { describe, expect, it } from "vitest";
import {
  schoonBeleidstekst,
  schoonmaakRegel,
  telRapporten,
} from "@/lib/fondsen/beleidstekst-schoonmaak";

const UITSLUITINGEN = [
  "Wij financieren geen restauratie van monumenten.",
  "Exploitatiekosten komen niet in aanmerking.",
  "Aanvragen van particulieren worden niet in behandeling genomen.",
  "Geen bijdragen aan projecten die al zijn gestart.",
  "Wij steunen uitsluitend projecten in de provincie Gelderland.",
  "Alleen aanvragen van ANBI-instellingen worden beoordeeld.",
  "Bijdragen bedragen maximaal € 15.000 per project.",
  "Cookies worden niet gebruikt om aanvragen te beoordelen.",
  "Home-projecten voor daklozen zijn uitgesloten.",
  "Bestuur: aanvragen worden niet door het bestuur zelf ingediend.",
  "Voorzitter A. de Vries beslist niet over individuele aanvragen.",
  "Balans per 31 december is geen criterium voor toekenning.",
  "RSIN-nummers zijn niet vereist bij een aanvraag.",
  "Tenzij het project een monument betreft, geldt een drempel van 2.000 euro.",
];

describe("schoonBeleidstekst — wat er nooit weg mag", () => {
  it("laat elke uitsluiting staan, ook als de regel op boilerplate lijkt", () => {
    for (const regel of UITSLUITINGEN) {
      const { tekst } = schoonBeleidstekst(regel);
      expect(tekst, `weggevallen: ${regel}`).toContain(regel);
    }
  });

  it("laat uitsluitingen staan tussen dikke lagen boilerplate", () => {
    const bron = [
      "Home | Over ons | Nieuws | Contact",
      "Deze website maakt gebruik van cookies om uw ervaring te verbeteren.",
      "",
      "Doelstelling",
      "Het fonds steunt natuurbehoud op Nederlandse landgoederen.",
      "Wij financieren geen restauratie van monumenten en geen exploitatiekosten.",
      "",
      "Bestuur",
      "Voorzitter: mw. drs. J. de Vries",
      "Secretaris: dhr. P. Jansen",
      "Penningmeester: A.B.C. Willemsen",
      "",
      "Balans per 31 december 2025",
      "Vlottende activa            1.234.567      1.100.000",
      "Liquide middelen              987.654        900.000",
      "Totaal activa               2.222.221      2.000.000",
      "",
      "RSIN: 812345678",
      "KvK-nummer: 41123456",
      "Het beloningsbeleid volgt de richtlijn van de Goede Doelen.",
      "",
      "Terug naar boven",
      "Privacyverklaring",
    ].join("\n");

    const { tekst, rapport } = schoonBeleidstekst(bron);
    expect(tekst).toContain("Wij financieren geen restauratie van monumenten");
    expect(tekst).toContain("Het fonds steunt natuurbehoud");
    expect(tekst).toContain("Doelstelling");
    // ...en de rest is weg.
    expect(tekst).not.toContain("mw. drs. J. de Vries");
    expect(tekst).not.toContain("1.234.567");
    expect(tekst).not.toContain("RSIN");
    expect(tekst).not.toContain("Terug naar boven");
    expect(tekst).not.toContain("Privacyverklaring");
    expect(rapport.aandeel).toBeGreaterThan(0.4);
    expect(rapport.per_categorie.bestuur_namen).toBeGreaterThan(0);
    expect(rapport.per_categorie.jaarrekening).toBeGreaterThan(0);
  });

  it("raakt een bedrag in proza niet aan (dat lijkt het meest op een tabelregel)", () => {
    const regel = "Wij verstrekken bijdragen van € 1.000 tot € 15.000 per project.";
    expect(schoonBeleidstekst(regel).tekst).toBe(regel);
  });

  it("laat een zin over het bestuur staan als er geen naam in staat", () => {
    const regel = "Het bestuur beoordeelt aanvragen twee keer per jaar.";
    expect(schoonBeleidstekst(regel).tekst).toBe(regel);
  });

  it("verwijdert een herhaalde pagina-kop pas vanaf drie keer, en nooit met beleid erin", () => {
    const kop = "Stichting Voorbeeldfonds";
    const bron = [kop, "Eerste alinea.", kop, "Tweede alinea.", kop, "Derde alinea."].join("\n");
    expect(schoonBeleidstekst(bron).tekst).not.toContain(kop);

    const beleidskop = "Wij financieren geen onderhoud";
    const bron2 = [beleidskop, "a", beleidskop, "b", beleidskop, "c"].join("\n");
    // Drie keer herhaald, maar het is beleid: blijft staan.
    expect(schoonBeleidstekst(bron2).tekst).toContain(beleidskop);
  });

  it("verwijdert niets uit een tekst die helemaal uit beleid bestaat", () => {
    const bron = [
      "Het fonds richt zich op behoud van cultureel erfgoed.",
      "Aanvragen kunnen het hele jaar door worden ingediend.",
      "Wij financieren geen personeelskosten.",
    ].join("\n");
    const { tekst, rapport } = schoonBeleidstekst(bron);
    expect(tekst).toBe(bron);
    expect(rapport.verwijderd).toBe(0);
  });
});

describe("schoonBeleidstekst — de winst", () => {
  it("meet en verantwoordt wat er weg is", () => {
    const bron = [
      "Home",
      "Contact",
      "Sitemap",
      "Deze website maakt gebruik van cookies.",
      "Het fonds steunt natuurherstel.",
    ].join("\n");
    const { rapport } = schoonBeleidstekst(bron);
    expect(rapport.tekens_voor).toBeGreaterThan(rapport.tekens_na);
    expect(rapport.per_categorie.navigatie).toBeGreaterThan(0);
    expect(rapport.per_categorie.cookie_privacy).toBeGreaterThan(0);
    // De optelsom klopt: alles wat weg is, is aan een categorie toegewezen.
    const som = Object.values(rapport.per_categorie).reduce((a, b) => a + (b ?? 0), 0);
    expect(som).toBeGreaterThanOrEqual(rapport.verwijderd - 2);
  });

  it("vouwt overtollige witruimte in", () => {
    const { tekst } = schoonBeleidstekst("een\n\n\n\n\ntwee");
    expect(tekst).toBe("een\n\ntwee");
  });

  it("geeft een lege tekst netjes terug", () => {
    const { tekst, rapport } = schoonBeleidstekst("");
    expect(tekst).toBe("");
    expect(rapport.aandeel).toBe(0);
  });

  it("logt per fonds één navolgbare regel", () => {
    const { rapport } = schoonBeleidstekst("Home\nContact\nHet fonds steunt natuurherstel.");
    const regel = schoonmaakRegel("Testfonds", rapport);
    expect(regel).toContain("[schoonmaak] Testfonds");
    expect(regel).toContain("navigatie=");
    expect(regel).toContain("->");
  });

  it("telt rapporten van meerdere documenten bij elkaar op", () => {
    const a = schoonBeleidstekst("Home\nHet fonds steunt natuur.").rapport;
    const b = schoonBeleidstekst("Sitemap\nHet fonds steunt erfgoed.").rapport;
    const som = telRapporten([a, b]);
    expect(som.tekens_voor).toBe(a.tekens_voor + b.tekens_voor);
    expect(som.verwijderd).toBe(a.verwijderd + b.verwijderd);
    expect(som.aandeel).toBeGreaterThan(0);
  });
});
