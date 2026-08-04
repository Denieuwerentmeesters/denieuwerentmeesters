import { createServiceClient, serviceBeschikbaar } from "@/lib/supabase/service";
import { importeerFondsen } from "@/lib/fondsen/ingestie";

// Handmatig te triggeren import van de fondsenlijst
// (kennisbank/Fondsen/fondsen.json -> regeling + criteria + bewijs).
//   POST /api/fondsen/import
//
// Spiegelt /api/subsidie/import: fail-closed op het env-geheim
// SUBSIDIE_IMPORT_SECRET (dezelfde sleutel, één importkanaal), en een nette 503
// als de service-role key ontbreekt.
//
// Idempotent — meerdere keren draaien is veilig. Alles komt binnen als
// vóórstel: geaccordeerd=false, herkomst per rij (§2 van het implementatieplan).

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
    const resultaat = await importeerFondsen(createServiceClient());
    return Response.json({ resultaat }, { status: resultaat.fout ? 500 : 200 });
  } catch (e) {
    return Response.json(
      { fout: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
