"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { aiBeschikbaar, aiModel } from "@/lib/ai";
import {
  documentBron,
  transactieBron,
  persisteerVoorstellen,
} from "@/lib/extractie";

function pad(landgoedId: string) {
  return `/landgoed/${landgoedId}/stamgegevens`;
}

async function verrijk(
  landgoedId: string,
  haal: (
    supabase: Awaited<ReturnType<typeof createClient>>,
  ) => Promise<{ resultaat: Awaited<ReturnType<typeof documentBron>>["resultaat"]; fout?: string }>,
  bronSoort: "document" | "transacties",
  bronId?: string,
) {
  const supabase = await createClient();
  const { data: g } = await supabase.auth.getUser();
  const { resultaat, fout } = await haal(supabase);

  if (resultaat) {
    await persisteerVoorstellen(supabase, {
      landgoedId,
      gebruikerId: g.user?.id,
      bronSoort,
      bronId,
      resultaat,
      model: aiModel(),
    });
  } else {
    await supabase.from("extractie_run").insert({
      landgoed_id: landgoedId,
      bron_soort: bronSoort,
      bron_id: bronId ?? null,
      model: aiModel(),
      aangemaakt_door: g.user?.id,
      fout:
        fout ??
        (aiBeschikbaar()
          ? "Geen voorstellen gevonden."
          : "AI niet beschikbaar (geen ANTHROPIC_API_KEY)."),
    });
  }
  revalidatePath(pad(landgoedId));
}

export async function verrijkUitDocument(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const document_id = String(fd.get("document_id") ?? "").trim();
  if (!document_id) return;
  await verrijk(
    landgoed_id,
    (s) => documentBron(s, landgoed_id, document_id),
    "document",
    document_id,
  );
}

export async function verrijkUitTransacties(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  await verrijk(landgoed_id, (s) => transactieBron(s, landgoed_id), "transacties");
}

// Eén "Lees met AI" voor elke bron: 'transacties' of 'doc:<uuid>'.
// (Later komen hier e-mail/boekhouding-bronnen bij — zelfde flow.)
export async function verrijkUitBron(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const bron = String(fd.get("bron") ?? "").trim();
  if (!bron) return;

  if (bron === "transacties") {
    await verrijk(
      landgoed_id,
      (s) => transactieBron(s, landgoed_id),
      "transacties",
    );
  } else if (bron.startsWith("doc:")) {
    const document_id = bron.slice(4);
    await verrijk(
      landgoed_id,
      (s) => documentBron(s, landgoed_id, document_id),
      "document",
      document_id,
    );
  }
}

export async function accordeerObject(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const id = String(fd.get("id"));
  const supabase = await createClient();
  await supabase.from("stamobject").update({ geaccordeerd: true }).eq("id", id);
  revalidatePath(pad(landgoed_id));
}

export async function wijsAfObject(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const id = String(fd.get("id"));
  const supabase = await createClient();
  // Voorstel verwijderen incl. de voorgestelde koppelingen ernaartoe.
  await supabase
    .from("verband")
    .delete()
    .eq("status", "voorgesteld")
    .or(`bron_id.eq.${id},doel_id.eq.${id}`);
  await supabase
    .from("stamobject")
    .delete()
    .eq("id", id)
    .eq("geaccordeerd", false);
  revalidatePath(pad(landgoed_id));
}

export async function accordeerVerband(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const id = String(fd.get("id"));
  const supabase = await createClient();
  await supabase
    .from("verband")
    .update({ status: "geaccordeerd" })
    .eq("id", id);
  revalidatePath(pad(landgoed_id));
}

export async function wijsAfVerband(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const id = String(fd.get("id"));
  const supabase = await createClient();
  await supabase.from("verband").update({ status: "afgewezen" }).eq("id", id);
  revalidatePath(pad(landgoed_id));
}

export async function objectHandmatig(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const naam = String(fd.get("naam") ?? "").trim();
  const categorie = String(fd.get("categorie") ?? "overig").trim();
  if (!naam) return;
  const supabase = await createClient();
  await supabase.from("stamobject").insert({
    landgoed_id,
    naam,
    categorie,
    herkomst: "handmatig",
    geaccordeerd: true,
  });
  revalidatePath(pad(landgoed_id));
}
