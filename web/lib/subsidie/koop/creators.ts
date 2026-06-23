// Alle 12 provincies als KOOP-creator. De schrijfwijze verschilt per register:
//  - CVDR (voorraad): vaak alleen de naam, bv. 'Zeeland'  (geverifieerd: creator=Zeeland -> 1582 records).
//  - officiële publicaties (stroom): vaak met voorvoegsel, bv. 'provincie Zeeland'.
// Gemeenten/waterschappen later toe te voegen met dezelfde structuur (alleen creator wisselt).

export type Creator = {
  cvdr: string; // creator-waarde op de CVDR-connectie
  publicaties: string; // creator-waarde op de officielepublicaties-connectie
  bestuurslaag: "provincie";
};

export const PROVINCIE_CREATORS: Creator[] = [
  { cvdr: "Drenthe", publicaties: "provincie Drenthe", bestuurslaag: "provincie" },
  { cvdr: "Flevoland", publicaties: "provincie Flevoland", bestuurslaag: "provincie" },
  { cvdr: "Fryslân", publicaties: "provincie Fryslân", bestuurslaag: "provincie" },
  { cvdr: "Gelderland", publicaties: "provincie Gelderland", bestuurslaag: "provincie" },
  { cvdr: "Groningen", publicaties: "provincie Groningen", bestuurslaag: "provincie" },
  { cvdr: "Limburg", publicaties: "provincie Limburg", bestuurslaag: "provincie" },
  { cvdr: "Noord-Brabant", publicaties: "provincie Noord-Brabant", bestuurslaag: "provincie" },
  { cvdr: "Noord-Holland", publicaties: "provincie Noord-Holland", bestuurslaag: "provincie" },
  { cvdr: "Overijssel", publicaties: "provincie Overijssel", bestuurslaag: "provincie" },
  { cvdr: "Utrecht", publicaties: "provincie Utrecht", bestuurslaag: "provincie" },
  { cvdr: "Zeeland", publicaties: "provincie Zeeland", bestuurslaag: "provincie" },
  { cvdr: "Zuid-Holland", publicaties: "provincie Zuid-Holland", bestuurslaag: "provincie" },
];
