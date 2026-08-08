// Wanneer verdient een aflopend contract aandacht? (wens Steven):
// kortlopende contracten (looptijd korter dan drie jaar, bv. teeltpacht of
// eenjarige geliberaliseerde pacht) een half jaar van tevoren, langlopende
// een jaar van tevoren. Puur en apart, zodat de tests hem direct raken.

const DAG_MS = 86_400_000;

export function verlengtermijnDagen(
  ingangsdatum: string | null,
  einddatum: string,
): number {
  if (ingangsdatum) {
    const looptijdJaren =
      (Date.parse(einddatum) - Date.parse(ingangsdatum)) / (365.25 * DAG_MS);
    if (looptijdJaren < 3) return 182;
  }
  // Onbekende ingangsdatum: behandel als langlopend — liever te vroeg
  // gewaarschuwd dan te laat.
  return 365;
}

export type AfloopOordeel = {
  dagen: number; // tot de einddatum; negatief = al verstreken
  oordeel: "verlopen" | "aandacht" | "rustig";
};

export function beoordeelAfloop(
  vandaag: string,
  ingangsdatum: string | null,
  einddatum: string | null,
): AfloopOordeel | null {
  if (!einddatum) return null;
  const dagen = Math.ceil((Date.parse(einddatum) - Date.parse(vandaag)) / DAG_MS);
  if (dagen < 0) return { dagen, oordeel: "verlopen" };
  return {
    dagen,
    oordeel:
      dagen <= verlengtermijnDagen(ingangsdatum, einddatum) ? "aandacht" : "rustig",
  };
}

// Leesbaar: dichtbij in dagen, verder weg in maanden.
export function afloopTekst(dagen: number): string {
  if (dagen < 0) return "verlopen";
  if (dagen === 0) return "vandaag";
  if (dagen <= 60) return `over ${dagen} dagen`;
  return `over ${Math.round(dagen / 30.44)} maanden`;
}
