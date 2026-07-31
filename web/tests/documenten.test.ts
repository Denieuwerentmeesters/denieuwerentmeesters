// Bewaakt de twee plekken waar de documentenmodule stil kan afglijden:
//
//   1. De categorielijst is de bron van waarheid voor de check-constraint in
//      migratie 0036, de keuzelijst in de UI én de classificatieprompt. Loopt hij
//      uit de pas met de migratie, dan faalt een upload pas in productie.
//   2. De relevantie- en signaalregels bepalen wat een gebruiker wél en niet ziet.
//      Die zijn met opzet pure functies, juist zodat ze hier vastgelegd kunnen worden.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATEGORIEEN,
  CATEGORIE_SLEUTELS,
  NOG_IN_TE_DELEN,
  bepaalRelevantie,
  isCategorie,
  isEntiteitRechtsvorm,
  isMedewerkerRol,
  type RelevantieFeiten,
} from "../app/(app)/landgoed/[id]/documenten/categorieen";
import { bepaalSignaal } from "../app/(app)/landgoed/[id]/documenten/signalen";

const hier = dirname(fileURLToPath(import.meta.url));
const migratie = readFileSync(
  join(hier, "..", "supabase", "migrations", "0036_document_categorie.sql"),
  "utf8",
);

describe("documentcategorieën", () => {
  it("staan allemaal in de check-constraint van migratie 0036", () => {
    const blok = migratie.slice(
      migratie.indexOf("document_categorie_check check"),
      migratie.indexOf("document_categorie_herkomst_check"),
    );
    const ontbreekt = CATEGORIE_SLEUTELS.filter((s) => !blok.includes(`'${s}'`));
    expect(ontbreekt, `Niet in de constraint: ${ontbreekt.join(", ")}`).toEqual([]);
  });

  it("heeft geen sleutels in de constraint die de code niet kent", () => {
    const blok = migratie.slice(
      migratie.indexOf("document_categorie_check check"),
      migratie.indexOf("document_categorie_herkomst_check"),
    );
    const inConstraint = [...blok.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    const onbekend = inConstraint.filter((s) => !isCategorie(s));
    expect(onbekend, `Onbekend in de code: ${onbekend.join(", ")}`).toEqual([]);
  });

  it("hebben een uniek label en (behalve nog_in_te_delen) trefwoorden", () => {
    const labels = CATEGORIEEN.map((c) => c.label);
    expect(new Set(labels).size).toBe(labels.length);
    const zonder = CATEGORIEEN.filter(
      (c) => c.sleutel !== NOG_IN_TE_DELEN && c.trefwoorden.length === 0,
    );
    expect(zonder.map((c) => c.sleutel)).toEqual([]);
  });
});

const LEEG: RelevantieFeiten = {
  heeftContracten: false,
  heeftLopendeSubsidies: false,
  rechtsvorm: null,
  heeftGebouwObjecten: false,
  heeftGroenObjecten: false,
  heeftMedewerkers: false,
  heeftGesprekken: false,
};

describe("relevantie van categorieblokken", () => {
  it("toont bij een kaal landgoed alleen eigendom_rechten als openstaand gat", () => {
    const uit = bepaalRelevantie(LEEG, {});
    const relevant = CATEGORIE_SLEUTELS.filter((s) => uit[s] === "relevant");
    expect(relevant).toEqual(["eigendom_rechten"]);
  });

  it("verbergt nog_in_te_delen zolang er niets in staat", () => {
    expect(bepaalRelevantie(LEEG, {}).nog_in_te_delen).toBe("verborgen");
    expect(bepaalRelevantie(LEEG, { nog_in_te_delen: 2 }).nog_in_te_delen).toBe("gevuld");
  });

  it("maakt een gevuld blok altijd zichtbaar, ook als het niet relevant heet", () => {
    expect(bepaalRelevantie(LEEG, { historisch: 1 }).historisch).toBe("gevuld");
  });

  it("opent governance zodra het landgoed een entiteit is", () => {
    expect(bepaalRelevantie({ ...LEEG, rechtsvorm: "particulier" }, {}).governance).toBe(
      "verborgen",
    );
    expect(bepaalRelevantie({ ...LEEG, rechtsvorm: "Stichting" }, {}).governance).toBe(
      "relevant",
    );
  });

  it("herkent entiteits- en medewerkersrollen ongeacht schrijfwijze", () => {
    expect(isEntiteitRechtsvorm("BV")).toBe(true);
    expect(isEntiteitRechtsvorm("particulier")).toBe(false);
    expect(isEntiteitRechtsvorm(null)).toBe(false);
    expect(isMedewerkerRol("Boswachter")).toBe(true);
    expect(isMedewerkerRol("pachter")).toBe(false);
  });
});

describe("signalen op de categorieblokken", () => {
  const nu = new Date("2026-07-31T12:00:00Z");
  const doc = (geldig_tot: string | null) => ({
    categorie: "keuringen",
    geldig_tot,
    aangemaakt_op: "2026-01-01T00:00:00Z",
  });

  it("maakt een verlopen keuring rood", () => {
    const { signaal } = bepaalSignaal("keuringen", [doc("2026-06-01")], nu);
    expect(signaal).toBe("rood");
  });

  it("maakt een keuring binnen 60 dagen amber, daarbuiten grijs", () => {
    expect(bepaalSignaal("keuringen", [doc("2026-08-20")], nu).signaal).toBe("amber");
    expect(bepaalSignaal("keuringen", [doc("2027-08-20")], nu).signaal).toBe("grijs");
  });

  it("hanteert voor vergunningen een ruimer venster van 90 dagen", () => {
    const ver = [{ ...doc("2026-10-15"), categorie: "vergunningen" }];
    expect(bepaalSignaal("vergunningen", ver, nu).signaal).toBe("amber");
    // Dezelfde datum valt bij keuringen al buiten het krappere venster van 60 dagen.
    expect(bepaalSignaal("keuringen", [doc("2026-10-15")], nu).signaal).toBe("grijs");
  });

  it("wordt bij een verlopen vergunning niet rood — dat is administratief, niet acuut", () => {
    const ver = [{ ...doc("2025-01-01"), categorie: "vergunningen" }];
    expect(bepaalSignaal("vergunningen", ver, nu).signaal).not.toBe("rood");
  });

  it("zet de werkvoorraad op amber zolang er iets in staat", () => {
    expect(bepaalSignaal(NOG_IN_TE_DELEN, [doc(null)], nu).signaal).toBe("amber");
    expect(bepaalSignaal(NOG_IN_TE_DELEN, [], nu).signaal).toBe("grijs");
  });
});
