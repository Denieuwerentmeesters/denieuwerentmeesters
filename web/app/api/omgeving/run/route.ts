import { createServiceClient, serviceBeschikbaar } from "@/lib/supabase/service";
import { haalPublicatiesOp, ontdubbel, type OphaalCijfers } from "@/lib/omgeving/publicaties";

// Dagelijkse ophaalronde van de omgevingsradar, voor álle landgoederen met de
// module aan.
//
//   POST /api/omgeving/run              -> laatste 7 dagen (dagelijkse ronde)
//   POST /api/omgeving/run?maanden=12   -> eerste vulling of inhaalslag
//
// Twee fasen, en die scheiding is het hele punt:
//
//   1. Ophalen en geocoderen — PER BESTUURSORGAAN, één keer. Dit is de dure
//      helft (HTTP naar KOOP en PDOK). Tien landgoederen in Middelburg delen
//      dezelfde publicaties, dus dit werk hoort niet per landgoed te gebeuren.
//   2. Matchen — per landgoed, maar puur SQL tegen een GIST-index. Dat is
//      milliseconden, ongeacht hoeveel landgoederen er zijn.
//
// De oude opzet deed alles per landgoed en zou bij ongeveer 35 landgoederen
// stilletjes op de tijdslimiet van de functie stuklopen. De kosten schalen nu
// met het aantal gemeenten in plaats van met het aantal klanten.
//
// Beveiliging volgens hetzelfde patroon als /api/subsidie/import: header
// `x-omgeving-secret` moet matchen met OMGEVING_RUN_SECRET, of Vercels eigen
// CRON_SECRET als bearer. Ontbreken beide, dan alleen buiten productie.

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
  // Standaard een week terug: ruim genoeg om een gemiste dag op te vangen. De
  // controle op reeds bekende publicaties zorgt dat die overlap niets kost.
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

  // ── Fase 1: ophalen en geocoderen, per bestuursorgaan ──
  const { data: alleBronnen, error: bronnenFout } = await supabase
    .from("omgevingsbron")
    .select("landgoed_id, naam, bestuurslaag, organisatiecode, zoekveld, zoekgebied")
    .eq("type", "sru")
    .eq("actief", true);
  if (bronnenFout) {
    return Response.json({ fout: bronnenFout.message }, { status: 500 });
  }

  // De provincie per landgoed, nodig als zoekgebied voor provincie en waterschap.
  const provincieVan = new Map<string, string>();
  for (const b of alleBronnen ?? []) {
    if (b.bestuurslaag === "provincie") {
      provincieVan.set(b.landgoed_id as string, b.naam as string);
    }
  }

  const organen = ontdubbel(
    (alleBronnen ?? []).map((b) => ({
      naam: b.naam as string,
      bestuurslaag: b.bestuurslaag as string,
      organisatiecode: b.organisatiecode as string | null,
      zoekveld: b.zoekveld as string | null,
      zoekgebied: b.zoekgebied as string | null,
      provincie: provincieVan.get(b.landgoed_id as string) ?? null,
    })),
  );

  const opgehaald: OphaalCijfers[] = [];
  for (const o of organen) {
    opgehaald.push(await haalPublicatiesOp(supabase, o, periode));
  }
  const alleFouten = opgehaald.flatMap((o) => o.fouten);

  // ── Fase 2: matchen, per landgoed. Puur SQL. ──
  const { data: modules } = await supabase
    .from("module_instelling")
    .select("landgoed_id")
    .eq("module", "omgevingsradar")
    .eq("actief", true);

  const gematcht: Record<string, unknown>[] = [];
  for (const m of modules ?? []) {
    const landgoed_id = m.landgoed_id as string;

    const { data: run } = await supabase
      .from("omgeving_run")
      .insert({ landgoed_id })
      .select("id")
      .single();

    const { data: uit, error: matchFout } = await supabase.rpc("omgeving_match_landgoed", {
      p_landgoed_id: landgoed_id,
      p_sinds: periode.vanaf,
    });
    const cijfers = (Array.isArray(uit) ? uit[0] : uit) as
      | { nieuw: number; doorgelaten: number; weggefilterd: number }
      | undefined;

    if (run) {
      await supabase
        .from("omgeving_run")
        .update({
          geeindigd_op: new Date().toISOString(),
          aantal_opgehaald: opgehaald.reduce((s, o) => s + o.opgehaald, 0),
          aantal_door_poort: cijfers?.doorgelaten ?? 0,
          aantal_relevant: cijfers?.doorgelaten ?? 0,
          aantal_onplaatsbaar: opgehaald.reduce((s, o) => s + o.onplaatsbaar, 0),
          fout: matchFout
            ? matchFout.message
            : alleFouten.length
              ? alleFouten.slice(0, 10).join(" | ")
              : null,
        })
        .eq("id", run.id);
    }
    gematcht.push({ landgoed_id, ...(cijfers ?? {}), fout: matchFout?.message ?? null });
  }

  return Response.json({ periode, organen: opgehaald, landgoederen: gematcht });
}
