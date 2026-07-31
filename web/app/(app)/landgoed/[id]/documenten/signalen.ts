// Signaalregel per categorieblok. Apart gehouden van de pagina zodat de termijnen
// op één plek staan en in een test vast te leggen zijn.
//
// De termijnen verschillen bewust per soort: een verlopen keuring is een direct
// probleem (rood), een aflopende subsidiebeschikking of vergunning vraagt om
// voorbereidingstijd maar is niet acuut (amber, ruimer venster).

import type { Signaal } from "./DocumentBlok";
import { NOG_IN_TE_DELEN } from "./categorieen";

export type DocumentFeit = {
  categorie: string;
  geldig_tot: string | null;
  aangemaakt_op: string | null;
};

const DAG = 24 * 60 * 60 * 1000;

/** Venster in dagen waarbinnen een aflopende geldigheid amber wordt. */
const VENSTER: Record<string, number> = {
  keuringen: 60,
  subsidies: 90,
  vergunningen: 90,
};

export function bepaalSignaal(
  categorie: string,
  documenten: DocumentFeit[],
  nu: Date = new Date(),
): { signaal: Signaal; tekst: string } {
  if (categorie === NOG_IN_TE_DELEN) {
    return documenten.length > 0
      ? {
          signaal: "amber",
          tekst: `${documenten.length} ${documenten.length === 1 ? "stuk wacht" : "stukken wachten"} op indeling`,
        }
      : { signaal: "grijs", tekst: "Niets meer in te delen" };
  }

  const venster = VENSTER[categorie];
  if (venster) {
    const metDatum = documenten.filter((d) => d.geldig_tot);
    const verlopen = metDatum.filter((d) => new Date(d.geldig_tot!) < nu);
    // Alleen keuringen worden rood: een verlopen keuring is een direct risico,
    // een verlopen beschikking is administratief.
    if (categorie === "keuringen" && verlopen.length > 0) {
      return {
        signaal: "rood",
        tekst: `${verlopen.length} ${verlopen.length === 1 ? "keuring is" : "keuringen zijn"} verlopen`,
      };
    }
    const bijna = metDatum.filter((d) => {
      const t = new Date(d.geldig_tot!).getTime();
      return t >= nu.getTime() && t - nu.getTime() <= venster * DAG;
    });
    if (bijna.length > 0) {
      return {
        signaal: "amber",
        tekst: `${bijna.length} ${bijna.length === 1 ? "loopt" : "lopen"} af binnen ${venster} dagen`,
      };
    }
    if (metDatum.length > 0) {
      return { signaal: "grijs", tekst: "Geen aflopende termijn" };
    }
  }

  return { signaal: "grijs", tekst: laatsteRegel(documenten) };
}

/** Eén regel context: wanneer er voor het laatst iets is toegevoegd. */
export function laatsteRegel(documenten: DocumentFeit[]): string {
  const datums = documenten
    .map((d) => d.aangemaakt_op)
    .filter((d): d is string => Boolean(d))
    .sort();
  const laatste = datums[datums.length - 1];
  if (!laatste) return "Nog niets toegevoegd";
  return `Laatst toegevoegd ${new Date(laatste).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })}`;
}
