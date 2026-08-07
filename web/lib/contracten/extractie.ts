import Anthropic from "@anthropic-ai/sdk";

// AI-invoer voor de contracten-keten (issue #152): een pdf van een
// pachtcontract wordt als document-blok naar de AI gestuurd, die de
// dossiervelden als strikt JSON teruggeeft. Bewust een eigen laag, los van
// de stamgegevens-extractie in lib/ai.ts — die staat op de nominatie voor
// ombouw (#91) en blijft hier onbelast.
//
// Huisregel: het resultaat is altijd een vóórstel — de aanroeper zet het in
// een concept-dossier dat de gebruiker naloopt en accordeert.

const MODEL =
  process.env.CONTRACT_EXTRACTIE_MODEL ??
  process.env.ANTHROPIC_MODEL ??
  "claude-sonnet-4-6";

export function contractExtractieBeschikbaar(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type ContractVoorstel = {
  titel: string | null;
  contractnummer: string | null;
  type: "pacht" | "erfpacht" | "huur" | "beheer" | null;
  pachtvorm:
    | "reguliere_pacht"
    | "geliberaliseerde_pacht"
    | "teeltpacht"
    | "natuurpacht"
    | "overig"
    | null;
  looptijd_type: "bepaald" | "onbepaald" | null;
  ingangsdatum: string | null;
  einddatum: string | null;
  bedrag_per_jaar: number | null;
  partijen: { naam: string; rol: "verpachter" | "pachter" | "verhuurder" | "huurder" | "partij" }[];
  kadastrale_aanduidingen: string[];
  onzekerheden: string | null;
};

const TYPES = new Set(["pacht", "erfpacht", "huur", "beheer"]);
const PACHTVORMEN = new Set([
  "reguliere_pacht",
  "geliberaliseerde_pacht",
  "teeltpacht",
  "natuurpacht",
  "overig",
]);
const LOOPTIJDEN = new Set(["bepaald", "onbepaald"]);
const ROLLEN = new Set(["verpachter", "pachter", "verhuurder", "huurder", "partij"]);

function alsDatum(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

const PROMPT = `Je leest een Nederlands grondgebruiks- of huurcontract (meestal een pachtovereenkomst). Haal de dossiervelden eruit en antwoord met uitsluitend één JSON-object, zonder toelichting eromheen, met exact deze sleutels:

{
  "titel": string|null,             // korte werktitel, bv. "Pacht bouwland Kriekeweg (Mts. Dreessen)"
  "contractnummer": string|null,    // bv. "20108"
  "type": "pacht"|"erfpacht"|"huur"|"beheer"|null,
  "pachtvorm": "reguliere_pacht"|"geliberaliseerde_pacht"|"teeltpacht"|"natuurpacht"|"overig"|null,
                                    // art. 7:397 BW of "kleiner dan 1 hectare (art. 7:395 BW)" duiden op geliberaliseerde pacht
  "looptijd_type": "bepaald"|"onbepaald"|null,
  "ingangsdatum": "JJJJ-MM-DD"|null,
  "einddatum": "JJJJ-MM-DD"|null,
  "bedrag_per_jaar": number|null,   // pacht-/huurprijs per jaar in euro's, als getal
  "partijen": [{"naam": string, "rol": "verpachter"|"pachter"|"verhuurder"|"huurder"|"partij"}],
                                    // de partij zelf (stichting, maatschap, persoon), niet de vertegenwoordigers
  "kadastrale_aanduidingen": [string],
                                    // genormaliseerd als "Gemeente Sectie Nummer", bv. "Valkenisse K 2226"
                                    // ("Gemeente Valkenisse, Sectie K, nummer 2226" wordt dus "Valkenisse K 2226")
  "onzekerheden": string|null       // korte opsomming van wat onduidelijk of niet gevonden is
}

Neem alleen over wat er echt staat; gok niet. Onbekend = null of lege lijst.`;

// Wat de AI kan lezen: een pdf, een afbeelding (scan of foto van het
// contract), of platte tekst (bv. uit een Word-bestand gehaald).
export type ExtractieBron =
  | { soort: "pdf"; base64: string }
  | {
      soort: "afbeelding";
      mediaType: "image/jpeg" | "image/png" | "image/webp";
      base64: string;
    }
  | { soort: "tekst"; naam: string; tekst: string };

// Bronnen omzetten naar de content-blokken van de API. Puur en
// exporteerbaar voor de tests.
export function maakContentBlokken(bronnen: ExtractieBron[]) {
  return bronnen.map((b) => {
    if (b.soort === "pdf") {
      return {
        type: "document" as const,
        source: {
          type: "base64" as const,
          media_type: "application/pdf" as const,
          data: b.base64,
        },
      };
    }
    if (b.soort === "afbeelding") {
      return {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: b.mediaType,
          data: b.base64,
        },
      };
    }
    return {
      type: "document" as const,
      title: b.naam,
      source: {
        type: "text" as const,
        media_type: "text/plain" as const,
        data: b.tekst,
      },
    };
  });
}

// Stuur één of meer bronnen naar de AI en geef het gevalideerde voorstel
// terug. Meerdere bronnen betekent: één contract dat over meerdere
// bestanden verspreid is (hoofdovereenkomst + bijlagen/allonges, of een
// meerpaginacontract als losse foto's) — de AI leest ze in samenhang en er
// komt één voorstel uit.
// Gooit een Error met leesbare tekst als de aanroep of het parsen mislukt —
// de aanroeper toont die eerlijk (bron-storing is geen "geen resultaat").
export async function extraheerContract(
  bronnen: ExtractieBron[],
): Promise<ContractVoorstel> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const prompt =
    bronnen.length > 1
      ? `Je krijgt ${bronnen.length} bestanden die samen één contract vormen (bijvoorbeeld een hoofdovereenkomst met bijlagen of allonges, of een contract dat per pagina gefotografeerd is). Lees ze in samenhang als één geheel; bij tegenstrijdigheden geldt het meest recente of specifieke stuk en noem je de tegenstrijdigheid bij "onzekerheden".\n\n${PROMPT}`
      : PROMPT;
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: [...maakContentBlokken(bronnen), { type: "text", text: prompt }],
      },
    ],
  });

  const tekst = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  let rauw: Record<string, unknown>;
  try {
    rauw = JSON.parse(tekst) as Record<string, unknown>;
  } catch {
    throw new Error(`AI-antwoord was geen geldige JSON: ${tekst.slice(0, 120)}`);
  }
  return valideerContractVoorstel(rauw);
}

// Alleen waarden binnen de eigen lijsten toelaten (zelfde grenzen als de
// check-constraints en de app-validatie). Puur en apart exporteerbaar,
// zodat de tests hem zonder AI-aanroep kunnen raken.
export function valideerContractVoorstel(
  rauw: Record<string, unknown>,
): ContractVoorstel {
  const type = String(rauw.type ?? "");
  const pachtvorm = String(rauw.pachtvorm ?? "");
  const looptijd = String(rauw.looptijd_type ?? "");
  const bedrag = Number(rauw.bedrag_per_jaar);
  const partijen = Array.isArray(rauw.partijen)
    ? (rauw.partijen as { naam?: unknown; rol?: unknown }[])
        .map((p) => ({
          naam: String(p.naam ?? "").trim(),
          rol: ROLLEN.has(String(p.rol ?? "")) ? String(p.rol) : "partij",
        }))
        .filter((p) => p.naam !== "")
    : [];
  const aanduidingen = Array.isArray(rauw.kadastrale_aanduidingen)
    ? (rauw.kadastrale_aanduidingen as unknown[])
        .map((a) => String(a ?? "").trim())
        .filter((a) => a !== "")
    : [];

  return {
    titel: rauw.titel ? String(rauw.titel).trim() : null,
    contractnummer: rauw.contractnummer ? String(rauw.contractnummer).trim() : null,
    type: TYPES.has(type) ? (type as ContractVoorstel["type"]) : null,
    pachtvorm: PACHTVORMEN.has(pachtvorm)
      ? (pachtvorm as ContractVoorstel["pachtvorm"])
      : null,
    looptijd_type: LOOPTIJDEN.has(looptijd)
      ? (looptijd as ContractVoorstel["looptijd_type"])
      : null,
    ingangsdatum: alsDatum(rauw.ingangsdatum),
    einddatum: alsDatum(rauw.einddatum),
    bedrag_per_jaar: Number.isFinite(bedrag) && bedrag >= 0 ? bedrag : null,
    partijen: partijen as ContractVoorstel["partijen"],
    kadastrale_aanduidingen: aanduidingen,
    onzekerheden: rauw.onzekerheden ? String(rauw.onzekerheden).trim() : null,
  };
}

// Kadastrale aanduidingen vergelijkbaar maken: kleine letters, één spatie.
export function normaliseerAanduiding(a: string): string {
  return a.toLowerCase().replace(/\s+/g, " ").trim();
}
