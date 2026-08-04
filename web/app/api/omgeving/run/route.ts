import { createServiceClient, serviceBeschikbaar } from "@/lib/supabase/service";
import { haalBronOp, telOp, type Bron, type Trechter } from "@/lib/omgeving/ingest";

// Dagelijkse ophaalronde van de omgevingsradar, voor álle landgoederen met de
// module aan.
//
//   POST /api/omgeving/run              -> laatste 7 dagen (dagelijkse ronde)
//   POST /api/omgeving/run?maanden=12   -> eerste vulling of inhaalslag
//
// Waarom dit een route is en niet alleen een knop: een radar die termijnen moet
// bewaken kan niet afhangen van iemand die eraan denkt te klikken. Een
// zienswijzetermijn van zes weken die pas na drie weken wordt opgemerkt is een
// termijn van drie weken geworden.
//
// Beveiliging volgens hetzelfde patroon als /api/subsidie/import: header
// `x-omgeving-secret` moet matchen met OMGEVING_RUN_SECRET. Ontbreekt dat
// geheim, dan alleen buiten productie — fail-closed.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function geautoriseerd(req: Request): boolean {
  // Vercel roept een cron aan met GET en een bearer-token uit CRON_SECRET.
  const cronGeheim = process.env.CRON_SECRET;
  if (cronGeheim && req.headers.get("authorization") === `Bearer ${cronGeheim}`) {
    return true;
  }
  const verwacht = process.env.OMGEVING_RUN_SECRET;
  if (!verwacht) return process.env.NODE_ENV !== "production";
  return req.headers.get("x-omgeving-secret") === verwacht;
}

// Vercel-crons doen een GET. Handmatig aanroepen kan met POST; beide lopen door
// dezelfde autorisatie en dezelfde ronde.
export async function GET(req: Request): Promise<Response> {
  return POST(req);
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

  const { searchParams } = new URL(req.url);
  // Standaard een week terug: ruim genoeg om een gemiste dag op te vangen, en
  // dedup op externe_id zorgt dat overlap niets dubbel oplevert.
  const maanden = Number(searchParams.get("maanden") ?? 0);
  const dagen = maanden > 0 ? 0 : Number(searchParams.get("dagen") ?? 7);

  const vanafDatum = new Date();
  if (maanden > 0) vanafDatum.setMonth(vanafDatum.getMonth() - Math.min(24, maanden));
  else vanafDatum.setDate(vanafDatum.getDate() - Math.min(90, Math.max(1, dagen)));

  const periode = {
    vanaf: vanafDatum.toISOString().slice(0, 10),
    tot: new Date().toISOString().slice(0, 10),
  };

  const supabase = createServiceClient();

  const { data: modules, error: modulesFout } = await supabase
    .from("module_instelling")
    .select("landgoed_id")
    .eq("module", "omgevingsradar")
    .eq("actief", true);
  if (modulesFout) {
    return Response.json({ fout: modulesFout.message }, { status: 500 });
  }

  const uitkomst: Record<string, unknown>[] = [];

  for (const m of modules ?? []) {
    const landgoed_id = m.landgoed_id as string;

    const { data: bronnen, error: bronnenFout } = await supabase
      .from("omgevingsbron")
      .select("id, naam, bestuurslaag, zoekveld, zoekgebied")
      .eq("landgoed_id", landgoed_id)
      .eq("type", "sru")
      .eq("actief", true);
    if (bronnenFout) {
      uitkomst.push({ landgoed_id, fout: bronnenFout.message });
      continue;
    }
    if (!bronnen?.length) continue;

    const provincie =
      (bronnen.find((b) => b.bestuurslaag === "provincie")?.naam as string | undefined) ?? null;

    const { data: run } = await supabase
      .from("omgeving_run")
      .insert({ landgoed_id })
      .select("id")
      .single();

    const delen: Trechter[] = [];
    for (const b of bronnen) {
      const laag = b.bestuurslaag as string;
      const gemeentelijk = laag === "gemeente" || laag === "buurgemeente";
      const veld =
        (b.zoekveld as "gemeentenaam" | "provincienaam" | null) ??
        (gemeentelijk ? "gemeentenaam" : "provincienaam");
      const naam =
        (b.zoekgebied as string | null) ?? (gemeentelijk ? (b.naam as string) : provincie);
      if (!naam) continue;

      const bron: Bron = {
        id: b.id as string,
        organisatie: b.naam as string,
        gebied: { veld, naam },
        bestuurslaag: laag,
      };
      delen.push(await haalBronOp(supabase, landgoed_id, bron, periode));
      await supabase
        .from("omgevingsbron")
        .update({ laatste_run_op: new Date().toISOString(), laatste_run_status: "ok" })
        .eq("id", b.id);
    }

    const t = telOp(delen);
    if (run) {
      await supabase
        .from("omgeving_run")
        .update({
          geeindigd_op: new Date().toISOString(),
          aantal_opgehaald: t.opgehaald,
          aantal_door_poort: t.door_poort,
          aantal_relevant: t.bewaard,
          aantal_onplaatsbaar: t.onplaatsbaar,
          fout: t.fouten.length ? t.fouten.slice(0, 10).join(" | ") : null,
        })
        .eq("id", run.id);
    }
    uitkomst.push({ landgoed_id, ...t, fouten: t.fouten.length });
  }

  return Response.json({ periode, landgoederen: uitkomst });
}
