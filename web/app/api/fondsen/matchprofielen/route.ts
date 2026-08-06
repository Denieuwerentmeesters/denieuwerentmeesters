import { createServiceClient, serviceBeschikbaar } from "@/lib/supabase/service";
import { aiBeschikbaar } from "@/lib/ai";
import { geautoriseerdMetSecret } from "@/lib/route-auth";
import { genereerMatchprofielen } from "@/lib/fondsen/matchprofiel-ingestie";

// Handmatig te triggeren generatie van de matchprofielen per fonds
// (regeling + regeling_criterium + regeling_beleidstekst -> regeling_matchprofiel).
//   POST /api/fondsen/matchprofielen
//   POST /api/fondsen/matchprofielen?limiet=25
//   POST /api/fondsen/matchprofielen?regeling_id=<uuid>   (steekproef)
//   POST /api/fondsen/matchprofielen?forceer=1
//
// Spiegelt /api/fondsen/verrijking: fail-closed op hetzelfde env-geheim
// SUBSIDIE_IMPORT_SECRET (één importkanaal), 503 als de service-role key
// ontbreekt, en idempotent — meerdere keren draaien is veilig en kost de tweede
// keer vrijwel niets (ongewijzigde bron_hash = geen modelaanroep).
//
// BATCHGEWIJS. Elk profiel wordt meteen na generatie weggeschreven, en `limiet`
// begrenst het aantal modelaanroepen per aanroep. Een run die op de maxDuration
// stukloopt verliest dus alleen het fonds dat op dat moment liep. Draai de route
// net zo vaak tot `afgekapt_op_limiet` false is.
//
// Alles komt binnen als vóórstel: geaccordeerd blijft false. Een geaccordeerd
// profiel wordt nooit overschreven; een gewijzigde bron eronder komt terug in
// `gewijzigd_maar_geaccordeerd`.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function geautoriseerd(req: Request): boolean {
  const verwacht = process.env.SUBSIDIE_IMPORT_SECRET;
  // Pure beslissing in lib/route-auth.ts, zodat de fail-closed regel getest is.
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
  // Zonder AI-sleutel levert elke generatie null op; dan is een run een lange
  // lijst 'mislukt' zonder dat duidelijk is waarom. Liever meteen eerlijk zijn.
  if (!aiBeschikbaar()) {
    return Response.json(
      { fout: "ANTHROPIC_API_KEY ontbreekt — zonder AI-laag is er niets te destilleren." },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  try {
    const resultaat = await genereerMatchprofielen(createServiceClient(), {
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
