// Bewaakt dat de migratiemap de enige, ondubbelzinnige bron van waarheid blijft.
// Voorkomt dat de dubbele nummering (twee keer 0025) ooit terugkomt — dat brak
// de reproduceerbaarheid van de database.
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const migratiesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "supabase",
  "migrations",
);

const bestanden = readdirSync(migratiesDir).filter((f) => f.endsWith(".sql"));

describe("migratiebestanden", () => {
  it("hebben allemaal een 4-cijferig volgnummer als prefix", () => {
    const fout = bestanden.filter((f) => !/^\d{4}_.+\.sql$/.test(f));
    expect(fout, `Onjuiste naamgeving: ${fout.join(", ")}`).toEqual([]);
  });

  it("hebben allemaal een uniek volgnummer (geen dubbele prefixes)", () => {
    const nummers = bestanden.map((f) => f.slice(0, 4));
    const dubbel = [...new Set(nummers.filter((n, i) => nummers.indexOf(n) !== i))];
    expect(dubbel, `Dubbele migratienummers: ${dubbel.join(", ")}`).toEqual([]);
  });
});
