// Tegenstrijdige bedragen — de tweede soort tegenstrijdigheid.
//
// `vindTegenstrijdigheden` in lib/fondsen/dossier.ts vist de tegenstrijdigheden
// op die de verrijking in WOORDEN heeft opgeschreven. Er is een tweede soort die
// daar niet in zit: de vrije tekst (`bedrag_indicatie`) en de gestructureerde
// band (`bedrag_min` / `bedrag_max`) komen uit verschillende leesrondes en
// spreken elkaar soms tegen — "bijdragen tot € 50.000" naast een `bedrag_max`
// van 25000.
//
// Die botsing gladstrijken door er één te kiezen is precies wat de opdracht
// verbiedt: welke van de twee waar is, weet alleen de bron. Dus benoemen we hem,
// en laten we de gebruiker beslissen wat hij navraagt.
//
// BEWUST TERUGHOUDEND. Alleen een bedrag dat BUITEN de vastgelegde band valt
// telt als tegenstrijdig. Een tekst als "tot € 25.000 per jaar" naast een
// `bedrag_max` van 25000 zegt hetzelfde in andere woorden en mag geen melding
// opleveren — een melding die vaak onterecht is, wordt weggekeken, en dan mist
// de gebruiker ook de terechte.

/** Euro-bedragen uit vrije tekst. Nederlands formaat: punt = duizendtal. */
export function leesBedragen(tekst: string | null | undefined): number[] {
  const t = tekst ?? "";
  const gevonden: number[] = [];
  for (const m of t.matchAll(/(?:€|eur\b|euro\b)\s*([\d][\d.,]*)\s*(mln|miljoen|k\b)?/gi)) {
    const ruw = m[1].replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
    let waarde = Number(ruw);
    if (!Number.isFinite(waarde)) continue;
    const eenheid = (m[2] ?? "").toLowerCase();
    if (eenheid.startsWith("m")) waarde *= 1_000_000;
    else if (eenheid.startsWith("k")) waarde *= 1_000;
    if (waarde > 0) gevonden.push(waarde);
  }
  return gevonden;
}

export function euro(bedrag: number): string {
  return `€ ${bedrag.toLocaleString("nl-NL")}`;
}

/**
 * Botst de vrije tekst met de vastgelegde band? Levert de zinnen op die dat
 * zeggen; lege lijst als er niets aan de hand is (of als er niets vastligt —
 * ontbrekende gegevens zijn geen tegenstrijdigheid, alleen een gat).
 */
export function botsendeBedragen(
  indicatie: string | null | undefined,
  min: number | null | undefined,
  max: number | null | undefined,
): string[] {
  const bedragen = leesBedragen(indicatie);
  if (bedragen.length === 0) return [];
  const meldingen: string[] = [];
  const boven = typeof max === "number" ? bedragen.filter((b) => b > max) : [];
  const onder = typeof min === "number" ? bedragen.filter((b) => b < min) : [];
  if (boven.length > 0)
    meldingen.push(
      `De omschrijving noemt ${boven.map(euro).join(" en ")}, terwijl als bovengrens ${euro(
        max as number,
      )} is vastgelegd. Welke van de twee klopt, is uit de bron niet op te maken.`,
    );
  if (onder.length > 0)
    meldingen.push(
      `De omschrijving noemt ${onder.map(euro).join(" en ")}, terwijl als ondergrens ${euro(
        min as number,
      )} is vastgelegd. Welke van de twee klopt, is uit de bron niet op te maken.`,
    );
  return meldingen;
}
