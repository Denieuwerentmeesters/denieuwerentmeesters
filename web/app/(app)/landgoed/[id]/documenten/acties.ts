"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

function veiligeNaam(naam: string) {
  return naam.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function uploadDocument(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const file = fd.get("bestand") as File | null;
  const titel = String(fd.get("titel") ?? "").trim();
  if (!file || file.size === 0) return;

  const supabase = await createClient();
  const pad = `${landgoed_id}/${crypto.randomUUID()}-${veiligeNaam(file.name)}`;

  const { error } = await supabase.storage
    .from("documenten")
    .upload(pad, file, { contentType: file.type || undefined });
  if (error) throw new Error(error.message);

  const { data: gebruiker } = await supabase.auth.getUser();
  await supabase.from("document").insert({
    landgoed_id,
    scope: "landgoed",
    titel: titel || file.name,
    bestand_pad: pad,
    geupload_door: gebruiker.user?.id,
  });

  revalidatePath(`/landgoed/${landgoed_id}/documenten`);
}

export async function verwijderDocument(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const id = String(fd.get("id"));
  const pad = String(fd.get("pad"));

  const supabase = await createClient();
  await supabase.storage.from("documenten").remove([pad]);
  await supabase.from("document").delete().eq("id", id);
  revalidatePath(`/landgoed/${landgoed_id}/documenten`);
}
