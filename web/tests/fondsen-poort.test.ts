import { describe, it, expect } from "vitest";
import {
  aliasIndex,
  splitsWerkgebied,
  toetsBenaderbaarheid,
  toetsGeografie,
  toetsRechtsvorm,
  toetsAnbi,
  toetsAanvragerRoute,
  toetsBedragband,
  toetsProjectstatus,
  toetsKostensoort,
  toetsPoort,
  trechter,
  isOnderzocht,
  isNswFamilieBv,
  type Landgoedprofiel,
  type PoortFonds,
  type RegioAlias,
} from "@/lib/fondsen/poort";
import { leesWerkgebied } from "@/lib/fondsen/werkgebied";

// De poort is de plek waar een fout het duurst is: een fonds ten onrechte laten
// afvallen is onzichtbaar, en een fonds ten onrechte aanschrijven kost goodwill
// in een kleine sector. Daarom staat de nadruk in deze tests op het ONBEKEND-
// geval — dat is de uitkomst die het vaakst voorkomt en het makkelijkst
// stilzwijgend de verkeerde kant op valt.

function profiel(over: Partial<Landgoedprofiel> = {}): Landgoedprofiel {
  return {
    provincie: "Zeeland",
    gemeente: "Middelburg",
    nsw_status: "actief",
    rechtsvorm: "stichting",
    is_anbi: false,
    hectare: 57.45,
    natuurbeheertypes: [],
    agrarisch: false,
    aantalPachtpercelen: 0,
    ligt_in_natura2000: null,
    ligt_in_nnn: true,
    ligt_op_veengrond: null,
    anlb_leefgebied: null,
    themas: [],
    trefwoorden: [],
    drempel: 60,
    ...over,
  };
}

function fonds(over: Partial<PoortFonds> = {}): PoortFonds {
  return {
    id: "f1",
    naam: "Testfonds",
    benaderbaarheid: "open",
    aanvrager_type: "landgoedeigenaar",
    geo_niveau: "landelijk",
    geo_waarden: ["Nederland"],
    criteria: [],
    ...over,
  };
}

const RECHTSVORM_EIS = {
  omschrijving: "Aanvrager moet een organisatie zijn (stichting/vereniging), geen particulier",
  veld: "rechtsvorm",
  operator: "in",
  waarde: "stichting,vereniging",
  soort: "eis",
  fase: "vooraf",
};

const ANBI_EIS = {
  omschrijving: "Uitsluitend instellingen met ANBI-verklaring",
  veld: "is_anbi",
  operator: "is",
  waarde: "ja",
  soort: "eis",
  fase: "vooraf",
};

// ── Benaderbaarheid (§3) ───────────────────────────────────────────────────

describe("benaderbaarheid", () => {
  it("laat open en open_met_drempel door", () => {
    expect(toetsBenaderbaarheid(fonds({ benaderbaarheid: "open" })).uitkomst).toBe("doorgelaten");
    expect(
      toetsBenaderbaarheid(
        fonds({ benaderbaarheid: "open_met_drempel", benaderwijze_notitie: "alleen ANBI's" }),
      ).uitkomst,
    ).toBe("doorgelaten");
  });

  it("laat via_intermediair door met een ANDERE actie, niet als afwijzing", () => {
    const o = toetsBenaderbaarheid(fonds({ benaderbaarheid: "via_intermediair" }));
    expect(o.uitkomst).toBe("doorgelaten");
    expect(o.actie).toMatch(/contact/i);
  });

  it("laat op_uitnodiging en gesloten afvallen, mét reden", () => {
    for (const b of ["op_uitnodiging", "gesloten"]) {
      const o = toetsBenaderbaarheid(fonds({ benaderbaarheid: b }));
      expect(o.uitkomst).toBe("afgevallen");
      expect(o.reden.length).toBeGreaterThan(10);
    }
  });

  it("geeft bij onbekend een waarschuwing en geen afwijzing", () => {
    const o = toetsBenaderbaarheid(fonds({ benaderbaarheid: "onbekend" }));
    expect(o.uitkomst).toBe("onbekend");
    expect(o.reden).toMatch(/geen 'nee'/);
  });

  it("neemt het letterlijke citaat op waarop de conclusie berust", () => {
    const o = toetsBenaderbaarheid(
      fonds({ benaderbaarheid: "gesloten", benaderwijze_notitie: "wij financieren alleen eigen doelen" }),
    );
    expect(o.reden).toContain("wij financieren alleen eigen doelen");
  });
});

// ── Geografie (§5) ─────────────────────────────────────────────────────────

describe("geografie", () => {
  const p = profiel();

  it("laat landelijk altijd door", () => {
    expect(toetsGeografie(fonds({ geo_niveau: "landelijk" }), p).uitkomst).toBe("doorgelaten");
  });

  it("laat internationaal altijd afvallen (Prince Bernhard Nature Fund-val)", () => {
    const o = toetsGeografie(
      fonds({ geo_niveau: "internationaal", geo_waarden: ["Afrika", "Azië"] }),
      p,
    );
    expect(o.uitkomst).toBe("afgevallen");
    expect(o.reden).toMatch(/buiten Nederland/);
  });

  it("laat een provincie door bij gelijke provincie en afvallen bij een andere", () => {
    expect(
      toetsGeografie(fonds({ geo_niveau: "provincie", geo_waarden: ["Zeeland"] }), p).uitkomst,
    ).toBe("doorgelaten");
    expect(
      toetsGeografie(fonds({ geo_niveau: "provincie", geo_waarden: ["Groningen"] }), p).uitkomst,
    ).toBe("afgevallen");
  });

  it("geeft onbekend als geo_niveau provincie is maar de waarde vrije tekst", () => {
    const o = toetsGeografie(
      fonds({ geo_niveau: "provincie", geo_waarden: ["Landelijk / internationaal"] }),
      p,
    );
    expect(o.uitkomst).toBe("onbekend");
  });

  it("geeft onbekend als het landgoed zelf geen provincie heeft", () => {
    const o = toetsGeografie(
      fonds({ geo_niveau: "provincie", geo_waarden: ["Zeeland"] }),
      profiel({ provincie: null }),
    );
    expect(o.uitkomst).toBe("onbekend");
  });

  it("geeft onbekend als geo_niveau NULL is — dat is iets anders dan landelijk", () => {
    const o = toetsGeografie(fonds({ geo_niveau: null, geo_waarden: [] }), p);
    expect(o.uitkomst).toBe("onbekend");
  });

  // Het hart van de opdracht: 79 fondsen hebben een regio als vrije tekst.
  it("geeft ONBEKEND bij een niet-vertaalde regio, nooit 'voldoet niet'", () => {
    for (const w of ["Kennemerland", "de Achterhoek", "Gorecht (Haren, Hoogezand)"]) {
      const o = toetsGeografie(fonds({ geo_niveau: "regio", geo_waarden: [w] }), p);
      expect(o.uitkomst, w).toBe("onbekend");
      expect(o.uitkomst, w).not.toBe("afgevallen");
    }
  });

  it("laat een regio door als de provincie van het landgoed er letterlijk in staat", () => {
    const o = toetsGeografie(
      fonds({ geo_niveau: "regio", geo_waarden: ["Schouwen-Duiveland (Zeeland)"] }),
      p,
    );
    expect(o.uitkomst).toBe("doorgelaten");
  });

  it("laat een regio door als de gemeente er letterlijk in staat", () => {
    const o = toetsGeografie(
      fonds({ geo_niveau: "regio", geo_waarden: ["Walcheren: Middelburg, Vlissingen, Veere"] }),
      p,
    );
    expect(o.uitkomst).toBe("doorgelaten");
  });

  it("behandelt 'Landelijk (kantoor Den Haag)' als landelijk, niet als Den Haag", () => {
    const o = toetsGeografie(
      fonds({ geo_niveau: "regio", geo_waarden: ["Landelijk (kantoor Den Haag)"] }),
      p,
    );
    expect(o.uitkomst).toBe("doorgelaten");
  });

  const kennemerland: RegioAlias = {
    alias: "Kennemerland",
    provincie: "Noord-Holland",
    gemeenten: ["Haarlem", "Bloemendaal", "Heemstede"],
    landelijk: false,
    geaccordeerd: false,
  };

  it("laat een NIET-geaccordeerde alias nooit iets laten afvallen", () => {
    const o = toetsGeografie(
      fonds({ geo_niveau: "regio", geo_waarden: ["Kennemerland"] }),
      p,
      aliasIndex([kennemerland]),
    );
    expect(o.uitkomst).toBe("onbekend");
    expect(o.reden).toMatch(/niet geaccordeerd/);
  });

  it("laat een GEACCORDEERDE alias wel afvallen", () => {
    const o = toetsGeografie(
      fonds({ geo_niveau: "regio", geo_waarden: ["Kennemerland"] }),
      p,
      aliasIndex([{ ...kennemerland, geaccordeerd: true }]),
    );
    expect(o.uitkomst).toBe("afgevallen");
  });

  it("laat een alias door als het landgoed erbinnen valt, ook als die nog niet geaccordeerd is", () => {
    const o = toetsGeografie(
      fonds({ geo_niveau: "regio", geo_waarden: ["Kennemerland"] }),
      profiel({ provincie: "Noord-Holland", gemeente: "Bloemendaal" }),
      aliasIndex([kennemerland]),
    );
    expect(o.uitkomst).toBe("doorgelaten");
  });

  it("knipt vrije tekst in herkenbare brokjes", () => {
    expect(splitsWerkgebied("Noord-Holland (Kennemerland: Haarlem, Bloemendaal)")).toEqual([
      "noord-holland",
      "kennemerland",
      "haarlem",
      "bloemendaal",
    ]);
  });
});

// ── De provincie lezen uit vrije werkgebied-tekst ──────────────────────────
// 79 fondsen hebben een regio als vrije tekst; ruim de helft noemt de provincie
// letterlijk in diezelfde tekst. Die lezen is deterministisch. Wat er níét in
// staat blijft onbekend — niet raden op een plaatsnaam die we toevallig kennen.

describe("werkgebied — provincie uit vrije tekst", () => {
  const zeeland = profiel(); // Ter Hooge: stichting, Middelburg, Zeeland
  const gld = profiel({ provincie: "Gelderland", gemeente: "Doesburg" });

  function geo(w: string, p = zeeland) {
    return toetsGeografie(fonds({ geo_niveau: "regio", geo_waarden: [w] }), p);
  }

  it("leest de kale provincienaam", () => {
    expect(leesWerkgebied("Achterhoek, Gelderland").provincies).toEqual(["Gelderland"]);
    expect(leesWerkgebied("Doesburg (Gelderland)").provincies).toEqual(["Gelderland"]);
    expect(leesWerkgebied("Beemster (Noord-Holland)").provincies).toEqual(["Noord-Holland"]);
  });

  it("neemt bij meerdere provincies ze allemaal mee", () => {
    const w = "Biesbosch-regio (Zuid-Holland/Noord-Brabant)";
    expect(leesWerkgebied(w).provincies).toEqual(["Noord-Brabant", "Zuid-Holland"]);
    // Het landgoed hoeft er maar in één te liggen.
    expect(
      geo(w, profiel({ provincie: "Noord-Brabant", gemeente: "Drimmelen" })).uitkomst,
    ).toBe("doorgelaten");
    expect(geo(w).uitkomst).toBe("afgevallen");
  });

  it("herkent de bijvoeglijke vormen: Friese IJsselmeerkust is Friesland", () => {
    expect(leesWerkgebied("Friese IJsselmeerkust").provincies).toEqual(["Friesland"]);
    const o = geo("Friese IJsselmeerkust");
    expect(o.uitkomst).toBe("afgevallen");
    expect(o.reden).toMatch(/Friesland/);
    expect(
      geo("Friese IJsselmeerkust", profiel({ provincie: "Friesland", gemeente: "De Fryske Marren" }))
        .uitkomst,
    ).toBe("doorgelaten");
  });

  it("herkent de overige afgeleide vormen", () => {
    const paren: Array<[string, string]> = [
      ["Gelderse Achterhoek en Veluwe", "Gelderland"],
      ["Zeeuwse kust", "Zeeland"],
      ["Drentse Aa", "Drenthe"],
      ["Utrechtse Heuvelrug", "Utrecht"],
      ["Limburgse heuvels", "Limburg"],
      ["Overijsselse landgoederen", "Overijssel"],
      ["Groninger Landschap", "Groningen"],
      ["Grunneger initiatieven", "Groningen"],
      ["Brabantse Wal", "Noord-Brabant"],
      ["Flevolandse polder", "Flevoland"],
      ["Fryske Gea", "Friesland"],
    ];
    for (const [tekst, prov] of paren) {
      expect(leesWerkgebied(tekst).provincies, tekst).toEqual([prov]);
    }
  });

  it("kiest bij 'Hollands' nooit één van de twee", () => {
    const l = leesWerkgebied("Hollandse duinstreek");
    expect(l.provincies).toEqual(["Noord-Holland", "Zuid-Holland"]);
    expect(l.ambigu).toBe(true);
    // Noord-Hollandse is wél eenduidig — dat mag niet ambigu worden.
    const n = leesWerkgebied("Noord-Hollandse kust");
    expect(n.provincies).toEqual(["Noord-Holland"]);
    expect(n.ambigu).toBe(false);
  });

  it("blijft onbekend bij een streeknaam waar geen provincie in staat", () => {
    for (const w of [
      "Gorecht",
      "Kennemerland",
      "Krimpenerwaard",
      "Midden-Delfland",
      "Holland Rijnland (Leidse regio)",
    ]) {
      expect(leesWerkgebied(w).provincies, w).toEqual([]);
      expect(geo(w).uitkomst, w).toBe("onbekend");
    }
  });

  it("laat 'landelijk' en 'overig NL' de begrenzing opheffen", () => {
    for (const w of [
      "Groningen / landelijk",
      "Friesland (prioriteit), dan Noordoost-Nederland, dan overig NL",
      "Limburg (voorkeur), landelijk mogelijk",
      "Rotterdam (landelijk actief)",
    ]) {
      expect(geo(w).uitkomst, w).toBe("doorgelaten");
    }
    // "Groningen / landelijk" is dus geen Gronings fonds.
    expect(leesWerkgebied("Groningen / landelijk").landelijk).toBe(true);
  });

  it("behandelt een voorkeur als voorkeur, niet als eis", () => {
    for (const w of [
      "Bij voorkeur Leiden en Zuid-Holland",
      "Friesland (voorkeur)",
      "Friesland (nadruk Heerenveen e.o.)",
      "Zuid-Holland (voorkeur Delft, Dordrecht, Leiden, Rotterdam)",
      "Provincie Utrecht (nadruk stad Utrecht)",
    ]) {
      const o = geo(w);
      expect(o.uitkomst, w).toBe("doorgelaten");
      expect(o.reden, w).toMatch(/voorkeur|ruimer|landelijk/i);
    }
  });

  it("wijst niet af als de tekst plaatsen buiten de genoemde provincie noemt", () => {
    // Deventer ligt in Overijssel, niet in Gelderland.
    const w = "Gelderland (Wageningen, Arnhem, Nijmegen, Zutphen, Deventer)";
    const l = leesWerkgebied(w);
    expect(l.provincies).toEqual(["Gelderland"]);
    expect(l.buiten_provincie).toContain("Deventer");
    const o = geo(w);
    expect(o.uitkomst).toBe("doorgelaten");
    expect(o.reden).toMatch(/Deventer/);
    // Voor een Gelders landgoed gewoon doorgelaten.
    expect(geo(w, gld).uitkomst).toBe("doorgelaten");
  });

  it("noemt de uitkomst zichtbaar in de reden", () => {
    const o = geo("Doesburg (Gelderland)");
    expect(o.uitkomst).toBe("afgevallen");
    expect(o.reden).toMatch(/werkgebied genoemd: Gelderland/i);
    expect(o.reden).toMatch(/Zeeland/);
  });

  it("laat een landgoed zonder provincie nooit afvallen op de tekstlezing", () => {
    const o = toetsGeografie(
      fonds({ geo_niveau: "regio", geo_waarden: ["Doesburg (Gelderland)"] }),
      profiel({ provincie: null }),
    );
    expect(o.uitkomst).toBe("onbekend");
  });

  it("leest de provincie ook als geo_niveau 'provincie' vrije tekst bevat", () => {
    const o = toetsGeografie(
      fonds({ geo_niveau: "provincie", geo_waarden: ["Provincie Gelderland (Achterhoek)"] }),
      zeeland,
    );
    expect(o.uitkomst).toBe("afgevallen");
  });

  it("laat een Zeeuws fonds gewoon door voor Ter Hooge", () => {
    for (const w of ["Schouwen-Duiveland (Zeeland)", "Zeeuwse landgoederen"]) {
      expect(geo(w).uitkomst, w).toBe("doorgelaten");
    }
  });
});

// ── Rechtsvorm (§9.1) ──────────────────────────────────────────────────────

describe("rechtsvorm", () => {
  it("laat een stichting door bij de eis stichting/vereniging", () => {
    const o = toetsRechtsvorm(fonds({ criteria: [RECHTSVORM_EIS] }), profiel());
    expect(o.uitkomst).toBe("doorgelaten");
  });

  it("laat een particulier landgoed afvallen, mét reden", () => {
    const o = toetsRechtsvorm(
      fonds({ criteria: [RECHTSVORM_EIS] }),
      profiel({ rechtsvorm: "particulier", nsw_status: null }),
    );
    expect(o.uitkomst).toBe("afgevallen");
    expect(o.reden).toContain("particulier");
  });

  it("geeft ONBEKEND als de rechtsvorm van het landgoed leeg is", () => {
    const o = toetsRechtsvorm(
      fonds({ criteria: [RECHTSVORM_EIS] }),
      profiel({ rechtsvorm: null }),
    );
    expect(o.uitkomst).toBe("onbekend");
  });

  it("laat een NSW-familie-B.V. niet hard afvallen (Cultuurfonds-uitzondering)", () => {
    const p = profiel({ rechtsvorm: "bv", nsw_status: "actief" });
    expect(isNswFamilieBv(p)).toBe(true);
    const o = toetsRechtsvorm(fonds({ criteria: [RECHTSVORM_EIS] }), p);
    expect(o.uitkomst).toBe("onbekend");
    expect(o.reden).toMatch(/NSW/);
  });

  it("laat een gewone B.V. zonder NSW wél afvallen", () => {
    const o = toetsRechtsvorm(
      fonds({ criteria: [RECHTSVORM_EIS] }),
      profiel({ rechtsvorm: "bv", nsw_status: null }),
    );
    expect(o.uitkomst).toBe("afgevallen");
  });

  it("laat door als het fonds geen rechtsvormeis heeft vastgelegd", () => {
    expect(toetsRechtsvorm(fonds({ criteria: [] }), profiel()).uitkomst).toBe("doorgelaten");
  });

  it("negeert criteria uit een andere fase dan 'vooraf'", () => {
    const o = toetsRechtsvorm(
      fonds({ criteria: [{ ...RECHTSVORM_EIS, fase: "bij_aanvraag" }] }),
      profiel({ rechtsvorm: "particulier" }),
    );
    expect(o.uitkomst).toBe("doorgelaten");
  });
});

describe("anbi", () => {
  it("laat door als het fonds geen ANBI-eis heeft vastgelegd", () => {
    expect(toetsAnbi(fonds({ criteria: [] }), profiel()).uitkomst).toBe("doorgelaten");
  });

  it("laat een landgoed zonder ANBI-status afvallen bij een ANBI-eis", () => {
    const o = toetsAnbi(fonds({ criteria: [ANBI_EIS] }), profiel({ is_anbi: false }));
    expect(o.uitkomst).toBe("afgevallen");
    expect(o.reden).toContain("geen ANBI-status");
  });

  it("laat een landgoed mét ANBI-status door", () => {
    const o = toetsAnbi(fonds({ criteria: [ANBI_EIS] }), profiel({ is_anbi: true }));
    expect(o.uitkomst).toBe("doorgelaten");
  });

  it("negeert criteria uit een andere fase dan 'vooraf'", () => {
    const o = toetsAnbi(
      fonds({ criteria: [{ ...ANBI_EIS, fase: "bij_aanvraag" }] }),
      profiel({ is_anbi: false }),
    );
    expect(o.uitkomst).toBe("doorgelaten");
  });
});

// ── Aanvrager-route ────────────────────────────────────────────────────────

describe("aanvrager-route", () => {
  it("laat derde_partij door met de actie 'zoek een partner'", () => {
    const o = toetsAanvragerRoute(
      fonds({ aanvrager_type: "derde_partij", landgoed_partnertype: "zorg- of welzijnsstichting" }),
    );
    expect(o.uitkomst).toBe("doorgelaten");
    expect(o.actie).toMatch(/partner/i);
  });

  it("geeft onbekend bij aanvrager_type onbekend", () => {
    expect(toetsAanvragerRoute(fonds({ aanvrager_type: "onbekend" })).uitkomst).toBe("onbekend");
  });

  it("laat niet_relevant afvallen", () => {
    expect(
      toetsAanvragerRoute(fonds({ aanvrager_type: "beide", landgoed_route: "niet_relevant" }))
        .uitkomst,
    ).toBe("afgevallen");
  });
});

// ── Bedragband ─────────────────────────────────────────────────────────────

describe("bedragband", () => {
  it("toetst niet als er geen projectbedrag is", () => {
    const o = toetsBedragband(fonds({ bedrag_min: 50000 }), {});
    expect(o.uitkomst).toBe("doorgelaten");
    expect(o.reden).toMatch(/niet getoetst/);
  });

  it("laat afvallen onder de ondergrens en boven de bovengrens", () => {
    expect(toetsBedragband(fonds({ bedrag_min: 50000 }), { bedrag: 3000 }).uitkomst).toBe(
      "afgevallen",
    );
    expect(toetsBedragband(fonds({ bedrag_max: 5000 }), { bedrag: 200000 }).uitkomst).toBe(
      "afgevallen",
    );
  });

  it("laat door binnen de band", () => {
    expect(
      toetsBedragband(fonds({ bedrag_min: 1000, bedrag_max: 10000 }), { bedrag: 5000 }).uitkomst,
    ).toBe("doorgelaten");
  });

  it("geeft onbekend als het fonds geen band publiceert", () => {
    expect(toetsBedragband(fonds({}), { bedrag: 5000 }).uitkomst).toBe("onbekend");
  });
});

// ── Projectstatus (§6, de timing-val) ──────────────────────────────────────

describe("projectstatus", () => {
  it("laat idee en in_voorbereiding door", () => {
    expect(toetsProjectstatus({ projectstatus: "idee" }).uitkomst).toBe("doorgelaten");
    expect(toetsProjectstatus({ projectstatus: "in_voorbereiding" }).uitkomst).toBe("doorgelaten");
  });

  it("knijpt vanaf gegund alles af, met uitleg over terugwerkende kracht", () => {
    for (const s of ["gegund", "gestart", "afgerond"] as const) {
      const o = toetsProjectstatus({ projectstatus: s });
      expect(o.uitkomst, s).toBe("afgevallen");
      expect(o.reden).toMatch(/terugwerkende kracht/);
    }
  });

  it("toetst niet zonder opgegeven status", () => {
    expect(toetsProjectstatus({}).uitkomst).toBe("doorgelaten");
  });
});

// ── Kostensoort (§9.2) ─────────────────────────────────────────────────────

describe("kostensoort", () => {
  it("toetst niet zonder opgegeven kostensoort", () => {
    expect(toetsKostensoort(fonds({ kostensoort: ["restauratie"] }), {}).uitkomst).toBe(
      "doorgelaten",
    );
  });

  it("laat door als het fonds de gevraagde kostensoort financiert", () => {
    expect(
      toetsKostensoort(fonds({ kostensoort: ["restauratie"] }), { kostensoort: "restauratie" })
        .uitkomst,
    ).toBe("doorgelaten");
  });

  it("geeft bij regulier onderhoud een herkaderingsadvies in plaats van een stille afwijzing", () => {
    const o = toetsKostensoort(fonds({ kostensoort: ["restauratie", "investering"] }), {
      kostensoort: "regulier_onderhoud",
    });
    expect(o.uitkomst).toBe("afgevallen");
    expect(o.herkadering).toMatch(/restauratie/);
    expect(o.herkadering).toMatch(/achterstallig onderhoud/);
  });

  it("kent de uitzonderingen die onderhoud wél financieren", () => {
    for (const naam of [
      "Brabants Erfgoedfonds",
      "Popp Snijders Bomenfonds (Cultuurfonds)",
      "Bouwman Boerema Fonds",
      "Stichting Volkskracht Natuurmonumenten",
    ]) {
      const o = toetsKostensoort(fonds({ naam, kostensoort: [] }), {
        kostensoort: "regulier_onderhoud",
      });
      expect(o.uitkomst, naam).toBe("doorgelaten");
    }
  });

  it("geeft onbekend als het fonds nog geen kostensoorten heeft", () => {
    const o = toetsKostensoort(fonds({ kostensoort: [] }), { kostensoort: "regulier_onderhoud" });
    expect(o.uitkomst).toBe("onbekend");
    expect(o.herkadering).toBeTruthy();
  });
});

// ── De poort als geheel + trechtercijfers ──────────────────────────────────

describe("toetsPoort", () => {
  it("laat een passend fonds door zonder waarschuwingen", () => {
    const o = toetsPoort(fonds({ criteria: [RECHTSVORM_EIS] }), profiel());
    expect(o.uitkomst).toBe("doorgelaten");
    expect(o.waarschuwingen).toEqual([]);
  });

  it("laat afvallen zwaarder wegen dan onbekend, en noemt de eerste afvalreden", () => {
    const o = toetsPoort(
      fonds({ benaderbaarheid: "onbekend", geo_niveau: "internationaal", geo_waarden: ["Azië"] }),
      profiel(),
    );
    expect(o.uitkomst).toBe("afgevallen");
    expect(o.reden).toMatch(/buiten Nederland/);
    // De waarschuwing van de benaderbaarheidspoort blijft zichtbaar.
    expect(o.waarschuwingen.length).toBe(1);
  });

  it("evalueert ALLE poorten, ook na een afvaller (anders geen trechtercijfers)", () => {
    const o = toetsPoort(fonds({ benaderbaarheid: "gesloten" }), profiel());
    expect(o.poorten).toHaveLength(8);
  });

  it("houdt een fonds met een ander handelingsperspectief in de lijst", () => {
    const o = toetsPoort(
      fonds({ benaderbaarheid: "via_intermediair", aanvrager_type: "derde_partij" }),
      profiel(),
    );
    expect(o.uitkomst).not.toBe("afgevallen");
    expect(o.acties).toHaveLength(2);
  });

  it("knijpt bij projectstatus gegund alles af, ongeacht het fonds", () => {
    const o = toetsPoort(fonds({}), profiel(), { projectstatus: "gegund" });
    expect(o.uitkomst).toBe("afgevallen");
  });
});

describe("trechtercijfers", () => {
  it("telt per poort en per hoofdreden", () => {
    const oordelen = [
      toetsPoort(fonds({ id: "a" }), profiel()),
      toetsPoort(fonds({ id: "b", benaderbaarheid: "gesloten" }), profiel()),
      toetsPoort(
        fonds({ id: "c", geo_niveau: "regio", geo_waarden: ["Kennemerland"] }),
        profiel(),
      ),
    ];
    const t = trechter(oordelen);
    expect(t.totaal).toBe(3);
    expect(t.doorgelaten).toBe(1);
    expect(t.afgevallen).toBe(1);
    expect(t.onbekend).toBe(1);
    expect(t.hoofdreden.benaderbaarheid).toBe(1);
    expect(t.per_poort.geografie.onbekend).toBe(1);
    expect(t.per_poort.geografie.door).toBe(2);
  });

  // Twee soorten onwetendheid. Voorstel-rijen zijn nog nooit onderzocht; die
  // meetellen als "onbekend" meet de achterstand van de verrijking, niet de
  // scherpte van het filter.
  it("houdt nog niet onderzochte voorstel-rijen buiten de noemer", () => {
    const oordelen = [
      toetsPoort(fonds({ id: "a", herkomst: "geverifieerd_bron" }), profiel()),
      toetsPoort(fonds({ id: "v1", herkomst: "ai_voorstel", geo_niveau: null }), profiel()),
      toetsPoort(fonds({ id: "v2", herkomst: "ai_voorstel", geo_niveau: null }), profiel()),
    ];
    const t = trechter(oordelen);
    expect(t.totaal).toBe(1);
    expect(t.niet_onderzocht).toBe(2);
    expect(t.totaal_in_catalogus).toBe(3);
    expect(t.doorgelaten).toBe(1);
    expect(t.onbekend).toBe(0);
    // Ook per poort tellen ze niet mee.
    expect(t.per_poort.geografie.onbekend).toBe(0);
  });

  it("rekent een voorstel-rij met een gelezen bron wél als onderzocht", () => {
    expect(isOnderzocht(fonds({ herkomst: "ai_voorstel", bronlezingen: 1 }))).toBe(true);
    expect(isOnderzocht(fonds({ herkomst: "ai_voorstel", bronlezingen: 0 }))).toBe(false);
    expect(isOnderzocht(fonds({ herkomst: "geverifieerd_bron" }))).toBe(true);
    expect(isOnderzocht(fonds({ herkomst: "afgeleid_tag" }))).toBe(true);
    // Zonder herkomst geen aanleiding om iets als onvoltooid te bestempelen.
    expect(isOnderzocht(fonds({}))).toBe(true);
  });

  it("markeert het oordeel zelf ook, zodat de pagina kan splitsen", () => {
    expect(toetsPoort(fonds({ herkomst: "ai_voorstel" }), profiel()).onderzocht).toBe(false);
    expect(toetsPoort(fonds({ herkomst: "geverifieerd_bron" }), profiel()).onderzocht).toBe(true);
  });
});
