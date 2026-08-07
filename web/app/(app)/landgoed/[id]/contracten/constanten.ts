// Gedeelde contract-constanten (Hugo module 6): één bron voor het register,
// het dossier en de acties. De waarden spiegelen de check-constraints in
// migratie 0062; status heeft bewust géén DB-constraint (legacy-data), dus
// de app bewaakt de lijst.

export const CONTRACT_TYPE_LABEL: Record<string, string> = {
  pacht: "Pacht",
  erfpacht: "Erfpacht",
  huur: "Huur",
  beheer: "Beheer",
};

export const CONTRACT_STATUS_LABEL: Record<string, string> = {
  concept: "Concept",
  actief: "Actief",
  beeindiging_aangekondigd: "Beëindiging aangekondigd",
  beeindigd: "Beëindigd",
};

export const PACHTVORM_LABEL: Record<string, string> = {
  reguliere_pacht: "Reguliere pacht",
  geliberaliseerde_pacht: "Geliberaliseerde pacht",
  teeltpacht: "Teeltpacht",
  natuurpacht: "Natuurpacht",
  overig: "Overig",
};

export const LOOPTIJD_LABEL: Record<string, string> = {
  bepaald: "Bepaalde tijd",
  onbepaald: "Onbepaalde tijd",
};

// Partijrollen: de juridische kant (verpachter/pachter, verhuurder/huurder)
// plus een neutrale terugval voor bv. beheerovereenkomsten.
export const PARTIJ_ROL_LABEL: Record<string, string> = {
  verpachter: "Verpachter",
  pachter: "Pachter",
  verhuurder: "Verhuurder",
  huurder: "Huurder",
  partij: "Partij",
};

// Welke rollen liggen voor de hand bij welk contracttype (de volledige
// lijst blijft altijd kiesbaar — dit stuurt alleen de standaardkeuze).
export function standaardRolVoorType(type: string | null): string {
  if (type === "pacht" || type === "erfpacht") return "pachter";
  if (type === "huur") return "huurder";
  return "partij";
}
