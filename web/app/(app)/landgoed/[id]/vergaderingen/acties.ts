"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function maakGesprek(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const titel = String(fd.get("titel") ?? "").trim();
  const datum = String(fd.get("datum") ?? "").trim() || null;
  const transcript = String(fd.get("transcript") ?? "").trim();
  if (!titel) return;

  const supabase = await createClient();

  const { data: gesprek } = await supabase
    .from("gesprek")
    .insert({ landgoed_id, titel, datum, status: transcript ? "getranscribeerd" : "nieuw" })
    .select("id")
    .single();

  if (!gesprek) return;

  if (transcript) {
    await supabase
      .from("gesprek_transcript")
      .insert({ gesprek_id: gesprek.id, tekst: transcript });
  }

  redirect(`/landgoed/${landgoed_id}/vergaderingen/${gesprek.id}`);
}
