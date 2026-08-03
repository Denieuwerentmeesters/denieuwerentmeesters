// Bewaakt de 3857-valkuil.
//
// De perceelvormen staan in EPSG:3857 (Web Mercator) omdat de kaart daarin
// tekent. Maar Mercator is op 52° noorderbreedte ~1,62x uitgerekt in de lengte
// en ~2,62x in oppervlakte. Rekenen op die vormen levert stelselmatig verkeerde
// uitkomsten op — zonder foutmelding, dus onopgemerkt. Gemeten op de eigen data:
// 602.916 m2 volgens het Kadaster tegen 1.555.318 op geom_3857.
//
// Sinds migratie 0041 is er een echte RD-kolom (geom_rd, EPSG:28992). Deze test
// houdt tegen dat er ooit weer een ruimtelijke berekening op de 3857-kolom komt.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const hier = dirname(fileURLToPath(import.meta.url));
const migratiesDir = join(hier, "..", "supabase", "migrations");

// Functies die een meting in meters teruggeven, en dus een metrisch stelsel
// nodig hebben. ST_Intersects/ST_Contains staan er bewust niet bij: die zijn
// projectie-onafhankelijk zolang beide kanten dezelfde SRID hebben.
const METRISCH = [
  "st_area",
  "st_distance",
  "st_dwithin",
  "st_buffer",
  "st_length",
  "st_perimeter",
];

function sqlRegels(): { bestand: string; nr: number; regel: string }[] {
  return readdirSync(migratiesDir)
    .filter((f) => f.endsWith(".sql"))
    .flatMap((bestand) =>
      readFileSync(join(migratiesDir, bestand), "utf8")
        .split("\n")
        .map((regel, i) => ({ bestand, nr: i + 1, regel }))
        // Commentaarregels tellen niet mee: die beschrijven de valkuil juist.
        .filter(({ regel }) => !regel.trimStart().startsWith("--")),
    );
}

describe("3857-valkuil", () => {
  it("geen metrische PostGIS-functie rechtstreeks op een 3857-kolom", () => {
    const fout = sqlRegels().filter(({ regel }) => {
      const r = regel.toLowerCase();
      if (!/geom_3857|deel_geom_3857/.test(r)) return false;
      return METRISCH.some((fn) => {
        // Alleen aanslaan als de 3857-kolom binnen de aanroep staat.
        const i = r.indexOf(fn + "(");
        return i !== -1 && /geom_3857/.test(r.slice(i));
      });
    });

    expect(
      fout.map((f) => `${f.bestand}:${f.nr}: ${f.regel.trim()}`),
      "Reken nooit in EPSG:3857 — gebruik geom_rd (28992). Zie 0041_geometrie_rd.sql.",
    ).toEqual([]);
  });

  it("de RD-kolommen bestaan en zijn 28992", () => {
    const sql = readdirSync(migratiesDir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(join(migratiesDir, f), "utf8"))
      .join("\n")
      .toLowerCase();

    expect(sql).toMatch(/add column if not exists geom_rd[^;]*28992/);
    expect(sql).toMatch(/add column if not exists deel_geom_rd[^;]*28992/);
  });

  it("elke RD-kolom heeft een GIST-index (anders scant de poort sequentieel)", () => {
    const sql = readdirSync(migratiesDir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(join(migratiesDir, f), "utf8"))
      .join("\n")
      .toLowerCase();

    for (const kolom of ["geom_rd", "deel_geom_rd"]) {
      expect(sql, `GIST-index ontbreekt op ${kolom}`).toMatch(
        new RegExp(`using gist \\(${kolom}\\)`),
      );
    }
  });
});
