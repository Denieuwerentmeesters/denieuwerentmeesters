"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { moet } from "@/lib/db";

// Losse Ja/Nee-vraag op de fondsenradar, direct opgeslagen — geen onderdeel
// van de GET-zoekopdracht (die staat in de URL, dit is een landgoedeigenschap
// die de ANBI-poort voedt, zie lib/fondsen/poort.ts::toetsAnbi).
export async function zetAnbiStatus(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id") ?? "");
  const is_anbi = fd.get("is_anbi") === "ja";
  if (!landgoed_id) return;
  const supabase = await createClient();
  await moet(
    supabase.from("landgoed").update({ is_anbi }).eq("id", landgoed_id),
    "ANBI-status opslaan",
  );
  revalidatePath(`/landgoed/${landgoed_id}/fondsen`);
  revalidatePath(`/landgoed/${landgoed_id}/profiel`);
}
