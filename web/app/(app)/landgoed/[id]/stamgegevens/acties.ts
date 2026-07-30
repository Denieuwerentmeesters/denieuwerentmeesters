"use server";

import { createClient } from "@/lib/supabase/server";
import { moet } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { aiBeschikbaar, aiModel, laatsteAiFout } from "@/lib/ai";
import {
  documentBron,
  transactieBron,
  persisteerVoorstellen,
} from "@/lib/extractie";

// Het stamgegevens-beheer staat op /stamgegevens én /profiel (gedeelde
// component), en de verband-acties draaien ook op objectpagina's — ververs
// daarom de hele landgoed-boom in plaats van één route.
function pad(landgoedId: string): [string, "layout"] {
  return [`/landgoed/${landgoedId}`, "layout"];
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
    await moet(
      supabase.from("extractie_run").insert({
        landgoed_id: landgoedId,
        bron_soort: bronSoort,
        bron_id: bronId ?? null,
        model: aiModel(),
        aangemaakt_door: g.user?.id,
        fout:
          fout ??
          laatsteAiFout() ??
          (aiBeschikbaar()
            ? "Geen voorstellen gevonden."
            : "AI niet beschikbaar (geen ANTHROPIC_API_KEY)."),
      }),
      "extractie-run vastleggen",
    );
  }
  revalidatePath(...pad(landgoedId));
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
  await moet(
    supabase.from("stamobject").update({ geaccordeerd: true }).eq("id", id),
    "stamobject accorderen",
  );
  // Koppelingen worden als label onder het object getoond: bij accorderen van het
  // object lopen ook de voorgestelde koppelingen ernaartoe mee.
  await moet(
    supabase
      .from("verband")
      .update({ status: "geaccordeerd" })
      .eq("status", "voorgesteld")
      .or(`bron_id.eq.${id},doel_id.eq.${id}`),
    "koppelingen accorderen",
  );
  revalidatePath(...pad(landgoed_id));
}

// Twee voorstellen/objecten samenvoegen: het AI-voorstel (id) wordt opgeslokt door
// een bestaand object (doel_id). Onderdelen en voorgestelde koppelingen verhuizen mee.
export async function voegSamen(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const id = String(fd.get("id")); // het voorstel dat verdwijnt
  const doel_id = String(fd.get("doel_id")); // het bestaande object dat blijft
  if (!id || !doel_id || id === doel_id) return;
  const supabase = await createClient();
  // Eventuele onderdelen herhangen naar het bestaande object.
  await moet(
    supabase
      .from("stamobject")
      .update({ bovenliggend_id: doel_id })
      .eq("bovenliggend_id", id),
    "onderdelen herhangen",
  );
  // Voorgestelde koppelingen herhangen (bron- en doelzijde).
  await moet(
    supabase
      .from("verband")
      .update({ bron_id: doel_id })
      .eq("status", "voorgesteld")
      .eq("bron_id", id),
    "koppeling-bron herhangen",
  );
  await moet(
    supabase
      .from("verband")
      .update({ doel_id: doel_id })
      .eq("status", "voorgesteld")
      .eq("doel_id", id),
    "koppeling-doel herhangen",
  );
  // Het voorstel zelf verwijderen (alleen als het nog een voorstel is).
  await moet(
    supabase
      .from("stamobject")
      .delete()
      .eq("id", id)
      .eq("geaccordeerd", false),
    "voorstel verwijderen",
  );
  revalidatePath(...pad(landgoed_id));
}

export async function wijsAfObject(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const id = String(fd.get("id"));
  const supabase = await createClient();
  // Voorstel verwijderen incl. de voorgestelde koppelingen ernaartoe.
  await moet(
    supabase
      .from("verband")
      .delete()
      .eq("status", "voorgesteld")
      .or(`bron_id.eq.${id},doel_id.eq.${id}`),
    "voorgestelde koppelingen verwijderen",
  );
  await moet(
    supabase
      .from("stamobject")
      .delete()
      .eq("id", id)
      .eq("geaccordeerd", false),
    "voorstel afwijzen",
  );
  revalidatePath(...pad(landgoed_id));
}

export async function accordeerVerband(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const id = String(fd.get("id"));
  const supabase = await createClient();
  await moet(
    supabase.from("verband").update({ status: "geaccordeerd" }).eq("id", id),
    "verband accorderen",
  );
  revalidatePath(...pad(landgoed_id));
}

export async function wijsAfVerband(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const id = String(fd.get("id"));
  const supabase = await createClient();
  await moet(
    supabase.from("verband").update({ status: "afgewezen" }).eq("id", id),
    "verband afwijzen",
  );
  revalidatePath(...pad(landgoed_id));
}

export async function objectHandmatig(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const naam = String(fd.get("naam") ?? "").trim();
  const categorie = String(fd.get("categorie") ?? "overig").trim();
  if (!naam) return;
  const supabase = await createClient();
  await moet(
    supabase.from("stamobject").insert({
      landgoed_id,
      naam,
      categorie,
      herkomst: "handmatig",
      geaccordeerd: true,
    }),
    "stamobject aanmaken",
  );
  revalidatePath(...pad(landgoed_id));
}

// Een stamgegeven bewerken (naam, categorie, gebruik, beschrijving).
export async function bewerkObject(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const id = String(fd.get("id"));
  const naam = String(fd.get("naam") ?? "").trim();
  const categorie = String(fd.get("categorie") ?? "").trim();
  const beschrijving = String(fd.get("beschrijving") ?? "").trim();
  const gebruik = String(fd.get("gebruik") ?? "").trim();
  // Leeg of gelijk-aan-zichzelf => hoofdobject (geen bovenliggend).
  const bovenliggendRaw = String(fd.get("bovenliggend_id") ?? "").trim();
  const bovenliggend_id =
    bovenliggendRaw && bovenliggendRaw !== id ? bovenliggendRaw : null;
  if (!id || !naam) return;

  const supabase = await createClient();
  const { data: best } = await supabase
    .from("stamobject")
    .select("kenmerken")
    .eq("id", id)
    .maybeSingle();
  const kenmerken = {
    ...((best?.kenmerken as object) ?? {}),
    gebruik: gebruik || null,
  };
  await moet(
    supabase
      .from("stamobject")
      .update({
        naam,
        categorie: categorie || "overig",
        beschrijving: beschrijving || null,
        kenmerken,
        bovenliggend_id,
      })
      .eq("id", id),
    "stamobject bijwerken",
  );
  revalidatePath(...pad(landgoed_id));
}

// Een stamgegeven verwijderen (incl. koppelingen ernaartoe).
export async function verwijderObject(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const id = String(fd.get("id"));
  if (!id) return;
  const supabase = await createClient();
  await moet(
    supabase
      .from("verband")
      .delete()
      .or(`bron_id.eq.${id},doel_id.eq.${id}`),
    "koppelingen verwijderen",
  );
  await moet(
    supabase.from("stamobject").delete().eq("id", id),
    "stamobject verwijderen",
  );
  revalidatePath(...pad(landgoed_id));
}
