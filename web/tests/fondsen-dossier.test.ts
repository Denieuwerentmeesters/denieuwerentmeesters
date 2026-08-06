import { describe, expect, it } from "vitest";
import {
  bepaalDekking,
  categorieVoor,
  deelStapels,
  isAlgemeenAdres,
  schoonContact,
  splitsInRegels,
  splitsProfiel,
  stapelVan,
  strijdigeToezegging,
  telDekking,
  vindTegenstrijdigheden,
  type Archiefstuk,
  type Vereiste,
} from "@/lib/fondsen/dossier";

function vereiste(over: Partial<Vereiste> = {}): Vereiste {
  return {
    id: "v1",
    omschrijving: "Uittreksel Kamer van Koophandel",
    vereiste_type: "kvk_uittreksel",
    fase: "bij_aanvraag",
    verplichtheid: "verplicht",
    zelf_op_te_stellen: false,
    geaccordeerd: false,
    ...over,
  };
}

const VANDAAG = new Date("2026-08-05T00:00:00Z");

describe("de twee stapels (§4)", () => {
  it("zet een projectplan op de wij-stapel en een offerte op de u-stapel", () => {
    expect(stapelVan(vereiste({ vereiste_type: "projectplan", zelf_op_te_stellen: true }))).toBe("wij");
    expect(stapelVan(vereiste({ vereiste_type: "offerte", zelf_op_te_stellen: false }))).toBe("u");
  });

  it("houdt niet-vastgesteld apart in plaats van het de gunstige kant op te laten vallen", () => {
    expect(stapelVan(vereiste({ vereiste_type: "steunbrief", zelf_op_te_stellen: null }))).toBe(
      "onbepaald",
    );
  });

  it("laat een van nature extern stuk nooit op de wij-stapel belanden, wat de rij ook beweert", () => {
    const v = vereiste({ vereiste_type: "offerte", zelf_op_te_stellen: true });
    expect(stapelVan(v)).toBe("u");
    expect(strijdigeToezegging(v)).toMatch(/kunnen samenstellen/);
  });

  it("meldt geen strijdigheid bij een stuk dat de generator wél maakt", () => {
    expect(strijdigeToezegging(vereiste({ vereiste_type: "begroting", zelf_op_te_stellen: true }))).toBeNull();
  });

  it("verdeelt een lijst over drie stapels en houdt de strijdige apart", () => {
    const s = deelStapels([
      vereiste({ id: "a", vereiste_type: "projectplan", zelf_op_te_stellen: true }),
      vereiste({ id: "b", vereiste_type: "kvk_uittreksel", zelf_op_te_stellen: false }),
      vereiste({ id: "c", vereiste_type: "fotos", zelf_op_te_stellen: null }),
      vereiste({ id: "d", vereiste_type: "jaarrekening", zelf_op_te_stellen: true }),
    ]);
    expect(s.wij.map((v) => v.id)).toEqual(["a"]);
    expect(s.u.map((v) => v.id)).toEqual(["b", "d"]);
    expect(s.onbepaald.map((v) => v.id)).toEqual(["c"]);
    expect(s.strijdig.map((x) => x.vereiste.id)).toEqual(["d"]);
  });

  it("zet een strijdige belofte van een niet-extern, niet-genereerbaar type NIET ook op de wij-stapel", () => {
    // bv. "onderbouwing waarom er geen subsidie is aangevraagd": geen
    // EXTERN_VAN_NATURE-type (dus stapelVan zou 'm zonder deze check op
    // "wij" zetten), en geen GENEREERBARE_TYPEN-type (dus strijdig gemeld).
    // Hoorde vroeger op BEIDE stapels — dat was het gemelde dubbele stuk.
    const s = deelStapels([
      vereiste({ id: "e", vereiste_type: "onderbouwing", zelf_op_te_stellen: true }),
    ]);
    expect(s.wij).toEqual([]);
    expect(s.u).toEqual([]);
    expect(s.onbepaald).toEqual([]);
    expect(s.strijdig.map((x) => x.vereiste.id)).toEqual(["e"]);
  });
});

describe("een notitie in losse regels", () => {
  it("splitst geciteerde zinnen in aparte regels voor een opsomming", () => {
    const regels = splitsInRegels(
      '"Een aanvraag kan het hele jaar worden ingediend." Wél één harde regel: "Geen contact vooraf."',
    );
    expect(regels).toHaveLength(3);
    expect(regels[0]).toMatch(/hele jaar/);
    expect(regels[2]).toMatch(/Geen contact vooraf/);
  });

  it("splitst niet op de punt in een bedrag", () => {
    expect(splitsInRegels("Maximaal € 10.000 per jaar.")).toHaveLength(1);
  });
});

describe("categorie van een vereiste", () => {
  it("leidt af uit het vereiste_type", () => {
    expect(categorieVoor(vereiste({ vereiste_type: "eigendomsbewijs" }))).toBe("eigendom_rechten");
    expect(categorieVoor(vereiste({ vereiste_type: "vergunning" }))).toBe("vergunningen");
  });

  it("laat een vastgestelde document_categorie de afleiding overrulen", () => {
    expect(
      categorieVoor(vereiste({ vereiste_type: "kvk_uittreksel", document_categorie: "historisch" })),
    ).toBe("historisch");
  });

  it("negeert nog_in_te_delen als vaststelling", () => {
    expect(
      categorieVoor(vereiste({ vereiste_type: "kvk_uittreksel", document_categorie: "nog_in_te_delen" })),
    ).toBe("governance");
  });

  it("levert null voor wat geen archiefstuk is", () => {
    expect(categorieVoor(vereiste({ vereiste_type: "projectplan" }))).toBeNull();
  });
});

describe("wat hebben we al?", () => {
  const doc = (over: Partial<Archiefstuk> = {}): Archiefstuk => ({
    id: "d1",
    titel: "KvK-uittreksel.pdf",
    categorie: "governance",
    geldig_tot: null,
    ...over,
  });

  it("noemt een ontbrekend stuk ontbrekend", () => {
    const [d] = bepaalDekking([vereiste()], [], VANDAAG);
    expect(d.stand).toBe("ontbreekt");
  });

  it("telt een projectplan niet mee als gat — dat wordt opgesteld", () => {
    const [d] = bepaalDekking([vereiste({ vereiste_type: "projectplan" })], [], VANDAAG);
    expect(d.stand).toBe("niet_archiefstuk");
    expect(telDekking([d]).telbaar).toBe(0);
  });

  it("noemt een verouderend stuk zonder geldigheidsdatum niet in orde", () => {
    const [d] = bepaalDekking([vereiste()], [doc()], VANDAAG);
    expect(d.stand).toBe("geldigheid_onbekend");
    expect(d.toelichting).toMatch(/ouder zijn dan een jaar/);
  });

  it("ziet een verlopen geldigheid", () => {
    const [d] = bepaalDekking([vereiste()], [doc({ geldig_tot: "2026-01-01" })], VANDAAG);
    expect(d.stand).toBe("verlopen");
  });

  it("waarschuwt bij een geldigheid die binnen 90 dagen afloopt", () => {
    const [d] = bepaalDekking([vereiste()], [doc({ geldig_tot: "2026-09-01" })], VANDAAG);
    expect(d.stand).toBe("verloopt");
  });

  it("laat het gunstigste stuk in de categorie de stand bepalen", () => {
    const [d] = bepaalDekking(
      [vereiste()],
      [doc({ id: "oud", geldig_tot: "2026-01-01" }), doc({ id: "nieuw", geldig_tot: "2027-06-01" })],
      VANDAAG,
    );
    expect(d.stand).toBe("aanwezig");
  });

  it("een niet-verouderend stuk zonder datum is gewoon aanwezig", () => {
    const [d] = bepaalDekking(
      [vereiste({ vereiste_type: "beheerplan" })],
      [doc({ categorie: "beheerplannen" })],
      VANDAAG,
    );
    expect(d.stand).toBe("aanwezig");
  });

  it("telt de stapel zodat 'x van de y' klopt, en telt verplicht apart", () => {
    const dekkingen = bepaalDekking(
      [
        vereiste({ id: "a", vereiste_type: "eigendomsbewijs" }),
        vereiste({ id: "b", vereiste_type: "beheerplan", verplichtheid: "aanbevolen" }),
        vereiste({ id: "c", vereiste_type: "vergunning" }),
        vereiste({ id: "d", vereiste_type: "projectplan", zelf_op_te_stellen: true }),
      ],
      [doc({ categorie: "eigendom_rechten" }), doc({ categorie: "beheerplannen" })],
      VANDAAG,
    );
    const t = telDekking(dekkingen);
    expect(t.telbaar).toBe(3);
    expect(t.binnen).toBe(2);
    expect(t.ontbreekt).toBe(1);
    expect(t.verplicht_telbaar).toBe(2);
    expect(t.verplicht_binnen).toBe(1);
  });
});

describe("het matchprofiel leesbaar maken", () => {
  it("splitst op de zes vaste kopjes", () => {
    const delen = splitsProfiel(
      [
        "Wat dit fonds wil bereiken:",
        "Behoud van erfgoed in Zeeland.",
        "Wat ze uitdrukkelijk NIET financieren:",
        "Reguliere exploitatie en onderhoudskosten.",
      ].join("\n"),
    );
    expect(delen).toHaveLength(2);
    expect(delen[1].kop).toBe("Wat ze uitdrukkelijk NIET financieren:");
    expect(delen[1].tekst).toMatch(/exploitatie/);
  });

  it("geeft tekst zonder kopjes terug als één blok in plaats van hem te laten verdwijnen", () => {
    const delen = splitsProfiel("Losse tekst zonder enig kopje.");
    expect(delen).toHaveLength(1);
    expect(delen[0].kop).toBe("");
  });

  it("levert niets bij een leeg profiel", () => {
    expect(splitsProfiel(null)).toEqual([]);
  });
});

describe("tegenstrijdigheden blijven staan", () => {
  it("vist de zin op waarin het model twee bronnen tegen elkaar zet", () => {
    const gevonden = vindTegenstrijdigheden(
      "Het maximum is € 10.000. De website noemt € 15.000, wat tegenstrijdig is met het beleidsplan. Verder niets bijzonders.",
    );
    expect(gevonden).toHaveLength(1);
    expect(gevonden[0]).toMatch(/15\.000/);
  });

  it("dupliceert niet als kaartje en profiel dezelfde zin bevatten", () => {
    const zin = "Deze bedragen spreken elkaar tegen.";
    expect(vindTegenstrijdigheden(zin, zin)).toHaveLength(1);
  });

  it("vindt niets als er niets tegenstrijdigs staat", () => {
    expect(vindTegenstrijdigheden("Maximaal € 10.000 per toekenning.", null)).toEqual([]);
  });
});

describe("contactgegevens en de AVG", () => {
  it("laat een algemene mailbox door en een persoonlijke niet", () => {
    expect(isAlgemeenAdres("info@bylandtstichting.nl")).toBe(true);
    expect(isAlgemeenAdres("zeeland@cultuurfonds.nl")).toBe(true);
    expect(isAlgemeenAdres("esther.prince@cultuurfonds.nl")).toBe(false);
  });

  it("houdt naam en 06-nummer buiten de weergave en meldt dat er iets weggelaten is", () => {
    const c = schoonContact("zeeland@cultuurfonds.nl, Esther Prince 06-38363946");
    expect(c.emails).toEqual(["zeeland@cultuurfonds.nl"]);
    expect(c.telefoons).toEqual([]);
    expect(c.weggelaten).toBe(true);
  });

  it("laat een vast nummer wél zien", () => {
    const c = schoonContact("info@bylandtstichting.nl, 070-3246936 (di-do)");
    expect(c.emails).toEqual(["info@bylandtstichting.nl"]);
    expect(c.telefoons).toEqual(["070-3246936"]);
    expect(c.weggelaten).toBe(false);
  });

  it("laat een contactpagina staan", () => {
    const c = schoonContact("https://www.cultuurfonds.nl/contact");
    expect(c.urls).toEqual(["https://www.cultuurfonds.nl/contact"]);
    expect(c.emails).toEqual([]);
  });

  it("levert niets bij een lege bron", () => {
    expect(schoonContact(null).weggelaten).toBe(false);
  });
});
