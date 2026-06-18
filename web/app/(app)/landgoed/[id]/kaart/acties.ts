"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Plaatst een stamobject als punt. Adres/gemeente/provincie (PDOK reverse) en
// de coördinaten gaan in kenmerken; de PostGIS-geom volgt later (backfill uit
// kenmerken zodra de zware kaart/PDOK-laag landt).
export async function plaatsObject(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const naam = String(fd.get("naam") ?? "").trim();
  const categorie = String(fd.get("categorie") ?? "overig");
  const lat = Number(fd.get("lat"));
  const lon = Number(fd.get("lon"));
  if (!naam || !Number.isFinite(lat) || !Number.isFinite(lon)) return;

  const supabase = await createClient();
  await supabase.from("stamobject").insert({
    landgoed_id,
    naam,
    categorie,
    geometrie_type: "punt",
    herkomst: "handmatig",
    geaccordeerd: true,
    kenmerken: {
      lat,
      lon,
      adres: String(fd.get("adres") ?? ""),
      gemeente: String(fd.get("gemeente") ?? ""),
      provincie: String(fd.get("provincie") ?? ""),
    },
  });
  revalidatePath(`/landgoed/${landgoed_id}/kaart`);
}
