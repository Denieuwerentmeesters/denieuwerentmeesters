"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  verwerkPrompt,
  extraheerActiepuntenMetMatching,
  type Contact,
} from "@/lib/ai";
import { transcribeer } from "@/lib/transcriptie";
import { createServiceClient } from "@/lib/supabase/service";

export async function transcribeerAudio(fd: FormData) {
  const gesprek_id = String(fd.get("gesprek_id"));
  const landgoed_id = String(fd.get("landgoed_id"));
  const storage_pad = String(fd.get("storage_pad") ?? "").trim();
  if (!storage_pad) return { fout: "Geen storage pad ontvangen." };

  const service = createServiceClient();
  const { data: blob, error } = await service.storage.from("audio-opnames").download(storage_pad);
  if (error || !blob) return { fout: `Download mislukt: ${error?.message}` };

  // Verwijder bestand na download (AVG / opruimen)
  await service.storage.from("audio-opnames").remove([storage_pad]);

  const ext = storage_pad.split(".").pop() ?? "webm";
  const mimeType = ext === "m4a" || ext === "mp4" ? "audio/mp4" : ext === "mp3" ? "audio/mpeg" : "audio/webm";
  const buffer = Buffer.from(await blob.arrayBuffer());
  const tekst = await transcribeer(buffer, mimeType, `opname.${ext}`);
  if (!tekst) return { fout: "Transcriptie mislukt — controleer de GROQ_API_KEY." };

  const supabase = await createClient();
  await supabase.from("gesprek_transcript").delete().eq("gesprek_id", gesprek_id);
  await supabase.from("gesprek_transcript").insert({ gesprek_id, tekst });
  await supabase.from("gesprek").update({ status: "getranscribeerd" }).eq("id", gesprek_id);

  revalidatePath(`/landgoed/${landgoed_id}/vergaderingen/${gesprek_id}`);
  return { tekst };
}

export async function slaTranscriptOp(fd: FormData) {
  const gesprek_id = String(fd.get("gesprek_id"));
  const landgoed_id = String(fd.get("landgoed_id"));
  const tekst = String(fd.get("tekst") ?? "").trim();
  if (!tekst) return;

  const supabase = await createClient();
  await supabase.from("gesprek_transcript").delete().eq("gesprek_id", gesprek_id);
  await supabase.from("gesprek_transcript").insert({ gesprek_id, tekst });
  await supabase.from("gesprek").update({ status: "getranscribeerd" }).eq("id", gesprek_id);

  revalidatePath(`/landgoed/${landgoed_id}/vergaderingen/${gesprek_id}`);
}

// Voert één of meer prompts uit (multi-select via checkboxen).
export async function voerPromptsUit(fd: FormData) {
  const gesprek_id = String(fd.get("gesprek_id"));
  const landgoed_id = String(fd.get("landgoed_id"));
  const sjabloon_ids = fd.getAll("sjabloon_id").map(String).filter(Boolean);
  if (!sjabloon_ids.length) return;

  const supabase = await createClient();
  const [{ data: transcript }, { data: contacten }] = await Promise.all([
    supabase.from("gesprek_transcript").select("tekst").eq("gesprek_id", gesprek_id).single(),
    supabase.from("relatie").select("id, naam").eq("landgoed_id", landgoed_id).order("naam"),
  ]);
  if (!transcript) return;

  const contactLijst: Contact[] = (contacten ?? []).map((c) => ({ id: c.id, naam: c.naam }));

  for (const sjabloon_id of sjabloon_ids) {
    const { data: sjabloon } = await supabase
      .from("prompt_sjabloon")
      .select("id, prompttekst, output_type")
      .eq("id", sjabloon_id)
      .single();
    if (!sjabloon) continue;

    // Verwijder bestaande bewerking voor dit sjabloon zodat herdraaien werkt
    await supabase
      .from("gesprek_bewerking")
      .delete()
      .eq("gesprek_id", gesprek_id)
      .eq("prompt_sjabloon_id", sjabloon_id);

    if (sjabloon.output_type === "taken") {
      const voorstellen = await extraheerActiepuntenMetMatching(
        transcript.tekst,
        sjabloon.prompttekst,
        contactLijst,
      );

      await supabase.from("gesprek_bewerking").insert({
        gesprek_id,
        prompt_sjabloon_id: sjabloon_id,
        output_tekst: voorstellen ? `${voorstellen.length} actiepunt(en) gevonden` : "Geen actiepunten gevonden",
        status: "concept",
      });

      if (voorstellen?.length) {
        await supabase
          .from("gesprek_actie_voorstel")
          .delete()
          .eq("gesprek_id", gesprek_id)
          .eq("status", "voorgesteld");

        await supabase.from("gesprek_actie_voorstel").insert(
          voorstellen.map((v) => ({
            gesprek_id,
            omschrijving: v.omschrijving,
            bron_citaat: v.bron_citaat,
            contact_id: v.contact_id,
            match_status: v.match_status,
            match_kandidaten: v.match_kandidaten,
            deadline: v.deadline,
            deadline_is_interpretatie: v.deadline_is_interpretatie,
            status: "voorgesteld",
          })),
        );
      }
    } else {
      const output = await verwerkPrompt(transcript.tekst, sjabloon.prompttekst);
      await supabase.from("gesprek_bewerking").insert({
        gesprek_id,
        prompt_sjabloon_id: sjabloon_id,
        output_tekst: output ?? "(AI niet beschikbaar)",
        status: "concept",
      });
    }
  }

  // Eigen vrije prompt — elke uitvoering voegt een nieuw resultaat toe
  const custom_prompt = String(fd.get("custom_prompt") ?? "").trim();
  if (custom_prompt) {
    const output = await verwerkPrompt(transcript.tekst, custom_prompt);
    await supabase.from("gesprek_bewerking").insert({
      gesprek_id,
      prompt_sjabloon_id: null,
      output_tekst: output ?? "(AI niet beschikbaar)",
      status: "concept",
    });
  }

  await supabase.from("gesprek").update({ status: "verwerkt" }).eq("id", gesprek_id);
  revalidatePath(`/landgoed/${landgoed_id}/vergaderingen/${gesprek_id}`);
}

export async function bevestigActie(fd: FormData) {
  const voorstel_id = String(fd.get("voorstel_id"));
  const gesprek_id = String(fd.get("gesprek_id"));
  const landgoed_id = String(fd.get("landgoed_id"));
  const omschrijving = String(fd.get("omschrijving") ?? "").trim();
  const contact_id = String(fd.get("contact_id") ?? "").trim() || null;
  const deadline = String(fd.get("deadline") ?? "").trim() || null;

  const supabase = await createClient();

  await supabase
    .from("gesprek_actie_voorstel")
    .update({ status: "bevestigd", omschrijving, contact_id, deadline })
    .eq("id", voorstel_id);

  const contactNaam = contact_id
    ? (await supabase.from("relatie").select("naam").eq("id", contact_id).single()).data?.naam ?? null
    : null;

  await supabase.from("taak").insert({
    landgoed_id,
    titel: omschrijving,
    status: "open",
    deadline: deadline || null,
    toegewezen_aan_naam: contactNaam,
  });

  revalidatePath(`/landgoed/${landgoed_id}/vergaderingen/${gesprek_id}`);
}

export async function afwijsActie(fd: FormData) {
  const voorstel_id = String(fd.get("voorstel_id"));
  const gesprek_id = String(fd.get("gesprek_id"));
  const landgoed_id = String(fd.get("landgoed_id"));

  const supabase = await createClient();
  await supabase
    .from("gesprek_actie_voorstel")
    .update({ status: "afgewezen" })
    .eq("id", voorstel_id);

  revalidatePath(`/landgoed/${landgoed_id}/vergaderingen/${gesprek_id}`);
}

export async function ruimTranscriptOp(fd: FormData) {
  const gesprek_id = String(fd.get("gesprek_id"));
  const landgoed_id = String(fd.get("landgoed_id"));

  const supabase = await createClient();
  await supabase
    .from("gesprek_transcript")
    .update({ tekst: "", bewaren: false })
    .eq("gesprek_id", gesprek_id);
  await supabase.from("gesprek").update({ status: "opgeruimd" }).eq("id", gesprek_id);

  revalidatePath(`/landgoed/${landgoed_id}/vergaderingen/${gesprek_id}`);
}
