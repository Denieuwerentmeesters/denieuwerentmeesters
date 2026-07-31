"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { transcribeer } from "@/lib/transcriptie";
import { createServiceClient } from "@/lib/supabase/service";
import { isLidVan } from "@/lib/auth";
import { moet } from "@/lib/db";
import { revalidatePath } from "next/cache";

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

  // Client-consumed actie: fouten teruggeven als { fout } zodat de UI ze toont.
  const { data: gesprek, error: gesprekFout } = await supabase
    .from("gesprek")
    .insert({ landgoed_id, titel, datum, status: "getranscribeerd" })
    .select("id")
    .single();
  if (gesprekFout || !gesprek) {
    return { fout: `Gesprek aanmaken mislukt: ${gesprekFout?.message ?? "onbekende fout"}` };
  }

  const { error: transcriptFout } = await supabase
    .from("gesprek_transcript")
    .insert({ gesprek_id: gesprek.id, tekst });
  if (transcriptFout) {
    return { fout: `Transcript opslaan mislukt: ${transcriptFout.message}` };
  }

  redirect(`/landgoed/${landgoed_id}/vergaderingen/${gesprek.id}`);
}

export async function maakGesprek(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const titel = String(fd.get("titel") ?? "").trim();
  const datum = String(fd.get("datum") ?? "").trim() || null;
  const transcript = String(fd.get("transcript") ?? "").trim();
  if (!titel) return;

  const supabase = await createClient();

  const gesprek = await moet(
    supabase
      .from("gesprek")
      .insert({ landgoed_id, titel, datum, status: transcript ? "getranscribeerd" : "nieuw" })
      .select("id")
      .single(),
    "gesprek aanmaken",
  );

  if (transcript) {
    await moet(
      supabase
        .from("gesprek_transcript")
        .insert({ gesprek_id: gesprek.id, tekst: transcript }),
      "transcript opslaan",
    );
  }

  redirect(`/landgoed/${landgoed_id}/vergaderingen/${gesprek.id}`);
}

// ── Notulen definitief maken: laten doorstromen naar het archief ─────────
//
// Notulen leven in gesprek_bewerking en blijven daar leven; het document verwijst
// ernaar en dupliceert de tekst niet als bestand. Zodra een bewerking definitief is,
// hoort hij vindbaar te zijn waar iemand hem zoekt — in het documentenarchief, onder
// "Vergaderingen en verslagen".
//
// De herkomst legt de categorie vast, dus dit is de route 'bron': geen AI, geen
// bevestigingsstap (categorie_geaccordeerd = true).
//
// Wordt de bewerking later opnieuw gedraaid, dan wordt de bestaande document-rij
// bijgewerkt in plaats van dat er een tweede bijkomt. De koppeling naar de bewerking
// is daarvoor de identiteit — een koppeling naar het gesprek zou te grof zijn, want
// één vergadering kan meerdere bewerkingen hebben.
export async function maakBewerkingDefinitief(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const gesprek_id = String(fd.get("gesprek_id"));
  const bewerking_id = String(fd.get("bewerking_id"));
  if (!landgoed_id || !gesprek_id || !bewerking_id) return;
  if (!(await isLidVan(landgoed_id))) return;

  const supabase = await createClient();

  // Het gesprek moet bij dít landgoed horen — anders zou een gesprek_id uit een
  // ander landgoed hier een document kunnen laten aanmaken.
  const { data: gesprek, error: gesprekFout } = await supabase
    .from("gesprek")
    .select("id, titel, datum")
    .eq("id", gesprek_id)
    .eq("landgoed_id", landgoed_id)
    .maybeSingle();
  if (gesprekFout) throw new Error(`gesprek ophalen mislukt: ${gesprekFout.message}`);
  if (!gesprek) return;

  const { data: bewerking, error: bewerkingFout } = await supabase
    .from("gesprek_bewerking")
    .select("id, output_tekst, prompt_sjabloon(titel)")
    .eq("id", bewerking_id)
    .eq("gesprek_id", gesprek_id)
    .maybeSingle();
  if (bewerkingFout) throw new Error(`bewerking ophalen mislukt: ${bewerkingFout.message}`);
  if (!bewerking?.output_tekst?.trim()) return;

  await moet(
    supabase
      .from("gesprek_bewerking")
      .update({ status: "definitief" })
      .eq("id", bewerking_id)
      .eq("gesprek_id", gesprek_id),
    "notulen definitief maken",
  );

  const sjabloon = bewerking.prompt_sjabloon as unknown as { titel?: string } | null;
  const datum = gesprek.datum
    ? new Date(gesprek.datum).toLocaleDateString("nl-NL")
    : null;
  const titel = `${sjabloon?.titel ?? "Verslag"} — ${gesprek.titel}${datum ? ` (${datum})` : ""}`;
  // De tekst zelf blijft in gesprek_bewerking; het document draagt een korte
  // samenvatting zodat de archieflijst leesbaar is zonder het gesprek te openen.
  const samenvatting = bewerking.output_tekst.trim().slice(0, 300);

  // Bestaat er al een document voor déze bewerking? Dan bijwerken.
  const { data: bestaand, error: zoekFout } = await supabase
    .from("document_koppeling")
    .select("document_id")
    .eq("doel_soort", "gesprek_bewerking")
    .eq("doel_id", bewerking_id)
    .maybeSingle();
  if (zoekFout) throw new Error(`bestaand document zoeken mislukt: ${zoekFout.message}`);

  if (bestaand?.document_id) {
    await moet(
      supabase
        .from("document")
        .update({ titel, samenvatting })
        .eq("id", bestaand.document_id)
        .eq("landgoed_id", landgoed_id),
      "notulendocument bijwerken",
    );
  } else {
    const { data: gebruiker } = await supabase.auth.getUser();
    const doc = await moet(
      supabase
        .from("document")
        .insert({
          landgoed_id,
          scope: "landgoed",
          titel,
          samenvatting,
          geupload_door: gebruiker.user?.id,
          categorie: "vergaderingen",
          categorie_herkomst: "bron",
          categorie_geaccordeerd: true,
          soort: "archiefstuk",
        })
        .select("id")
        .single(),
      "notulendocument opslaan",
    );

    await moet(
      supabase.from("document_koppeling").upsert(
        [
          { document_id: doc.id, doel_soort: "gesprek_bewerking", doel_id: bewerking_id },
          { document_id: doc.id, doel_soort: "gesprek", doel_id: gesprek_id },
        ],
        { onConflict: "document_id,doel_soort,doel_id" },
      ),
      "notulendocument koppelen",
    );
  }

  revalidatePath(`/landgoed/${landgoed_id}/vergaderingen/${gesprek_id}`);
  revalidatePath(`/landgoed/${landgoed_id}/documenten`);
  revalidatePath(`/landgoed/${landgoed_id}/documenten/vergaderingen`);
}
