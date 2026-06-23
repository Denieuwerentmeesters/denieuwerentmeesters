import { createServiceClient, serviceBeschikbaar } from "@/lib/supabase/service";
import { verrijkRegelingRij } from "@/lib/subsidie/verrijking";

// AI-verrijking van catalogus-regelingen (deadlines + §7-lagen als voorstellen).
//   POST /api/subsidie/verrijk                 -> alle nog niet verrijkte regelingen
//   POST /api/subsidie/verrijk?id=<regeling>   -> één specifieke regeling
//   POST /api/subsidie/verrijk?limiet=5        -> beperk de batch
//
// Beveiliging idem aan de import-route (x-import-secret / niet-productie).

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
      { fout: "SUPABASE_SERVICE_ROLE_KEY ontbreekt." },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const limiet = Math.min(Number(searchParams.get("limiet") ?? 20) || 20, 50);
  const db = createServiceClient();

  let ids: string[];
  if (id) {
    ids = [id];
  } else {
    const { data } = await db
      .from("regeling")
      .select("id")
      .is("verrijkt_op", null)
      .order("aangemaakt_op", { ascending: true })
      .limit(limiet);
    ids = (data ?? []).map((r) => r.id);
  }

  const resultaten = [];
  for (const rid of ids) {
    resultaten.push(await verrijkRegelingRij(db, rid));
  }
  return Response.json({ aantal: resultaten.length, resultaten });
}
