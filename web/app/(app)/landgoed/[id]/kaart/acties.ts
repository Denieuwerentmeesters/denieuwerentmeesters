"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

function str(fd: FormData, k: string) {
  const v = String(fd.get(k) ?? "").trim();
  return v || null;
}
function num(fd: FormData, k: string) {
  const n = Number(fd.get(k));
  return Number.isFinite(n) ? n : null;
}

// Basis: de hoofdlocatie van het landgoed (adres/gemeente/provincie/coordinaat).
export async function setBasisLocatie(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const supabase = await createClient();
  await supabase
    .from("landgoed")
    .update({
      adres: str(fd, "adres"),
      postcode: str(fd, "postcode"),
      plaats: str(fd, "plaats"),
      gemeente: str(fd, "gemeente"),
      provincie: str(fd, "provincie"),
      lat: num(fd, "lat"),
      lon: num(fd, "lon"),
    })
    .eq("id", landgoed_id);
  revalidatePath(`/landgoed/${landgoed_id}/kaart`);
}

// Specifiek: een perceel (uit PDOK Kadastrale Kaart) als stamobject vastleggen.
export async function plaatsPerceel(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const naam = String(fd.get("naam") ?? "").trim();
  const lat = Number(fd.get("lat"));
  const lon = Number(fd.get("lon"));
  if (!naam || !Number.isFinite(lat) || !Number.isFinite(lon)) return;

  let extra: Record<string, unknown> = {};
  try {
    extra = JSON.parse(String(fd.get("kenmerken") ?? "{}"));
  } catch {
    extra = {};
  }

  const supabase = await createClient();
  await supabase.from("stamobject").insert({
    landgoed_id,
    naam,
    categorie: "pachtperceel",
    geometrie_type: "vlak",
    herkomst: "handmatig",
    geaccordeerd: true,
    kenmerken: { ...extra, lat, lon },
  });
  revalidatePath(`/landgoed/${landgoed_id}/kaart`);
}
