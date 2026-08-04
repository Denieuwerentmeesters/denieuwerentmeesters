"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { scoorRelevantie } from "@/lib/ai";
import { moet } from "@/lib/db";
import { leidBestuursorganenAf, type Rechthoek } from "@/lib/omgeving/bestuursorganen";
import { haalBronOp, telOp, type Bron, type Trechter } from "@/lib/omgeving/ingest";

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
export async function haalBerichtenOp(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const maanden = Math.min(24, Math.max(1, Number(fd.get("maanden") ?? 12)));
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
      .select("id, naam, organisatiecode, bestuurslaag")
      .eq("landgoed_id", landgoed_id)
      .eq("type", "sru")
      .eq("actief", true),
    "bronnen ophalen",
  );

  const run = await moet(
    supabase
      .from("omgeving_run")
      .insert({ landgoed_id })
      .select("id")
      .single(),
    "run starten",
  );

  const delen: Trechter[] = [];
  for (const b of bronnen) {
    // Alleen gemeenten leveren adressen op die binnen die gemeente te
    // geocoderen zijn. Provincie en waterschap publiceren over een groter
    // gebied; die vragen een andere aanpak en slaan we in deze ronde over.
    if (b.bestuurslaag !== "gemeente" && b.bestuurslaag !== "buurgemeente") continue;
    const bron: Bron = {
      id: b.id as string,
      organisatie: b.naam as string,
      gemeente: b.naam as string,
      bestuurslaag: b.bestuurslaag as string,
    };
    delen.push(await haalBronOp(supabase, landgoed_id, bron, periode));
    await supabase
      .from("omgevingsbron")
      .update({ laatste_run_op: new Date().toISOString(), laatste_run_status: "ok" })
      .eq("id", b.id);
  }

  const t = telOp(delen);
  await moet(
    supabase
      .from("omgeving_run")
      .update({
        geeindigd_op: new Date().toISOString(),
        aantal_opgehaald: t.opgehaald,
        aantal_door_poort: t.door_poort,
        aantal_relevant: t.bewaard,
        aantal_onplaatsbaar: t.onplaatsbaar,
        fout: t.fouten.length ? t.fouten.slice(0, 10).join(" | ") : null,
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
