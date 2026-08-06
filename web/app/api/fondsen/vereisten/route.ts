import { createServiceClient, serviceBeschikbaar } from "@/lib/supabase/service";
import { aiBeschikbaar } from "@/lib/ai";
import { geautoriseerdMetSecret } from "@/lib/route-auth";
import { genereerVereisten } from "@/lib/fondsen/vereisten";

// Handmatig te triggeren destillatie van de documentvereisten per fonds
// (regeling_beleidstekst -> regeling_bewijs).
//   POST /api/fondsen/vereisten
//   POST /api/fondsen/vereisten?limiet=25
//   POST /api/fondsen/vereisten?regeling_id=<uuid>   (steekproef)
//   POST /api/fondsen/vereisten?forceer=1
//
// Spiegelt /api/fondsen/matchprofielen: fail-closed op hetzelfde env-geheim
// SUBSIDIE_IMPORT_SECRET (één importkanaal), 503 als de service-role key of de
// AI-laag ontbreekt, en idempotent — meerdere keren draaien is veilig en kost
// de tweede keer vrijwel niets (ongewijzigde regeling_bewijs.bron_hash per fonds = geen
// modelaanroep).
//
// GEEN NIEUWE VERRIJKINGSRONDE. Dit is puur destilleren uit de al opgehaalde
// beleidstekst; er wordt niets extra's gescraped.
//
// BATCHGEWIJS. Elk fonds wordt meteen na destillatie weggeschreven, en `limiet`
// begrenst het aantal modelaanroepen per aanroep. Draai de route net zo vaak
// tot `afgekapt_op_limiet` false is.
//
// Alles komt binnen als vóórstel: geaccordeerd blijft false. Een fonds met een
// geaccordeerde bewijsrij wordt nooit aangeraakt; bestaande niet-geaccordeerde
// content (anders dan de placeholder) evenmin.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function geautoriseerd(req: Request): boolean {
  const verwacht = process.env.SUBSIDIE_IMPORT_SECRET;
  return geautoriseerdMetSecret({
    secretGezet: Boolean(verwacht),
    headerKlopt: Boolean(verwacht) && req.headers.get("x-import-secret") === verwacht,
    isProductie: process.env.NODE_ENV === "production",
  });
}

function getal(waarde: string | null): number | undefined {
  if (!waarde) return undefined;
  const n = Number(waarde);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

export async function POST(req: Request): Promise<Response> {
  if (!geautoriseerd(req)) {
    return Response.json({ fout: "Niet geautoriseerd." }, { status: 401 });
  }
  if (!serviceBeschikbaar()) {
    return Response.json(
      { fout: "SUPABASE_SERVICE_ROLE_KEY ontbreekt — zet die in de serveromgeving." },
      { status: 503 },
    );
  }
  // Zonder AI-sleutel levert elke destillatie null op; dan is een run een lange
  // lijst 'mislukt' zonder dat duidelijk is waarom. Liever meteen eerlijk zijn.
  if (!aiBeschikbaar()) {
    return Response.json(
      { fout: "ANTHROPIC_API_KEY ontbreekt — zonder AI-laag is er niets te destilleren." },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  try {
    const resultaat = await genereerVereisten(createServiceClient(), {
      limiet: getal(url.searchParams.get("limiet")),
      regelingId: url.searchParams.get("regeling_id") ?? undefined,
      model: url.searchParams.get("model") ?? undefined,
      forceer: url.searchParams.get("forceer") === "1",
    });
    return Response.json({ resultaat }, { status: resultaat.fout ? 500 : 200 });
  } catch (e) {
    // Liever een luide fout dan een halve ronde die stil doorgaat. Wat al
    // weggeschreven is blijft staan; de volgende run pakt de rest op.
    return Response.json(
      { fout: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
