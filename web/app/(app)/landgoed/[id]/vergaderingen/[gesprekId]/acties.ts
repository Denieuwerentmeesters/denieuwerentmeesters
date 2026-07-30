"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  verwerkPrompt,
  extraheerActiepuntenMetMatching,
  type Contact,
} from "@/lib/ai";
import { transcribeer } from "@/lib/transcriptie";
import { createServiceClient } from "@/lib/supabase/service";
import { isLidVan } from "@/lib/auth";
import { moet } from "@/lib/db";

export async function transcribeerAudio(fd: FormData) {
  const gesprek_id = String(fd.get("gesprek_id"));
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
  // Client-consumed actie: DB-fouten als { fout } teruggeven zodat de UI ze toont.
  try {
    await moet(
      supabase.from("gesprek_transcript").delete().eq("gesprek_id", gesprek_id),
      "oude transcript wissen",
    );
    await moet(
      supabase.from("gesprek_transcript").insert({ gesprek_id, tekst }),
      "transcript opslaan",
    );
    await moet(
      supabase.from("gesprek").update({ status: "getranscribeerd" }).eq("id", gesprek_id),
      "status bijwerken",
    );
  } catch (e) {
    return { fout: e instanceof Error ? e.message : "Transcript opslaan mislukt." };
  }

  revalidatePath(`/landgoed/${landgoed_id}/vergaderingen/${gesprek_id}`);
  return { tekst };
}

export async function slaTranscriptOp(fd: FormData) {
  const gesprek_id = String(fd.get("gesprek_id"));
  const landgoed_id = String(fd.get("landgoed_id"));
  const tekst = String(fd.get("tekst") ?? "").trim();
  if (!tekst) return;

  const supabase = await createClient();
  await moet(
    supabase.from("gesprek_transcript").delete().eq("gesprek_id", gesprek_id),
    "oude transcript wissen",
  );
  await moet(
    supabase.from("gesprek_transcript").insert({ gesprek_id, tekst }),
    "transcript opslaan",
  );
  await moet(
    supabase.from("gesprek").update({ status: "getranscribeerd" }).eq("id", gesprek_id),
    "status bijwerken",
  );

  redirect(`/landgoed/${landgoed_id}/vergaderingen/${gesprek_id}`);
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
    await moet(
      supabase
        .from("gesprek_bewerking")
        .delete()
        .eq("gesprek_id", gesprek_id)
        .eq("prompt_sjabloon_id", sjabloon_id),
      "oude bewerking verwijderen",
    );

    if (sjabloon.output_type === "taken") {
      const voorstellen = await extraheerActiepuntenMetMatching(
        transcript.tekst,
        sjabloon.prompttekst,
        contactLijst,
      );

      await moet(
        supabase.from("gesprek_bewerking").insert({
          gesprek_id,
          prompt_sjabloon_id: sjabloon_id,
          output_tekst: voorstellen ? `${voorstellen.length} actiepunt(en) gevonden` : "Geen actiepunten gevonden",
          status: "concept",
        }),
        "bewerking opslaan",
      );

      if (voorstellen?.length) {
        await moet(
          supabase
            .from("gesprek_actie_voorstel")
            .delete()
            .eq("gesprek_id", gesprek_id)
            .eq("status", "voorgesteld"),
          "oude actievoorstellen verwijderen",
        );

        await moet(
          supabase.from("gesprek_actie_voorstel").insert(
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
          ),
          "actievoorstellen opslaan",
        );
      }
    } else {
      const output = await verwerkPrompt(transcript.tekst, sjabloon.prompttekst);
      await moet(
        supabase.from("gesprek_bewerking").insert({
          gesprek_id,
          prompt_sjabloon_id: sjabloon_id,
          output_tekst: output ?? "(AI niet beschikbaar)",
          status: "concept",
        }),
        "bewerking opslaan",
      );
    }
  }

  // Eigen vrije prompt — elke uitvoering voegt een nieuw resultaat toe
  const custom_prompt = String(fd.get("custom_prompt") ?? "").trim();
  if (custom_prompt) {
    const output = await verwerkPrompt(transcript.tekst, custom_prompt);
    await moet(
      supabase.from("gesprek_bewerking").insert({
        gesprek_id,
        prompt_sjabloon_id: null,
        output_tekst: output ?? "(AI niet beschikbaar)",
        status: "concept",
      }),
      "bewerking opslaan",
    );
  }

  await moet(
    supabase.from("gesprek").update({ status: "verwerkt" }).eq("id", gesprek_id),
    "gesprek-status bijwerken",
  );
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

  await moet(
    supabase
      .from("gesprek_actie_voorstel")
      .update({ status: "bevestigd", omschrijving, contact_id, deadline })
      .eq("id", voorstel_id),
    "actievoorstel bevestigen",
  );

  const contactNaam = contact_id
    ? (await supabase.from("relatie").select("naam").eq("id", contact_id).single()).data?.naam ?? null
    : null;

  await moet(
    supabase.from("taak").insert({
      landgoed_id,
      titel: omschrijving,
      status: "open",
      deadline: deadline || null,
      toegewezen_aan_naam: contactNaam,
    }),
    "taak aanmaken",
  );

  revalidatePath(`/landgoed/${landgoed_id}/vergaderingen/${gesprek_id}`);
}

export async function afwijsActie(fd: FormData) {
  const voorstel_id = String(fd.get("voorstel_id"));
  const gesprek_id = String(fd.get("gesprek_id"));
  const landgoed_id = String(fd.get("landgoed_id"));

  const supabase = await createClient();
  await moet(
    supabase
      .from("gesprek_actie_voorstel")
      .update({ status: "afgewezen" })
      .eq("id", voorstel_id),
    "actievoorstel afwijzen",
  );

  revalidatePath(`/landgoed/${landgoed_id}/vergaderingen/${gesprek_id}`);
}

export async function ruimTranscriptOp(fd: FormData) {
  const gesprek_id = String(fd.get("gesprek_id"));
  const landgoed_id = String(fd.get("landgoed_id"));

  const supabase = await createClient();
  await moet(
    supabase
      .from("gesprek_transcript")
      .update({ tekst: "", bewaren: false })
      .eq("gesprek_id", gesprek_id),
    "transcript opruimen",
  );
  await moet(
    supabase.from("gesprek").update({ status: "opgeruimd" }).eq("id", gesprek_id),
    "gesprek-status bijwerken",
  );

  revalidatePath(`/landgoed/${landgoed_id}/vergaderingen/${gesprek_id}`);
}
