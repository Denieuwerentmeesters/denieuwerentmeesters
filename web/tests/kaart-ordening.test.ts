import { describe, expect, it } from "vitest";
import { ordenPercelenMetObjecten } from "@/components/kaartDelen";

// De percelen-lijst (besluit 6 aug, issue #130): beheerperceel als
// hoofditem, geprikte objecten ingesprongen eronder — in de groep van
// hún perceel — en ongekoppelde objecten apart als "los".

function obj(
  id: string,
  categorie: string,
  extra?: Partial<{ gebruik: string | null; staatOpId: string | null }>,
) {
  return {
    id,
    naam: `naam-${id}`,
    categorie,
    gebruik: extra?.gebruik ?? null,
    staatOpId: extra?.staatOpId ?? null,
  };
}

describe("ordenPercelenMetObjecten", () => {
  it("hangt een gekoppeld object ingesprongen onder zijn beheerperceel, in de groep van dat perceel", () => {
    const parkbos = obj("p1", "pachtperceel", { gebruik: "Natuur" });
    // Een vijver hoort qua eigen categorie onder "Water & Klimaat", maar
    // volgt zijn perceel naar de Natuur-groep.
    const vijver = obj("o1", "vijver_sloot", { staatOpId: "p1" });
    const { groepen, los } = ordenPercelenMetObjecten([parkbos, vijver]);

    const natuur = groepen.find(([label]) => label === "Natuur")![1];
    expect(natuur.map((r) => [r.item.id, r.ingesprongen])).toEqual([
      ["p1", false],
      ["o1", true],
    ]);
    const water = groepen.find(([label]) => label === "Water & Klimaat")![1];
    expect(water).toHaveLength(0);
    expect(los).toHaveLength(0);
  });

  it("zet een ongekoppeld object in het los-bakje, niet in een groep", () => {
    const boom = obj("o2", "boom");
    const { groepen, los } = ordenPercelenMetObjecten([boom]);
    expect(los.map((o) => o.id)).toEqual(["o2"]);
    expect(groepen.every(([, lijst]) => lijst.length === 0)).toBe(true);
  });

  it("behandelt een koppeling naar een niet-getoond doel als los", () => {
    const boom = obj("o3", "boom", { staatOpId: "bestaat-niet" });
    const { los } = ordenPercelenMetObjecten([boom]);
    expect(los.map((o) => o.id)).toEqual(["o3"]);
  });

  it("laat gebouwen buiten beschouwing (eigen tabblad)", () => {
    const schuur = obj("g1", "opstal", { staatOpId: "p1" });
    const parkbos = obj("p1", "pachtperceel", { gebruik: "Natuur" });
    const { groepen, los } = ordenPercelenMetObjecten([schuur, parkbos]);
    const alles = groepen.flatMap(([, lijst]) => lijst.map((r) => r.item.id));
    expect(alles).toEqual(["p1"]);
    expect(los).toHaveLength(0);
  });

  it("sorteert meerdere objecten onder één perceel op naam", () => {
    const perceel = obj("p1", "pachtperceel", { gebruik: "Natuur" });
    const b = { ...obj("o-b", "boom", { staatOpId: "p1" }), naam: "Beuk" };
    const a = { ...obj("o-a", "boom", { staatOpId: "p1" }), naam: "Acacia" };
    const { groepen } = ordenPercelenMetObjecten([perceel, b, a]);
    const natuur = groepen.find(([label]) => label === "Natuur")![1];
    expect(natuur.map((r) => r.item.naam)).toEqual([
      "naam-p1",
      "Acacia",
      "Beuk",
    ]);
  });
});
