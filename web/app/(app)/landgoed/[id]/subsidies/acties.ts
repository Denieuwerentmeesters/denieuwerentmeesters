"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function nieuweSubsidie(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const naam = String(fd.get("naam") ?? "").trim();
  if (!naam) return;
  const supabase = await createClient();
  await supabase.from("subsidie").insert({
    landgoed_id,
    scope: "landgoed",
    naam,
    organisatie: String(fd.get("organisatie") ?? "").trim() || null,
    categorie: String(fd.get("categorie") ?? "subsidie"),
    bedrag_indicatie: String(fd.get("bedrag_indicatie") ?? "").trim() || null,
    deadline: String(fd.get("deadline") ?? "").trim() || null,
    status: "verkennen",
  });
  revalidatePath(`/landgoed/${landgoed_id}/subsidies`);
}
