"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { scoorRelevantie } from "@/lib/ai";
import { moet } from "@/lib/db";

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
