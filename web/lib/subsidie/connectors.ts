// Connector-abstractie voor subsidiebronnen. Elke bron levert genormaliseerde
// regelingen (RegelingNormaal); de generieke runner in ingestie.ts schrijft die
// idempotent naar de catalogus en houdt snapshots bij voor nieuw-detectie.
//
// Spiegelt het bron-adapter-patroon uit lib/extractie.ts.

export type RegelingNormaal = {
  // Stabiele id binnen de bron — de idempotency-sleutel (samen met bron).
  extern_id: string;
  naam: string;
  organisatie?: string | null;
  samenvatting?: string | null;
  bron_url?: string | null;
  categorie?: "subsidie" | "carbon" | "groenblauw" | "regeling";
  scope?: "nationaal" | "provinciaal" | "gemeentelijk";
  provincie?: string | null;
  gemeenten?: string[] | null;
  creator?: string | null; // KOOP dcterms:creator
  bestuurslaag?: "rijk" | "provincie" | "gemeente" | "waterschap" | "samenwerkingsorgaan" | null;
  status?: "open" | "gesloten" | "onbekend" | null;
  themas?: string[] | null;
  trefwoorden?: string[] | null;
  doelgroepen?: string[] | null;
  sectoren?: string[] | null;
  is_tijdelijk?: boolean;
  openstelling_van?: string | null;
  openstelling_tot?: string | null;
  budget_indicatie?: string | null;
  // De ruwe payload zoals opgehaald — gaat naar subsidie_snapshot.payload en
  // is de basis voor de wijzigings-hash.
  ruw: unknown;
};

export type Connector = {
  // Moet overeenkomen met subsidie_bron.sleutel.
  bronSleutel: string;
  haalOp(): Promise<RegelingNormaal[]>;
};
