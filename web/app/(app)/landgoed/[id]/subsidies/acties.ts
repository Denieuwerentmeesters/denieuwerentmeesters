"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { zoekKansen } from "./matching";
import { subsidieBron, persisteerLopendeSubsidies } from "@/lib/extractie";

export async function nieuweSubsidie(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const naam = String(fd.get("naam") ?? "").trim();
  if (!naam) return;
  const supabase = await createClient();
  await supabase.from("subsidie").insert({
    landgoed_id,
    scope: "landgoed",
    soort: "lopend",
    naam,
    organisatie: String(fd.get("organisatie") ?? "").trim() || null,
    categorie: String(fd.get("categorie") ?? "subsidie"),
    bedrag_indicatie: String(fd.get("bedrag_indicatie") ?? "").trim() || null,
    deadline: String(fd.get("deadline") ?? "").trim() || null,
    status: "lopend",
  });
  revalidatePath(`/landgoed/${landgoed_id}/subsidies`);
}

// Spoor 2: match de catalogus tegen dit landgoed en vul de kansen-heatmap.
export async function zoekKansenActie(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const supabase = await createClient();
  await zoekKansen(supabase, landgoed_id);
  revalidatePath(`/landgoed/${landgoed_id}/subsidies`);
}

// Datastroom B: lees lopende subsidies uit een geüpload document (§4a).
export async function leesLopendeUitDocument(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const document_id = String(fd.get("document_id") ?? "").trim();
  if (!document_id) return;
  const supabase = await createClient();
  const { lijst } = await subsidieBron(supabase, document_id);
  if (lijst?.length) {
    await persisteerLopendeSubsidies(supabase, {
      landgoedId: landgoed_id,
      documentId: document_id,
      lijst,
    });
  }
  revalidatePath(`/landgoed/${landgoed_id}/subsidies`);
}
