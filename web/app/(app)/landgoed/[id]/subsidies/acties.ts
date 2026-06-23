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

// "Hulp nodig?" — zet een subsidie door als taak richting De Nieuwe Rentmeesters (signaleren).
export async function vraagHulp(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const subsidie_id = String(fd.get("subsidie_id") ?? "").trim();
  const naam = String(fd.get("naam") ?? "subsidie").trim();
  if (!subsidie_id) return;
  const supabase = await createClient();
  const { data: taak } = await supabase
    .from("taak")
    .insert({
      landgoed_id,
      titel: `Subsidie laten uitzoeken: ${naam}`,
      omschrijving: "Aangevraagd via 'Hulp nodig?' op de subsidiekans.",
      status: "open",
      prioriteit: "midden",
    })
    .select("id")
    .single();
  if (taak) {
    await supabase.from("verband").upsert(
      {
        landgoed_id,
        bron_type: "subsidie",
        bron_id: subsidie_id,
        doel_type: "taak",
        doel_id: taak.id,
        rol: "uitzoeken",
        status: "geaccordeerd",
      },
      { onConflict: "bron_type,bron_id,doel_type,doel_id,rol", ignoreDuplicates: true },
    );
  }
  revalidatePath(`/landgoed/${landgoed_id}/subsidies/${subsidie_id}`);
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
