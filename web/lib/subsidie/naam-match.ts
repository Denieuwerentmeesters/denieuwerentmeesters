// Herkent of twee subsidie-namen dezelfde onderliggende regeling beschrijven,
// ook als ze uit verschillende bronnen komen met net andere bewoording
// (bv. "SKNL — Kwaliteitsimpuls Natuur en Landschap" uit een document vs.
// "SKNL Zeeland — Subsidie Kwaliteitsimpuls Natuur en Landschap" uit de
// catalogus). Simpele naive substring-vergelijking mist zulke gevallen — dit
// gebruikt token-overlap zodat woordvolgorde/toevoegingen niet uitmaken.

const STOPWOORDEN = new Set([
  "de", "het", "een", "en", "van", "voor", "op", "in", "aan", "met", "tot",
  "subsidie", "subsidieregeling", "regeling", "provincie", "provinciale",
  "rijk", "gemeente",
  // Generieke thema-woorden die in veel uiteenlopende regelingnamen terugkomen
  // (bv. "SKNL — Kwaliteitsimpuls Natuur en Landschap" vs. "SKNL Kwaliteitsimpuls
  // — Alle Provincies (via BIJ12)", waar de tweede naam "natuur"/"landschap"
  // simpelweg weglaat) — zonder deze filtering wordt zo'n paar ten onrechte als
  // "verschillend" gezien puur omdat de kortere naam relatief minder overlapt.
  "natuur", "landschap",
]);

function tokeniseer(naam: string): string[] {
  return (naam ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWOORDEN.has(t));
}

const ZELFDE_DREMPEL = 0.6;
const MIN_GEDEELDE_TOKENS = 2;

// Fractie van de kleinste tokenset die in beide namen voorkomt (0..1).
export function naamOverlap(a: string, b: string): number {
  const ta = new Set(tokeniseer(a));
  const tb = new Set(tokeniseer(b));
  if (!ta.size || !tb.size) return 0;
  let gedeeld = 0;
  ta.forEach((t) => {
    if (tb.has(t)) gedeeld++;
  });
  return gedeeld / Math.min(ta.size, tb.size);
}

// Beslist of twee namen "dezelfde regeling" zijn. Vereist minstens 2 gedeelde
// betekenisvolle woorden (voorkomt valse match op één toevallig woord) —
// behalve als één van de namen zelf maar 1 woord heeft, dan moet dat exact matchen.
export function zijnZelfdeRegeling(a: string, b: string): boolean {
  const ta = new Set(tokeniseer(a));
  const tb = new Set(tokeniseer(b));
  if (!ta.size || !tb.size) return false;
  let gedeeld = 0;
  ta.forEach((t) => {
    if (tb.has(t)) gedeeld++;
  });
  const kleinste = Math.min(ta.size, tb.size);
  if (kleinste === 1) return gedeeld === 1;
  return gedeeld >= MIN_GEDEELDE_TOKENS && gedeeld / kleinste >= ZELFDE_DREMPEL;
}

// Zwakker signaal dan `zijnZelfdeRegeling`: "dit lijkt erop, kijk er zelf naar".
// Bedoeld voor de nevenreden 'dubbel' — degraderen, nooit onderdrukken.
const LIJKT_DREMPEL = 0.4;

// Waarschijnlijk dezelfde regeling, maar niet zeker genoeg om te onderdrukken.
// Eén gedeeld betekenisvol woord is genoeg MITS de kortste naam er weinig heeft:
// "SNL — Natuur- en Landschapsbeheer" houdt na stopwoordfiltering {snl,
// landschapsbeheer} over, en overlapt met "Subsidieverordening Natuur- en
// Landschapsbeheer Zeeland" op precies één woord (0.5) — te weinig voor
// `zijnZelfdeRegeling`, ruim genoeg om de gebruiker te laten kijken.
//
// LET OP de grens hiervan: acroniemen worden niet herkend. "Subsidieverordening
// inrichting landelijk gebied Zeeland" en "SKNL — Kwaliteitsimpuls Natuur en
// Landschap" delen geen enkel woord en blijven dus onopgemerkt, ook al is het
// vermoedelijk dezelfde regeling. Daarom kan de gebruiker 'dubbel' ook zelf zetten.
export function lijktOpRegeling(a: string, b: string): boolean {
  if (zijnZelfdeRegeling(a, b)) return false; // die wordt al onderdrukt
  const ta = new Set(tokeniseer(a));
  const tb = new Set(tokeniseer(b));
  if (!ta.size || !tb.size) return false;
  let gedeeld = 0;
  ta.forEach((t) => {
    if (tb.has(t)) gedeeld++;
  });
  if (gedeeld === 0) return false;
  return gedeeld / Math.min(ta.size, tb.size) >= LIJKT_DREMPEL;
}

// Zoekt in een catalogus de beste naammatch boven de drempel (of null).
export function vindBesteRegelingMatch<T extends { naam: string }>(
  naam: string,
  catalogus: T[],
): T | null {
  let beste: T | null = null;
  let besteScore = 0;
  for (const c of catalogus) {
    if (!zijnZelfdeRegeling(naam, c.naam)) continue;
    const score = naamOverlap(naam, c.naam);
    if (score > besteScore) {
      beste = c;
      besteScore = score;
    }
  }
  return beste;
}
