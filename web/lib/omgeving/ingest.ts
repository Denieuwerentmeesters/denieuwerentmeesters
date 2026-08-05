// De regels van de omgevingsradar: welke termijn hoort bij een besluit, wanneer
// geldt het vangnet, en welke bestuursorganen publiceren gebiedsdekkend.
//
// Het ophalen zelf staat in publicaties.ts (per bestuursorgaan, gedeeld) en het
// matchen in de SQL-functie omgeving_match_landgoed (per landgoed). Die
// scheiding is er omdat een bekendmaking en zijn coördinaat niet
// landgoed-afhankelijk zijn: tien landgoederen in dezelfde gemeente deelden
// eerst niets en deden alles tien keer.
//
// Let op de volgorde in die keten: het moduleplan ging uit van "eerst de
// ruimtelijke poort, dan pas kosten maken", maar dat kan niet — bekendmakingen
// dragen geen geometrie, dus geocoderen moet érvoor. Wat wél vooraan kan is het
// documenttype, en dat filter is gratis.

// Termijnen die uit het documenttype volgen. Rekenwerk, geen AI — en daarom
// betrouwbaar. Zes weken is de standaard onder de Awb.
const TERMIJN_WEKEN: Record<string, { soort: string; weken: number }> = {
  omgevingsvergunning: { soort: "bezwaar", weken: 6 },
  omgevingsplan: { soort: "zienswijze", weken: 6 },
  bestemmingsplan: { soort: "zienswijze", weken: 6 },
  omgevingsverordening: { soort: "zienswijze", weken: 6 },
  peilbesluit: { soort: "zienswijze", weken: 6 },
  "verkeersbesluit of -mededeling": { soort: "bezwaar", weken: 6 },
};

// Een verordening of plan draagt zijn besluitsoort niet in de rubriek maar in
// de titel: "Ontwerpbesluit wijziging van de Waterschapsverordening" of
// "Inspraak ontwerp Kostentoedelingsverordening". Dat is het moment waarop een
// zienswijze nog kan — en volgens het moduleplan de kern van de module.
const ZIENSWIJZE_IN_TITEL =
  /\b(ontwerp|ontwerpbesluit|terinzagelegging|ter inzage|inspraak|voorontwerp)\b/i;

export function termijnVoor(rubriek: string | null, datum: string | null, titel = "") {
  if (!datum) return null;
  if (ZIENSWIJZE_IN_TITEL.test(titel)) {
    const d = new Date(datum);
    if (Number.isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + 6 * 7);
    return { soort: "zienswijze", einddatum: d.toISOString().slice(0, 10) };
  }
  if (!rubriek) return null;
  const t = TERMIJN_WEKEN[rubriek];
  if (!t) return null;
  const d = new Date(datum);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + t.weken * 7);
  return { soort: t.soort, einddatum: d.toISOString().slice(0, 10) };
}

// Rubrieken waarbij een gemiste termijn werkelijk onherstelbaar is: plannen en
// verordeningen waar je één keer een zienswijze op kunt indienen. Een
// omgevingsvergunning staat er bewust NIET bij — dat is verreweg het grootste
// volume en het gaat meestal om een dakkapel drie kilometer verderop.
const VANGNET_RUBRIEKEN = new Set([
  "omgevingsplan",
  "bestemmingsplan",
  "omgevingsverordening",
  "waterschapsverordening",
  "peilbesluit",
  "verordeningen",
]);

/**
 * De vangnetregel: mag een bericht dat we niet konden plaatsen tóch bewaard
 * worden?
 *
 * Eerste opzet zei "ja, zodra er een termijn aan hangt". Dat bleek veel te
 * ruim: van de eerste 49 bewaarde berichten waren er 46 op deze manier
 * binnengekomen, vrijwel allemaal gewone vergunningen kilometers verderop.
 * De regel was bedoeld als zeldzame uitzondering, niet als hoofdingang.
 *
 * Nu drie voorwaarden tegelijk: het is niet te plaatsen, de termijn loopt nog,
 * en het gaat om een besluitsoort waar missen echt onherstelbaar is.
 */
export function vangnetGeldt(
  status: string,
  termijn: { soort: string; einddatum: string } | null,
  rubriek: string | null,
): boolean {
  if (status === "geplaatst") return false;
  if (!termijn) return false;

  // Een termijn die al verstreken is helpt niemand meer. Dit is wat een
  // eerste ronde over twaalf maanden anders volstopt met oud nieuws.
  if (termijn.einddatum < new Date().toISOString().slice(0, 10)) return false;

  // Een zienswijze is de onherstelbare: daarna is het plan vastgesteld.
  if (termijn.soort === "zienswijze") return true;

  return rubriek != null && VANGNET_RUBRIEKEN.has(rubriek.toLowerCase());
}

/** Publiceert dit bestuursorgaan over een gebied dat veel groter is dan het landgoed? */
export function gebiedsdekkend(bestuurslaag: string): boolean {
  return bestuurslaag === "provincie" || bestuurslaag === "waterschap" || bestuurslaag === "rijk";
}
