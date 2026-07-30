"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { zoekKansen } from "./matching";
import { subsidieBron, persisteerLopendeSubsidies } from "@/lib/extractie";
import { moet } from "@/lib/db";

export async function nieuweSubsidie(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const naam = String(fd.get("naam") ?? "").trim();
  if (!naam) return;
  const supabase = await createClient();
  await moet(
    supabase.from("subsidie").insert({
      landgoed_id,
      scope: "landgoed",
      soort: "lopend",
      naam,
      organisatie: String(fd.get("organisatie") ?? "").trim() || null,
      categorie: String(fd.get("categorie") ?? "subsidie"),
      bedrag_indicatie: String(fd.get("bedrag_indicatie") ?? "").trim() || null,
      deadline: String(fd.get("deadline") ?? "").trim() || null,
      status: "lopend",
    }),
    "subsidie opslaan",
  );
  revalidatePath(`/landgoed/${landgoed_id}/subsidies`);
}

// Spoor 2: match de catalogus tegen dit landgoed en vul de kansen-heatmap.
export async function zoekKansenActie(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const supabase = await createClient();
  await zoekKansen(supabase, landgoed_id);
  revalidatePath(`/landgoed/${landgoed_id}/subsidies`);
}

// Een kans wegklikken. Bewust géén delete: de regeling blijft in de catalogus en de
// rij blijft staan, zodat terugzetten kan en een herberekening hem niet ongevraagd
// weer opvoert. `nevenreden` wordt hier niet aangeraakt -- die is van de matchmotor.
export async function verbergKans(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const subsidie_id = String(fd.get("subsidie_id") ?? "").trim();
  if (!subsidie_id) return;
  const supabase = await createClient();
  const { data: gebruiker } = await supabase.auth.getUser();
  await moet(
    supabase
      .from("subsidie")
      .update({
        verborgen_op: new Date().toISOString(),
        verborgen_door: gebruiker?.user?.id ?? null,
      })
      .eq("id", subsidie_id)
      .eq("landgoed_id", landgoed_id), // multi-tenant: nooit buiten dit landgoed schrijven
    "kans verbergen",
  );
  revalidatePath(`/landgoed/${landgoed_id}/subsidies`);
}

export async function herstelKans(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const subsidie_id = String(fd.get("subsidie_id") ?? "").trim();
  if (!subsidie_id) return;
  const supabase = await createClient();
  await moet(
    supabase
      .from("subsidie")
      .update({ verborgen_op: null, verborgen_door: null })
      .eq("id", subsidie_id)
      .eq("landgoed_id", landgoed_id),
    "kans terugzetten",
  );
  revalidatePath(`/landgoed/${landgoed_id}/subsidies`);
}

// "Hulp nodig?" — zet een subsidie door als taak richting De Nieuwe Rentmeesters (signaleren).
export async function vraagHulp(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const subsidie_id = String(fd.get("subsidie_id") ?? "").trim();
  const naam = String(fd.get("naam") ?? "subsidie").trim();
  if (!subsidie_id) return;
  const supabase = await createClient();
  const taak = await moet(
    supabase
      .from("taak")
      .insert({
        landgoed_id,
        titel: `Subsidie laten uitzoeken: ${naam}`,
        omschrijving: "Aangevraagd via 'Hulp nodig?' op de subsidiekans.",
        status: "open",
        prioriteit: "midden",
      })
      .select("id")
      .single(),
    "taak opslaan",
  );
  await moet(
    supabase.from("verband").upsert(
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
    ),
    "verband opslaan",
  );
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
