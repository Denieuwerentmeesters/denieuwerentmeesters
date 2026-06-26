"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  verwerkPrompt,
  extraheerActiepuntenMetMatching,
  type Contact,
} from "@/lib/ai";

export async function slaTranscriptOp(fd: FormData) {
  const gesprek_id = String(fd.get("gesprek_id"));
  const landgoed_id = String(fd.get("landgoed_id"));
  const tekst = String(fd.get("tekst") ?? "").trim();
  if (!tekst) return;

  const supabase = await createClient();

  // Verwijder oud transcript (als er al één is) en voeg nieuw toe
  await supabase.from("gesprek_transcript").delete().eq("gesprek_id", gesprek_id);
  await supabase.from("gesprek_transcript").insert({ gesprek_id, tekst });
  await supabase.from("gesprek").update({ status: "getranscribeerd" }).eq("id", gesprek_id);

  revalidatePath(`/landgoed/${landgoed_id}/vergaderingen/${gesprek_id}`);
}

export async function voerPromptUit(fd: FormData) {
  const gesprek_id = String(fd.get("gesprek_id"));
  const landgoed_id = String(fd.get("landgoed_id"));
  const sjabloon_id = String(fd.get("sjabloon_id"));

  const supabase = await createClient();

  const [{ data: transcript }, { data: sjabloon }, { data: contacten }] = await Promise.all([
    supabase.from("gesprek_transcript").select("tekst").eq("gesprek_id", gesprek_id).single(),
    supabase.from("prompt_sjabloon").select("id, titel, prompttekst, output_type").eq("id", sjabloon_id).single(),
    supabase.from("relatie").select("id, naam").eq("landgoed_id", landgoed_id).order("naam"),
  ]);

  if (!transcript || !sjabloon) return;

  // Verwijder eventuele bestaande bewerking voor dit sjabloon + gesprek
  await supabase
    .from("gesprek_bewerking")
    .delete()
    .eq("gesprek_id", gesprek_id)
    .eq("prompt_sjabloon_id", sjabloon_id);

  if (sjabloon.output_type === "taken") {
    const contactLijst: Contact[] = (contacten ?? []).map((c) => ({ id: c.id, naam: c.naam }));
    const voorstellen = await extraheerActiepuntenMetMatching(
      transcript.tekst,
      sjabloon.prompttekst,
      contactLijst,
    );

    // Sla bewerking op (output_tekst = samenvatting van aantallen)
    const { data: bewerking } = await supabase
      .from("gesprek_bewerking")
      .insert({
        gesprek_id,
        prompt_sjabloon_id: sjabloon_id,
        output_tekst: voorstellen ? `${voorstellen.length} actiepunt(en) gevonden` : "Geen actiepunten gevonden",
        status: "concept",
      })
      .select("id")
      .single();

    if (bewerking && voorstellen?.length) {
      // Verwijder oude voorstellen voor dit gesprek
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

  // Maak echte taak aan
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
