"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { scoorRelevantie } from "@/lib/ai";
import { moet } from "@/lib/db";
import { leidBestuursorganenAf, type Rechthoek } from "@/lib/omgeving/bestuursorganen";
import { haalPublicatiesOp, ontdubbel } from "@/lib/omgeving/publicaties";

function lijst(fd: FormData, k: string): string[] | null {
  const v = String(fd.get(k) ?? "").trim();
  if (!v) return null;
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

export async function slaProfielOp(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const supabase = await createClient();
  await moet(
    supabase.from("omgeving_profiel").upsert({
      landgoed_id,
      provincie: String(fd.get("provincie") ?? "").trim() || null,
      gemeenten: lijst(fd, "gemeenten"),
      themas: lijst(fd, "themas"),
      trefwoorden: lijst(fd, "trefwoorden"),
      drempel: Number(fd.get("drempel") ?? 60) || 60,
    }),
    "omgevingsprofiel opslaan",
  );
  revalidatePath(`/landgoed/${landgoed_id}/omgeving`);
}

export async function nieuwBericht(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const titel = String(fd.get("titel") ?? "").trim();
  const tekst = String(fd.get("tekst") ?? "").trim();
  if (!titel) return;

  const supabase = await createClient();
  const bericht = await moet(
    supabase
      .from("omgevingsbericht")
      .insert({
        landgoed_id,
        titel,
        originele_tekst: tekst || null,
        url: String(fd.get("url") ?? "").trim() || null,
        bericht_datum: String(fd.get("bericht_datum") ?? "").trim() || null,
        status: "nieuw",
      })
      .select("id")
      .single(),
    "omgevingsbericht opslaan",
  );

  // AI-relevantiefilter (alleen als key aanwezig).
  const { data: profiel } = await supabase
    .from("omgeving_profiel")
    .select("provincie, themas, trefwoorden, drempel")
    .eq("landgoed_id", landgoed_id)
    .maybeSingle();

  const oordeel = await scoorRelevantie(
    { titel, tekst },
    {
      provincie: profiel?.provincie ?? undefined,
      themas: profiel?.themas ?? undefined,
      trefwoorden: profiel?.trefwoorden ?? undefined,
    },
  );
  if (oordeel) {
    const drempel = profiel?.drempel ?? 60;
    await moet(
      supabase
        .from("omgevingsbericht")
        .update({
          samenvatting: oordeel.samenvatting,
          relevantie_score: oordeel.relevantie_score,
          relevant: oordeel.relevantie_score >= drempel,
          motivering: oordeel.motivering,
          thema: oordeel.thema,
        })
        .eq("id", bericht.id),
      "omgevingsbericht verrijken",
    );
  }

  revalidatePath(`/landgoed/${landgoed_id}/omgeving`);
}

/**
 * Bestuursorganen afleiden uit de perceelgeometrie en als bron vastleggen.
 *
 * Een nieuw landgoed hoort geen bronconfiguratie te kosten. Wat de gebruiker
 * zelf heeft toegevoegd of aangepast (herkomst 'handmatig') blijft ongemoeid:
 * de automaat mag het oordeel van de eigenaar niet overschrijven.
 */
export async function leidBronnenAf(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const supabase = await createClient();

  const vak = await moet(
    supabase.rpc("omgeving_invloedsgebied_vak", { p_landgoed_id: landgoed_id }),
    "omhullende opvragen",
  );
  if (!vak) {
    // Geen enkele perceelgeometrie: dan valt er niets af te leiden. Dat is
    // iets anders dan "geen bestuursorganen gevonden".
    revalidatePath(`/landgoed/${landgoed_id}/omgeving`);
    return;
  }

  const { organen } = await leidBestuursorganenAf(vak as unknown as Rechthoek);

  for (const o of organen) {
    // Bestaat er al een handmatige rij voor deze organisatie? Dan afblijven.
    const { data: bestaand } = await supabase
      .from("omgevingsbron")
      .select("id, herkomst")
      .eq("landgoed_id", landgoed_id)
      .eq("type", "sru")
      .eq("organisatiecode", o.code ?? "")
      .maybeSingle();
    if (bestaand?.herkomst === "handmatig") continue;

    await moet(
      supabase.from("omgevingsbron").upsert(
        {
          landgoed_id,
          type: "sru",
          soort: "sru",
          herkomst: "afgeleid",
          naam: o.naam,
          organisatiecode: o.code ?? "",
          bestuurslaag: o.bestuurslaag,
          actief: true,
        },
        { onConflict: "landgoed_id,type,organisatiecode" },
      ),
      "bron vastleggen",
    );
  }

  revalidatePath(`/landgoed/${landgoed_id}/omgeving`);
}

/**
 * Eén ophaalronde over alle actieve SRU-bronnen.
 *
 * De trechtercijfers gaan naar omgeving_run: zonder die cijfers is niet vast
 * te stellen of het filter te streng of te ruim staat, en dan wordt de drempel
 * op gevoel gezet.
 */
/**
 * Eén ophaalronde voor dit landgoed.
 *
 * Twee fasen: publicaties ophalen en geocoderen per bestuursorgaan (het dure
 * deel, gedeeld met alle andere landgoederen), daarna matchen tegen dit
 * landgoed in SQL. Zie /api/omgeving/run voor de dagelijkse variant.
 */
export async function haalBerichtenOp(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const maanden = Math.min(3, Math.max(1, Number(fd.get("maanden") ?? 1)));
  const supabase = await createClient();

  const vanafDatum = new Date();
  vanafDatum.setMonth(vanafDatum.getMonth() - maanden);
  const periode = {
    vanaf: vanafDatum.toISOString().slice(0, 10),
    tot: new Date().toISOString().slice(0, 10),
  };

  const bronnen = await moet(
    supabase
      .from("omgevingsbron")
      .select("naam, bestuurslaag, organisatiecode, zoekveld, zoekgebied")
      .eq("landgoed_id", landgoed_id)
      .eq("type", "sru")
      .eq("actief", true),
    "bronnen ophalen",
  );

  const provincie =
    (bronnen.find((b) => b.bestuurslaag === "provincie")?.naam as string | undefined) ?? null;

  const run = await moet(
    supabase.from("omgeving_run").insert({ landgoed_id }).select("id").single(),
    "run starten",
  );

  // Fase 1 — ophalen en geocoderen. Publicaties die een ander landgoed al
  // heeft opgehaald worden hier overgeslagen.
  const organen = ontdubbel(
    bronnen.map((b) => ({
      naam: b.naam as string,
      bestuurslaag: b.bestuurslaag as string,
      organisatiecode: b.organisatiecode as string | null,
      zoekveld: b.zoekveld as string | null,
      zoekgebied: b.zoekgebied as string | null,
      provincie,
    })),
  );

  let opgehaald = 0;
  let onplaatsbaar = 0;
  const fouten: string[] = [];
  for (const o of organen) {
    const c = await haalPublicatiesOp(supabase, o, periode);
    opgehaald += c.opgehaald;
    onplaatsbaar += c.onplaatsbaar;
    fouten.push(...c.fouten);
  }

  // Fase 2 — matchen. Puur SQL.
  const uit = await moet(
    supabase.rpc("omgeving_match_landgoed", {
      p_landgoed_id: landgoed_id,
      p_sinds: periode.vanaf,
    }),
    "berichten matchen",
  );
  const cijfers = (Array.isArray(uit) ? uit[0] : uit) as
    | { nieuw: number; doorgelaten: number; weggefilterd: number }
    | undefined;

  await moet(
    supabase
      .from("omgeving_run")
      .update({
        geeindigd_op: new Date().toISOString(),
        aantal_opgehaald: opgehaald,
        aantal_door_poort: cijfers?.doorgelaten ?? 0,
        aantal_relevant: cijfers?.doorgelaten ?? 0,
        aantal_onplaatsbaar: onplaatsbaar,
        fout: fouten.length ? fouten.slice(0, 10).join(" | ") : null,
      })
      .eq("id", run.id),
    "run afsluiten",
  );

  revalidatePath(`/landgoed/${landgoed_id}/omgeving`);
}

export async function berichtNaarTaak(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const bericht_id = String(fd.get("id"));
  const titel = String(fd.get("titel") ?? "Omgevingsbericht opvolgen");
  const supabase = await createClient();

  const taak = await moet(
    supabase
      .from("taak")
      .insert({ landgoed_id, titel, status: "open" })
      .select("id")
      .single(),
    "taak aanmaken",
  );

  await moet(
    supabase
      .from("omgevingsbericht")
      .update({ status: "omgezet", taak_id: taak.id })
      .eq("id", bericht_id),
    "bericht omzetten naar taak",
  );

  revalidatePath(`/landgoed/${landgoed_id}/omgeving`);
}
