import { createServiceClient, serviceBeschikbaar } from "@/lib/supabase/service";
import { verrijkFondsen } from "@/lib/fondsen/verrijking-ingestie";

// Handmatig te triggeren verrijking van de fondsencatalogus
// (kennisbank/Fondsen/verrijking/<slug>.json + <slug>.md -> regeling +
// regeling_bronlezing + regeling_criterium + regeling_beleidstekst).
//   POST /api/fondsen/verrijking
//
// Spiegelt /api/fondsen/import: fail-closed op hetzelfde env-geheim
// SUBSIDIE_IMPORT_SECRET (één importkanaal), 503 als de service-role key
// ontbreekt, en idempotent — meerdere keren draaien is veilig.
//
// Alles komt binnen als vóórstel: geaccordeerd blijft false. Een fonds waarvan
// de naam niet op de catalogus te herleiden is wordt NIET aangemaakt maar in
// het antwoord gerapporteerd (overgeslagen_geen_match) — een nieuwe rij zou een
// dubbel geven.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function geautoriseerd(req: Request): boolean {
  const verwacht = process.env.SUBSIDIE_IMPORT_SECRET;
  if (!verwacht) return process.env.NODE_ENV !== "production";
  return req.headers.get("x-import-secret") === verwacht;
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

  try {
    const resultaat = await verrijkFondsen(createServiceClient());
    return Response.json({ resultaat }, { status: resultaat.fout ? 500 : 200 });
  } catch (e) {
    // Een VerrijkingFout (ongeldig bestand) hoort hier als 500 met de melding
    // eruit te komen: liever een luide fout dan een halve verrijking.
    return Response.json(
      { fout: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
