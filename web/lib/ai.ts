import Anthropic from "@anthropic-ai/sdk";

// AI-laag. Alles env-gated: zonder ANTHROPIC_API_KEY blijven de handmatige
// flows in de app gewoon werken; AI-functies geven dan null terug.
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

export function aiBeschikbaar(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function aiModel(): string {
  return MODEL;
}

function client() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
}

function parseJson<T>(res: Anthropic.Message): T {
  const tekst = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");
  const schoon = tekst
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  return JSON.parse(schoon) as T;
}

// Roept het model aan en verwacht puur JSON terug. Geeft null bij geen key/fout.
async function vraagJson<T>(systeem: string, prompt: string): Promise<T | null> {
  if (!aiBeschikbaar()) return null;
  try {
    const res = await client().messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systeem,
      messages: [{ role: "user", content: prompt }],
    });
    return parseJson<T>(res);
  } catch {
    return null;
  }
}

// Zelfde, maar met een PDF erbij (Claude leest PDF's native — geen parser nodig).
async function vraagJsonMetDocument<T>(
  systeem: string,
  prompt: string,
  pdf: { base64: string; mediaType: string },
): Promise<T | null> {
  if (!aiBeschikbaar()) return null;
  try {
    const res = await client().messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systeem,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: pdf.mediaType as "application/pdf",
                data: pdf.base64,
              },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    });
    return parseJson<T>(res);
  } catch {
    return null;
  }
}

// ── Transacties categoriseren ──
export type CategorieVoorstel = { index: number; categorie: string };

export async function categoriseerTransacties(
  items: { omschrijving: string; bedrag: number }[],
): Promise<CategorieVoorstel[] | null> {
  if (items.length === 0) return [];
  const lijst = items
    .map((t, i) => `${i}. ${t.bedrag} — ${t.omschrijving}`)
    .join("\n");
  return vraagJson<CategorieVoorstel[]>(
    "Je categoriseert banktransacties van een Nederlands landgoed. Categorieën: onderhoud, verzekering, belasting, pacht-opbrengst, huur-opbrengst, subsidie, energie, personeel, advieskosten, bankkosten, overig. Antwoord UITSLUITEND met een JSON-array van {index, categorie}.",
    `Transacties:\n${lijst}`,
  );
}

// ── Omgevingsbericht scoren ──
export type RelevantieOordeel = {
  samenvatting: string;
  relevantie_score: number;
  thema: string;
  motivering: string;
};

export async function scoorRelevantie(
  bericht: { titel: string; tekst: string },
  profiel: { provincie?: string; themas?: string[]; trefwoorden?: string[] },
): Promise<RelevantieOordeel | null> {
  return vraagJson<RelevantieOordeel>(
    "Je beoordeelt of een omgevingsbericht relevant is voor een specifiek landgoed. Score 0-100. Wees streng: alleen bijeenkomsten over relevante gebiedsprocessen en beleids-/regelwijzigingen die het landgoed raken scoren hoog. Antwoord UITSLUITEND met JSON {samenvatting, relevantie_score, thema, motivering}.",
    `Landgoed-profiel: provincie=${profiel.provincie ?? "?"}, themas=${(profiel.themas ?? []).join(", ")}, trefwoorden=${(profiel.trefwoorden ?? []).join(", ")}.\n\nBericht:\nTitel: ${bericht.titel}\nTekst: ${bericht.tekst}`,
  );
}

// ── Notulen uit transcript ──
export type NotulenResultaat = {
  samenvatting: string;
  notulen: string;
  besluiten: string[];
  actiepunten: { titel: string }[];
};

export async function maakNotulen(
  transcript: string,
): Promise<NotulenResultaat | null> {
  return vraagJson<NotulenResultaat>(
    "Je maakt notulen van een vergadering van een Nederlands landgoed. Geef beknopte notulen in gewone taal, een korte samenvatting, een lijst besluiten, en concrete actiepunten. Antwoord UITSLUITEND met JSON {samenvatting, notulen, besluiten: string[], actiepunten: [{titel}]}.",
    `Transcript:\n${transcript}`,
  );
}

// ── Stamgegevens-extractie (onboarding) ──
// AI leest een bron (document/tekst) en stelt stamobjecten + koppelingen voor.
// Niets verzinnen: laat een veld leeg als de bron het niet noemt ("liever een gat dan een aanname").

export type StamobjectVoorstel = {
  tijdelijk_id: string; // referentie binnen één extractie (voor koppelingen)
  categorie:
    | "gebouw"
    | "woning"
    | "opstal"
    | "pachtperceel"
    | "overig";
  naam: string;
  code?: string;
  beschrijving?: string;
  kenmerken?: Record<string, unknown>;
  reden: string; // onderbouwing waarom dit object uit de bron volgt
};

export type VerbandVoorstel = {
  bron_type: "contract" | "relatie" | "stamobject";
  bron_ref: string; // bestaande uuid, OF tijdelijk_id van een voorgesteld object
  doel_type: "stamobject" | "perceel" | "relatie";
  doel_ref: string;
  rol: string; // bv. 'huurder_van','betreft','gelegen_op','onderdeel_van'
  reden: string;
};

export type ExtractieResultaat = {
  objecten: StamobjectVoorstel[];
  koppelingen: VerbandVoorstel[];
};

export type ExtractieContext = {
  contracten: { id: string; label: string }[];
  relaties: { id: string; label: string }[];
  objecten: { id: string; label: string }[];
};

const STAMGEGEVENS_SYSTEEM =
  "Je helpt een Nederlands landgoed z'n stamgegevens opbouwen uit bronnen (documenten/administratie). " +
  "Haal de fysieke/juridische OBJECTEN eruit (alleen categorieën: gebouw, woning, opstal, pachtperceel, overig) " +
  "en leg KOPPELINGEN naar reeds bekende records (contracten, relaties/contacten, objecten) wanneer die duidelijk uit de bron volgen. " +
  "Belangrijk: verzin niets. Noemt de bron een gegeven niet, laat het veld dan leeg — liever een gat dan een aanname. " +
  "Categorie-specifieke details (bouwjaar, monumentstatus, adres, oppervlakte, functie) zet je in 'kenmerken' als losse sleutels. " +
  "Geef elk voorgesteld object een uniek 'tijdelijk_id' (bv. 'obj1'); verwijs daar in koppelingen naar, of naar een bestaande uuid. " +
  "Antwoord UITSLUITEND met JSON: {objecten: [{tijdelijk_id, categorie, naam, code?, beschrijving?, kenmerken?, reden}], " +
  "koppelingen: [{bron_type, bron_ref, doel_type, doel_ref, rol, reden}]}.";

function contextBlok(context: ExtractieContext): string {
  const r = (rows: { id: string; label: string }[]) =>
    rows.length ? rows.map((x) => `- ${x.id}: ${x.label}`).join("\n") : "(geen)";
  return (
    `Reeds bekende records (verwijs met hun uuid):\n` +
    `Contracten:\n${r(context.contracten)}\n` +
    `Relaties/contacten:\n${r(context.relaties)}\n` +
    `Bestaande objecten:\n${r(context.objecten)}`
  );
}

export async function extraheerUitDocument(
  pdf: { base64: string; mediaType: string },
  context: ExtractieContext,
): Promise<ExtractieResultaat | null> {
  return vraagJsonMetDocument<ExtractieResultaat>(
    STAMGEGEVENS_SYSTEEM,
    `${contextBlok(context)}\n\nLees het bijgevoegde document en stel objecten + koppelingen voor.`,
    pdf,
  );
}

export async function extraheerUitTekst(
  tekst: string,
  context: ExtractieContext,
): Promise<ExtractieResultaat | null> {
  return vraagJson<ExtractieResultaat>(
    STAMGEGEVENS_SYSTEEM,
    `${contextBlok(context)}\n\nBron-tekst:\n${tekst}\n\nStel objecten + koppelingen voor.`,
  );
}
