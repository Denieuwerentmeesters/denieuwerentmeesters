import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Connector, RegelingNormaal } from "./connectors";
import { moet } from "@/lib/db";

// Generieke ingestie-runner. Spiegelt persisteerVoorstellen uit lib/extractie.ts.
// Draait met een SERVICE-ROLE client (omzeilt RLS): schrijft naar de catalogus.
//
// Per run:
//   1. open subsidie_import_run
//   2. connector.haalOp()
//   3. per item: snapshot diffen (nieuw/gewijzigd) + regeling upserten
//      (idempotent op (bron_id, extern_id); mens-geaccordeerde velden niet wissen)
//   4. niet-meer-geziene snapshots tellen als verlopen
//   5. run afsluiten + bron.laatst_gedraaid

type Db = SupabaseClient;

export type IngestieTelling = {
  bron: string;
  gezien: number;
  nieuw: number;
  gewijzigd: number;
  verlopen: number;
  fout?: string;
};

function hashVan(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

// Alleen niet-lege bron-velden meenemen, zodat een connector zonder deadline
// (RVO) een eerder verrijkte deadline nooit overschrijft.
function bronVelden(r: RegelingNormaal): Record<string, unknown> {
  const v: Record<string, unknown> = {
    naam: r.naam,
    bijgewerkt_op: new Date().toISOString(),
  };
  const zet = (k: string, w: unknown) => {
    if (w !== undefined && w !== null) v[k] = w;
  };
  zet("organisatie", r.organisatie);
  zet("samenvatting", r.samenvatting);
  zet("bron_url", r.bron_url);
  zet("categorie", r.categorie);
  zet("scope", r.scope);
  zet("provincie", r.provincie);
  zet("gemeenten", r.gemeenten);
  zet("creator", r.creator);
  zet("bestuurslaag", r.bestuurslaag);
  zet("status", r.status);
  zet("themas", r.themas);
  zet("trefwoorden", r.trefwoorden);
  zet("doelgroepen", r.doelgroepen);
  zet("sectoren", r.sectoren);
  zet("budget_indicatie", r.budget_indicatie);
  if (r.is_tijdelijk !== undefined) zet("is_tijdelijk", r.is_tijdelijk);
  zet("openstelling_van", r.openstelling_van);
  zet("openstelling_tot", r.openstelling_tot);

  // Fondsenradar-velden (migratie 0050). Alleen meesturen als de connector ze
  // vult; subsidie-connectors laten ze leeg en houden zo de kolomdefaults.
  zet("soort_bron", r.soort_bron);
  zet("rechtskarakter", r.rechtskarakter);
  zet("benaderbaarheid", r.benaderbaarheid);
  zet("benaderwijze_notitie", r.benaderwijze_notitie);
  zet("geo_niveau", r.geo_niveau);
  zet("geo_waarden", r.geo_waarden);
  zet("bedrag_min", r.bedrag_min);
  zet("bedrag_max", r.bedrag_max);
  zet("bedrag_typisch", r.bedrag_typisch);
  zet("bedrag_indicatie", r.bedrag_indicatie);
  // Bewust niet via `zet`: `false` is hier betekenisvol en `null` betekent
  // "niet gepubliceerd" — dat mag niet stil naar "nee" vallen (§2).
  if (r.cofinanciering_vereist !== undefined) {
    v.cofinanciering_vereist = r.cofinanciering_vereist;
  }
  zet("max_percentage_projectkosten", r.max_percentage_projectkosten);
  zet("financieringsrol", r.financieringsrol);
  zet("kostensoort", r.kostensoort);
  zet("cooldown_maanden", r.cooldown_maanden);
  zet("hercontrole_termijn", r.hercontrole_termijn);
  zet("plan_triggers", r.plan_triggers);
  zet("contact", r.contact);

  // §1: `bestuurslaag` gaat over welke OVERHEIDSlaag verstrekt. Bij een fonds
  // hoort dat veld leeg te blijven — "privaat" erin proppen is een
  // categoriefout. De database bewaakt dit ook (constraint in 0050).
  if (r.soort_bron === "fonds") delete v.bestuurslaag;
  return v;
}

export async function verwerkConnector(
  db: Db,
  connector: Connector,
): Promise<IngestieTelling> {
  const runStart = new Date().toISOString();

  // Bron opzoeken.
  const { data: bron } = await db
    .from("subsidie_bron")
    .select("id, sleutel")
    .eq("sleutel", connector.bronSleutel)
    .maybeSingle();
  if (!bron) {
    return {
      bron: connector.bronSleutel,
      gezien: 0,
      nieuw: 0,
      gewijzigd: 0,
      verlopen: 0,
      fout: `Onbekende bron '${connector.bronSleutel}' (registreer in subsidie_bron).`,
    };
  }

  // Run openen. Mislukt dit, dan heeft doorgaan geen zin — meld het als telling.
  const { data: run, error: runFout } = await db
    .from("subsidie_import_run")
    .insert({ bron_id: bron.id, gestart_op: runStart, status: "bezig" })
    .select("id")
    .single();
  if (runFout || !run) {
    return {
      bron: connector.bronSleutel,
      gezien: 0,
      nieuw: 0,
      gewijzigd: 0,
      verlopen: 0,
      fout: `Kon import-run niet openen: ${runFout?.message ?? "onbekende fout"}`,
    };
  }

  let gezien = 0;
  let nieuw = 0;
  let gewijzigd = 0;
  let fout: string | undefined;

  try {
    const items = await connector.haalOp();

    for (const item of items) {
      gezien++;
      const hash = hashVan(item.ruw ?? item);

      // Bestaande snapshot?
      const { data: snap } = await db
        .from("subsidie_snapshot")
        .select("id, payload_hash")
        .eq("bron_id", bron.id)
        .eq("extern_id", item.extern_id)
        .maybeSingle();

      const isNieuw = !snap;
      const isGewijzigd = snap ? snap.payload_hash !== hash : false;

      // Snapshot upserten.
      await moet(
        db.from("subsidie_snapshot").upsert(
          {
            bron_id: bron.id,
            extern_id: item.extern_id,
            payload: item.ruw ?? item,
            payload_hash: hash,
            laatst_gezien: new Date().toISOString(),
          },
          { onConflict: "bron_id,extern_id" },
        ),
        "snapshot bijwerken",
      );

      // Regeling upserten — bestaande mens-velden behouden.
      const { data: bestaand } = await db
        .from("regeling")
        .select("id, geaccordeerd")
        .eq("bron_id", bron.id)
        .eq("extern_id", item.extern_id)
        .maybeSingle();

      if (!bestaand) {
        await moet(
          db.from("regeling").insert({
            bron_id: bron.id,
            extern_id: item.extern_id,
            // Per rij, want de fondsenlijst mengt geverifieerde kennis met
            // gissingen uit een sector-tag (§2). Feeds blijven 'import'.
            herkomst: item.herkomst ?? "import",
            geaccordeerd: false,
            is_nieuw: true,
            payload_hash: hash,
            laatst_gezien: new Date().toISOString(),
            ...bronVelden(item),
          }),
          "regeling aanmaken",
        );
        nieuw++;
      } else {
        const velden = bronVelden(item);
        // Versheid op de regeling zelf (§2): ook als er niets wijzigde is dit
        // het bewijs dat de bron het record nog bevestigt.
        velden.payload_hash = hash;
        velden.laatst_gezien = new Date().toISOString();
        // Herkomst alleen bijstellen zolang een mens de rij niet heeft
        // geaccordeerd — anders zou een herimport een handmatige verificatie
        // terugzetten naar een afgeleide gissing.
        if (item.herkomst && !bestaand.geaccordeerd) {
          velden.herkomst = item.herkomst;
        }
        // Inhoud gewijzigd -> opnieuw verrijken (verrijkt_op leeglaten).
        if (isGewijzigd) velden.verrijkt_op = null;
        await moet(
          db.from("regeling").update(velden).eq("id", bestaand.id),
          "regeling bijwerken",
        );
        if (isGewijzigd) gewijzigd++;
      }
      void isNieuw;
    }

    // Verlopen = snapshots van deze bron die deze run niet geraakt zijn.
    const { count: verlopenCount } = await db
      .from("subsidie_snapshot")
      .select("id", { count: "exact", head: true })
      .eq("bron_id", bron.id)
      .lt("laatst_gezien", runStart);
    const verlopen = verlopenCount ?? 0;

    await moet(
      db
        .from("subsidie_import_run")
        .update({
          status: "klaar",
          voltooid_op: new Date().toISOString(),
          aantal_gezien: gezien,
          aantal_nieuw: nieuw,
          aantal_gewijzigd: gewijzigd,
          aantal_verlopen: verlopen,
        })
        .eq("id", run.id),
      "import-run afsluiten",
    );
    await moet(
      db
        .from("subsidie_bron")
        .update({ laatst_gedraaid: new Date().toISOString() })
        .eq("id", bron.id),
      "bron-tijdstip bijwerken",
    );

    return { bron: bron.sleutel, gezien, nieuw, gewijzigd, verlopen };
  } catch (e) {
    fout = e instanceof Error ? e.message : String(e);
    // Best-effort foutregistratie op de run zelf — bewust niet via moet, zodat
    // een falende update de oorspronkelijke fout niet maskeert.
    await db
      .from("subsidie_import_run")
      .update({
        status: "fout",
        voltooid_op: new Date().toISOString(),
        aantal_gezien: gezien,
        aantal_nieuw: nieuw,
        aantal_gewijzigd: gewijzigd,
        fout,
      })
      .eq("id", run.id);
    return { bron: bron.sleutel, gezien, nieuw, gewijzigd, verlopen: 0, fout };
  }
}
