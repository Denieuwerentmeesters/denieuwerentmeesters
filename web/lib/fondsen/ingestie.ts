import type { SupabaseClient } from "@supabase/supabase-js";
import { moet } from "@/lib/db";
import { verwerkConnector, type IngestieTelling } from "@/lib/subsidie/ingestie";
import {
  FONDSEN_BRON_SLEUTEL,
  fondsenBestandConnector,
  leesFondsen,
  type FondsRij,
} from "./bestand";

// Import van de fondsenlijst. Twee lagen, in deze volgorde:
//   1. de catalogusrij zelf -> de generieke runner uit lib/subsidie/ingestie.ts
//      (snapshot + hash + import-run + idempotente upsert op extern_id)
//   2. de §7-lagen eronder: regeling_criterium (rechtsvorm, §9.1) en
//      regeling_bewijs (vereiste documenten, §4)
//
// Idempotent: laag 2 wordt per regeling opnieuw opgebouwd, maar alleen voor
// rijen die uit deze import komen (herkomst afgeleid_tag/geverifieerd_bron/
// import) én nog niet door een mens zijn geaccordeerd. Wat een mens heeft
// goedgekeurd of zelf heeft toegevoegd blijft staan — dat is het
// accorderingsmodel van het platform.
//
// Draait met de SERVICE-ROLE client (omzeilt RLS), net als de subsidie-ingestie.

type Db = SupabaseClient;

const UIT_IMPORT = ["afgeleid_tag", "geverifieerd_bron", "import", "ai_voorstel"];

export type FondsenImportTelling = IngestieTelling & {
  criteria_geschreven: number;
  bewijs_geschreven: number;
  overgeslagen_geaccordeerd: number;
};

export async function importeerFondsen(db: Db): Promise<FondsenImportTelling> {
  // Laag 1 — catalogus.
  const telling = await verwerkConnector(db, fondsenBestandConnector);
  const leeg: FondsenImportTelling = {
    ...telling,
    criteria_geschreven: 0,
    bewijs_geschreven: 0,
    overgeslagen_geaccordeerd: 0,
  };
  if (telling.fout) return leeg;

  // Laag 2 — criteria en bewijs.
  const { data: bron, error: bronFout } = await db
    .from("subsidie_bron")
    .select("id")
    .eq("sleutel", FONDSEN_BRON_SLEUTEL)
    .maybeSingle();
  if (bronFout || !bron) {
    return { ...leeg, fout: `Bron '${FONDSEN_BRON_SLEUTEL}' niet gevonden.` };
  }

  const rijen = leesFondsen();
  const { data: regelingen, error: regelingFout } = await db
    .from("regeling")
    .select("id, extern_id")
    .eq("bron_id", bron.id);
  if (regelingFout) {
    return { ...leeg, fout: `Regelingen ophalen mislukt: ${regelingFout.message}` };
  }
  const idVoor = new Map<string, string>(
    (regelingen ?? []).map((r: { id: string; extern_id: string }) => [r.extern_id, r.id]),
  );

  let criteria = 0;
  let bewijs = 0;
  let overgeslagen = 0;

  for (const f of rijen) {
    const regelingId = idVoor.get(f.sleutel);
    if (!regelingId) continue; // laag 1 heeft deze rij niet geschreven

    overgeslagen += await vervangCriteria(db, regelingId, f);
    criteria += f.criteria?.length ?? 0;
    overgeslagen += await vervangBewijs(db, regelingId, f);
    bewijs += f.bewijs?.length ?? 0;
  }

  return {
    ...telling,
    criteria_geschreven: criteria,
    bewijs_geschreven: bewijs,
    overgeslagen_geaccordeerd: overgeslagen,
  };
}

async function vervangCriteria(db: Db, regelingId: string, f: FondsRij): Promise<number> {
  const { count } = await db
    .from("regeling_criterium")
    .select("id", { count: "exact", head: true })
    .eq("regeling_id", regelingId)
    .eq("geaccordeerd", true)
    .in("herkomst", UIT_IMPORT);

  await moet(
    db
      .from("regeling_criterium")
      .delete()
      .eq("regeling_id", regelingId)
      .eq("geaccordeerd", false)
      .in("herkomst", UIT_IMPORT),
    "oude fondscriteria opruimen",
  );

  const nieuw = (f.criteria ?? []).map((c) => ({
    regeling_id: regelingId,
    omschrijving: c.omschrijving,
    veld: c.veld ?? null,
    operator: c.operator ?? null,
    waarde: c.waarde ?? null,
    soort: c.soort ?? "eis",
    fase: c.fase ?? "vooraf",
    verplicht: c.verplicht ?? true,
    // Drie-waardig (§2): standaard 'onbekend', want "niet gepubliceerd" is bij
    // fondsen de meest voorkomende waarde en mag geen stille "nee" worden.
    uitkomst: c.uitkomst ?? "onbekend",
    uitkomst_toelichting: c.uitkomst_toelichting ?? null,
    uitsluiting_reden: c.uitsluiting_reden ?? null,
    herkomst: c.herkomst ?? f.herkomst ?? "afgeleid_tag",
    geaccordeerd: false,
  }));
  if (nieuw.length > 0) {
    await moet(db.from("regeling_criterium").insert(nieuw), "fondscriteria schrijven");
  }
  return count ?? 0;
}

async function vervangBewijs(db: Db, regelingId: string, f: FondsRij): Promise<number> {
  const { count } = await db
    .from("regeling_bewijs")
    .select("id", { count: "exact", head: true })
    .eq("regeling_id", regelingId)
    .eq("geaccordeerd", true)
    .in("herkomst", UIT_IMPORT);

  await moet(
    db
      .from("regeling_bewijs")
      .delete()
      .eq("regeling_id", regelingId)
      .eq("geaccordeerd", false)
      .in("herkomst", UIT_IMPORT),
    "oud fondsbewijs opruimen",
  );

  const nieuw = (f.bewijs ?? []).map((b) => ({
    regeling_id: regelingId,
    omschrijving: b.omschrijving,
    document_type: b.document_type ?? null,
    vereiste_type: b.vereiste_type ?? "overig",
    fase: b.fase ?? "bij_aanvraag",
    verplichtheid: b.verplichtheid ?? "verplicht",
    zelf_op_te_stellen: b.zelf_op_te_stellen ?? null,
    doorlooptijd_indicatie: b.doorlooptijd_indicatie ?? null,
    bron_tekst: b.bron_tekst ?? null,
    herkomst: b.herkomst ?? f.herkomst ?? "afgeleid_tag",
    geaccordeerd: false,
  }));
  if (nieuw.length > 0) {
    await moet(db.from("regeling_bewijs").insert(nieuw), "fondsbewijs schrijven");
  }
  return count ?? 0;
}
