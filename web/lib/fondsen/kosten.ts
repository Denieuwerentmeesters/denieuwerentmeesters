import { GEEN_GEBRUIK, type Tokengebruik } from "@/lib/ai";

// Wat kost één zoekopdracht? (fase 3, §5 van het implementatieplan)
//
// WAAROM DIT EEN EIGEN BESTAND IS
// De volgorde van de drie lagen — poort, dan goedkope weging, dan pas het model —
// bestaat om de rekenkosten laag te houden. Een kostenregel die je niet meet is
// een bewering. Daarom rekent elke zoekopdracht zijn eigen tokens om naar euro's,
// logt dat, en bewaart het bij de uitkomst. Wordt de radar ooit duurder dan
// verwacht, dan is per vraag terug te zien waar dat vandaan kwam.
//
// De prijzen staan per miljoen tokens, in dollars, zoals de leverancier ze
// publiceert. Ze veranderen; daarom staan ze op één plek en niet verspreid.
// Cache-schrijven kost 1,25x een gewoon invoertoken, cache-lezen 0,1x.

export type Prijs = { invoer: number; uitvoer: number };

export const PRIJZEN_PER_MTOK: Record<string, Prijs> = {
  "claude-sonnet-4-6": { invoer: 3, uitvoer: 15 },
  "claude-sonnet-4-5": { invoer: 3, uitvoer: 15 },
  "claude-haiku-4-5": { invoer: 1, uitvoer: 5 },
  "claude-opus-4-1": { invoer: 15, uitvoer: 75 },
};

// Onbekend model: reken met het duurste tarief dat we kennen in plaats van met
// nul. Een kostenmeting die stilletjes op 0 uitkomt is erger dan een te hoge.
export const ONBEKEND_TARIEF: Prijs = { invoer: 15, uitvoer: 75 };

export const CACHE_SCHRIJF_FACTOR = 1.25;
export const CACHE_LEES_FACTOR = 0.1;

export function tarief(model: string): Prijs {
  return PRIJZEN_PER_MTOK[model] ?? ONBEKEND_TARIEF;
}

// Dollars voor één aanroep. Bewust in dollars: dat is de eenheid waarin de
// leverancier factureert, en een wisselkoers erbij verzinnen maakt het cijfer
// minder controleerbaar in plaats van meer.
export function kostenVanAanroep(model: string, g: Tokengebruik): number {
  const p = tarief(model);
  const invoer =
    g.invoer +
    g.cache_geschreven * CACHE_SCHRIJF_FACTOR +
    g.cache_gelezen * CACHE_LEES_FACTOR;
  return (invoer * p.invoer + g.uitvoer * p.uitvoer) / 1_000_000;
}

export type Aanroepkosten = {
  stap: string;
  model: string;
  gebruik: Tokengebruik;
  dollars: number;
};

export type Kostenoverzicht = {
  aanroepen: Aanroepkosten[];
  dollars: number;
  // Wat dezelfde vraag zónder cache zou hebben gekost. Dit is het getal waarmee
  // de cache-haak in lib/ai.ts te verantwoorden is: gelezen cache-tokens tellen
  // hier voor de volle prijs en geschreven tokens zonder de 1,25-opslag.
  dollars_zonder_cache: number;
  tokens_invoer: number;
  tokens_uitvoer: number;
  tokens_uit_cache: number;
};

export function telKosten(aanroepen: Aanroepkosten[]): Kostenoverzicht {
  let zonder = 0;
  for (const a of aanroepen) {
    const p = tarief(a.model);
    const invoer = a.gebruik.invoer + a.gebruik.cache_geschreven + a.gebruik.cache_gelezen;
    zonder += (invoer * p.invoer + a.gebruik.uitvoer * p.uitvoer) / 1_000_000;
  }
  return {
    aanroepen,
    dollars: aanroepen.reduce((s, a) => s + a.dollars, 0),
    dollars_zonder_cache: zonder,
    tokens_invoer: aanroepen.reduce(
      (s, a) => s + a.gebruik.invoer + a.gebruik.cache_geschreven + a.gebruik.cache_gelezen,
      0,
    ),
    tokens_uitvoer: aanroepen.reduce((s, a) => s + a.gebruik.uitvoer, 0),
    tokens_uit_cache: aanroepen.reduce((s, a) => s + a.gebruik.cache_gelezen, 0),
  };
}

export function legeKosten(): Kostenoverzicht {
  return telKosten([]);
}

export function boekAanroep(
  stap: string,
  model: string,
  gebruik: Tokengebruik = GEEN_GEBRUIK,
): Aanroepkosten {
  return { stap, model, gebruik, dollars: kostenVanAanroep(model, gebruik) };
}

// Eén regel per zoekopdracht in het serverlog. Kort genoeg om te lezen,
// gedetailleerd genoeg om een uitschieter te herkennen.
export function logKosten(context: string, k: Kostenoverzicht): void {
  const delen = k.aanroepen
    .map(
      (a) =>
        `${a.stap}=$${a.dollars.toFixed(4)} (${a.gebruik.invoer}+${a.gebruik.cache_geschreven}w+${a.gebruik.cache_gelezen}r in / ${a.gebruik.uitvoer} uit)`,
    )
    .join(" · ");
  console.log(
    `[fondsen-zoek] ${context} totaal=$${k.dollars.toFixed(4)} ` +
      `zonder-cache=$${k.dollars_zonder_cache.toFixed(4)} ${delen}`,
  );
}
