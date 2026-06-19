"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

function tekst(fd: FormData, k: string) {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
}

export async function nieuwAgendaItem(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const titel = tekst(fd, "titel");
  const datum = tekst(fd, "datum");
  if (!titel || !datum) return;
  const supabase = await createClient();
  await supabase.from("agenda_item").insert({
    landgoed_id,
    titel,
    datum,
    tijd: tekst(fd, "tijd"),
    locatie: tekst(fd, "locatie"),
    categorie: tekst(fd, "categorie"),
  });
  revalidatePath(`/landgoed/${landgoed_id}/overzicht`);
}

export async function verwijderAgendaItem(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const id = String(fd.get("id"));
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("agenda_item").delete().eq("id", id);
  revalidatePath(`/landgoed/${landgoed_id}/overzicht`);
}
