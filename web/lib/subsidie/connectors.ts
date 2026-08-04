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

  // ── Fondsenradar (Implementatieplan_Fondsenradar.md §1–§5, §9) ──
  // Optioneel: de bestaande subsidie-connectors laten dit leeg, waarna de
  // kolomdefaults gelden (soort_bron='subsidie', benaderbaarheid='onbekend').
  soort_bron?: "subsidie" | "fonds" | "lening" | "fiscaal" | "eigen_bijdrage";
  rechtskarakter?: "publiekrechtelijk" | "privaatrechtelijk" | "gemengd" | null;
  benaderbaarheid?:
    | "open"
    | "open_met_drempel"
    | "via_intermediair"
    | "op_uitnodiging"
    | "gesloten"
    | "onbekend";
  benaderwijze_notitie?: string | null;
  geo_niveau?:
    | "landelijk"
    | "provincie"
    | "regio"
    | "gemeente"
    | "plaats"
    | "internationaal"
    | null;
  geo_waarden?: string[] | null;
  bedrag_min?: number | null;
  bedrag_max?: number | null;
  bedrag_typisch?: number | null;
  bedrag_indicatie?: string | null;
  cofinanciering_vereist?: boolean | null;
  max_percentage_projectkosten?: number | null;
  financieringsrol?: "eerste_instapper" | "cofinancier" | "sluitpost" | "onbekend";
  kostensoort?: string[] | null;
  cooldown_maanden?: number | null;
  hercontrole_termijn?: number | null;
  plan_triggers?: string[] | null;
  contact?: string | null;
  // Per rij, want de fondsenlijst mengt geverifieerde en afgeleide kennis (§2).
  herkomst?:
    | "import"
    | "handmatig"
    | "afgeleid_tag"
    | "geverifieerd_bron"
    | "ai_voorstel";

  // De ruwe payload zoals opgehaald — gaat naar subsidie_snapshot.payload en
  // is de basis voor de wijzigings-hash.
  ruw: unknown;
};

export type Connector = {
  // Moet overeenkomen met subsidie_bron.sleutel.
  bronSleutel: string;
  haalOp(): Promise<RegelingNormaal[]>;
};

// ── Registry ──
// Concrete connectors leven in ./connectors/*; hier verzameld op bron-sleutel.
// (Bewust in dit bestand i.p.v. ./connectors/index.ts: een map én een
// gelijknamig bestand naast elkaar geeft een import-botsing.)
import { rvoConnector } from "./connectors/rvo";
import { koopCvdrConnector, koopPublicatiesConnector } from "./connectors/koop";

// De fondsen-connector staat BEWUST niet in deze registry: hij leest een
// bestand uit de repo in plaats van een externe feed, en POST
// /api/subsidie/import zonder `bron` hoort de fondsenlijst niet mee te nemen.
// Hij heeft een eigen route (/api/fondsen/import) en deelt alleen de runner.
export const CONNECTORS: Record<string, Connector> = {
  [rvoConnector.bronSleutel]: rvoConnector,
  [koopCvdrConnector.bronSleutel]: koopCvdrConnector,
  [koopPublicatiesConnector.bronSleutel]: koopPublicatiesConnector,
};

export function connectorsVoor(sleutel?: string | null): Connector[] {
  if (sleutel) {
    const c = CONNECTORS[sleutel];
    return c ? [c] : [];
  }
  return Object.values(CONNECTORS);
}
