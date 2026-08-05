// Bewaakt dat API-routes zonder ingelogde gebruiker langs de auth-proxy komen.
//
// Aanleiding: /api/omgeving/run stond niet in PUBLIEKE_PADEN. De proxy stuurde
// daardoor een 307 naar /login. Dat is een bijzonder stille fout, want
// Vercel-crons volgen géén redirects: de wekelijkse ronde zou elke woensdag
// "slagen" zonder ooit iets op te halen, en er zou niets in de logs staan wat
// op een probleem wijst.
//
// Deze routes bewaken zichzelf met een gedeeld geheim en zijn fail-closed;
// publiek langs de sessie-proxy is dus veilig én nodig.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const hier = dirname(fileURLToPath(import.meta.url));
const apiDir = join(hier, "..", "app", "api");
const middleware = readFileSync(
  join(hier, "..", "lib", "supabase", "middleware.ts"),
  "utf8",
);

/** Alle mappen direct onder app/api — dat zijn de route-groepen. */
function apiGroepen(): string[] {
  if (!existsSync(apiDir)) return [];
  return readdirSync(apiDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

describe("API-routes en de auth-proxy", () => {
  it("elke machine-aangeroepen API-groep staat in PUBLIEKE_PADEN", () => {
    // Groepen die juist wél een ingelogde gebruiker horen te hebben, staan hier
    // niet bij; die zijn er op dit moment niet.
    const ontbreekt = apiGroepen().filter(
      (g) => !middleware.includes(`"/api/${g}"`),
    );
    expect(
      ontbreekt,
      `Deze API-groepen ontbreken in PUBLIEKE_PADEN in lib/supabase/middleware.ts: ` +
        `${ontbreekt.join(", ")}. Zonder dat krijgt een scheduler een 307 naar /login ` +
        `in plaats van de route — en dat faalt stil.`,
    ).toEqual([]);
  });

  it("de omgevingsradar-ronde is bereikbaar voor de cron", () => {
    // Expliciet, want dit is de route waarop het misging.
    expect(middleware).toContain('"/api/omgeving"');
  });
});
