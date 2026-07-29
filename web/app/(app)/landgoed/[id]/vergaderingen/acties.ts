"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { transcribeer } from "@/lib/transcriptie";
import { createServiceClient } from "@/lib/supabase/service";
import { isLidVan } from "@/lib/auth";

// Transcribeert audio (via Storage), maakt direct een gesprek aan en stuurt door naar de detailpagina.
export async function maakGesprekVanAudio(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const storage_paden = fd.getAll("storage_pad").map(String).filter(Boolean);
  if (!storage_paden.length) return { fout: "Geen storage pad ontvangen." };

  // Eigenaarscheck: de service-client hieronder omzeilt RLS, dus verifieer hier
  // dat de gebruiker lid is van dit landgoed én dat elk pad erbinnen valt.
  if (!landgoed_id || !(await isLidVan(landgoed_id))) {
    return { fout: "Geen toegang tot dit landgoed." };
  }
  const padPrefix = `${landgoed_id}/`;
  if (storage_paden.some((p) => !p.startsWith(padPrefix))) {
    return { fout: "Ongeldig opslagpad." };
  }

  const service = createServiceClient();
  const teksten: string[] = [];

  for (const pad of storage_paden) {
    const { data: blob, error } = await service.storage.from("audio-opnames").download(pad);
    await service.storage.from("audio-opnames").remove([pad]);
    if (error || !blob) return { fout: `Download mislukt: ${error?.message}` };
    const ext = pad.split(".").pop() ?? "webm";
    const mimeType = ext === "wav" ? "audio/wav" : ext === "m4a" || ext === "mp4" ? "audio/mp4" : ext === "mp3" ? "audio/mpeg" : "audio/webm";
    const buffer = Buffer.from(await blob.arrayBuffer());
    const deelTekst = await transcribeer(buffer, mimeType, `opname.${ext}`);
    if (!deelTekst) return { fout: "Transcriptie mislukt — controleer de GROQ_API_KEY." };
    teksten.push(deelTekst);
  }

  const tekst = teksten.join("\n\n");

  const supabase = await createClient();
  const vandaag = new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long" });
  const titel = `Opname ${vandaag}`;
  const datum = new Date().toISOString().slice(0, 10);

  const { data: gesprek } = await supabase
    .from("gesprek")
    .insert({ landgoed_id, titel, datum, status: "getranscribeerd" })
    .select("id")
    .single();

  if (!gesprek) return { fout: "Gesprek aanmaken mislukt." };

  await supabase.from("gesprek_transcript").insert({ gesprek_id: gesprek.id, tekst });

  redirect(`/landgoed/${landgoed_id}/vergaderingen/${gesprek.id}`);
}

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
