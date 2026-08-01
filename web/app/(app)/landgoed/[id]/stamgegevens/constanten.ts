// Gedeelde stamgegevens-constanten — één bron voor de profiel- én stamgegevenspagina.
// (Voorheen stonden deze lijsten dubbel; scheefgroei tussen de twee kopieën was
// een kwestie van tijd.)

// Labels voor ALLE categorieën die de database-constraint toestaat (0018).
export const CATEGORIE_LABEL: Record<string, string> = {
  gebouw: "Gebouwen",
  woning: "Woningen",
  opstal: "Opstallen",
  pachtperceel: "Pachtpercelen",
  natuurbeheertype: "Natuurbeheertypen",
  onderhoudszone: "Onderhoudszones",
  risicoplek: "Risicoplekken",
  wandelroute: "Wandelroutes",
  weg_pad: "Wegen & paden",
  bomenlaan: "Bomenlanen",
  kabel_leiding: "Kabels & leidingen",
  waterloop: "Waterlopen",
  brug: "Bruggen",
  hek: "Hekken",
  vijver_sloot: "Vijvers & sloten",
  tuin: "Tuinen",
  natuur: "Natuur",
  infrastructuur: "Infrastructuur",
  water: "Water",
  rijksmonument: "Rijksmonumenten",
  overig: "Overig",
};

// De gangbare categorieën voor het handmatig-toevoegen-formulier (bewust kort).
export const HANDMATIG_CATEGORIEEN = [
  "gebouw",
  "woning",
  "opstal",
  "pachtperceel",
  "tuin",
  "natuur",
  "infrastructuur",
  "water",
  "overig",
];

export const GEBRUIK_OPTIES = [
  "Wonen",
  "Bedrijf",
  "Natuur",
  "Agrarisch",
  "Water",
  "Recreatie",
  "Maatschappelijk",
];

// Opties voor het bewerk-formulier: ALLE categorieën, plus — als vangnet — de
// huidige waarde van het object als die (bv. legacy-data) buiten de lijst valt.
// Dit repareert de bug waarbij een <select> zonder passende optie stilzwijgend
// terugviel op de eerste optie en het object bij opslaan "gebouw" werd.
export function categorieOptiesVoor(huidige?: string): [string, string][] {
  const opties: [string, string][] = Object.entries(CATEGORIE_LABEL);
  if (huidige && !(huidige in CATEGORIE_LABEL)) {
    opties.push([huidige, `${huidige} (onbekende categorie)`]);
  }
  return opties;
}
