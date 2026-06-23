import { createServiceClient, serviceBeschikbaar } from "@/lib/supabase/service";
import { connectorsVoor } from "@/lib/subsidie/connectors";
import { verwerkConnector } from "@/lib/subsidie/ingestie";

// Handmatig te triggeren ingestie-route (later automatiseerbaar via scheduler).
//   POST /api/subsidie/import           -> alle connectors
//   POST /api/subsidie/import?bron=rvo_opendata
//
// Beveiliging: header `x-import-secret` moet matchen met SUBSIDIE_IMPORT_SECRET.
// Is dat env-geheim niet gezet, dan alleen toegestaan buiten productie (lokaal testen).

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
      {
        fout: "SUPABASE_SERVICE_ROLE_KEY ontbreekt — zet die in de serveromgeving.",
      },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(req.url);
  const connectors = connectorsVoor(searchParams.get("bron"));
  if (connectors.length === 0) {
    return Response.json(
      { fout: `Onbekende bron '${searchParams.get("bron")}'.` },
      { status: 400 },
    );
  }

  const db = createServiceClient();
  const resultaten = [];
  for (const c of connectors) {
    resultaten.push(await verwerkConnector(db, c));
  }
  return Response.json({ resultaten });
}
