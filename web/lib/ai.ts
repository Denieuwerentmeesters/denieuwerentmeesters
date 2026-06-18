import Anthropic from "@anthropic-ai/sdk";

// AI-laag. Alles env-gated: zonder ANTHROPIC_API_KEY blijven de handmatige
// flows in de app gewoon werken; AI-functies geven dan null terug.
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

export function aiBeschikbaar(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function client() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
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
    const tekst = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("");
    const schoon = tekst
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();
    return JSON.parse(schoon) as T;
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
