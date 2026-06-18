"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { maakNotulen } from "@/lib/ai";

export async function nieuweVergadering(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const titel = String(fd.get("titel") ?? "").trim();
  const transcript = String(fd.get("transcript") ?? "").trim();
  const datum = String(fd.get("datum") ?? "").trim() || undefined;
  if (!titel) return;

  const supabase = await createClient();
  const { data: gebruiker } = await supabase.auth.getUser();

  const { data: vergadering } = await supabase
    .from("vergadering")
    .insert({
      landgoed_id,
      titel,
      datum,
      transcript: transcript || null,
      status: transcript ? "getranscribeerd" : "opgenomen",
      aangemaakt_door: gebruiker.user?.id,
    })
    .select("id")
    .single();

  // AI: notulen + besluiten + actiepunten -> taken.
  if (vergadering && transcript) {
    const resultaat = await maakNotulen(transcript);
    if (resultaat) {
      await supabase
        .from("vergadering")
        .update({
          notulen: resultaat.notulen,
          samenvatting: resultaat.samenvatting,
          status: "verwerkt",
        })
        .eq("id", vergadering.id);

      if (resultaat.besluiten?.length) {
        await supabase.from("vergadering_besluit").insert(
          resultaat.besluiten.map((tekst) => ({
            vergadering_id: vergadering.id,
            tekst,
          })),
        );
      }
      if (resultaat.actiepunten?.length) {
        await supabase.from("taak").insert(
          resultaat.actiepunten.map((a) => ({
            landgoed_id,
            titel: a.titel,
            status: "open",
            vergadering_id: vergadering.id,
          })),
        );
      }
    }
  }

  revalidatePath(`/landgoed/${landgoed_id}/vergaderingen`);
}
