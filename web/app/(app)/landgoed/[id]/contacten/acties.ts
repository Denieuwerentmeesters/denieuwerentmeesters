"use server";

import { createClient } from "@/lib/supabase/server";
import { moet } from "@/lib/db";
import { revalidatePath } from "next/cache";

function tekst(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function nieuwContact(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const naam = tekst(fd, "naam");
  if (!naam) return;
  const supabase = await createClient();

  const contact = await moet(
    supabase
      .from("relatie")
      .insert({
        landgoed_id,
        naam,
        organisatie: tekst(fd, "organisatie"),
        email: tekst(fd, "email"),
        telefoon: tekst(fd, "telefoon"),
        omschrijving: tekst(fd, "omschrijving"),
        status: tekst(fd, "status") ?? "actief",
        bron: tekst(fd, "bron"),
      })
      .select("id")
      .single(),
    "contact aanmaken",
  );

  const rolTypeId = tekst(fd, "rol_type_id");
  if (rolTypeId) {
    await moet(
      supabase.from("contact_rol").insert({
        contact_id: contact.id,
        rol_type_id: rolTypeId,
      }),
      "rol toevoegen",
    );
  }

  revalidatePath(`/landgoed/${landgoed_id}/contacten`);
}

export async function bewerkContact(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const contact_id = String(fd.get("contact_id"));
  const supabase = await createClient();

  await moet(
    supabase
      .from("relatie")
      .update({
        naam: tekst(fd, "naam"),
        organisatie: tekst(fd, "organisatie"),
        email: tekst(fd, "email"),
        telefoon: tekst(fd, "telefoon"),
        omschrijving: tekst(fd, "omschrijving"),
        verantwoordelijkheden: tekst(fd, "verantwoordelijkheden"),
        status: tekst(fd, "status") ?? "actief",
        bron: tekst(fd, "bron"),
      })
      .eq("id", contact_id)
      .eq("landgoed_id", landgoed_id),
    "contact bijwerken",
  );

  revalidatePath(`/landgoed/${landgoed_id}/contacten`);
  revalidatePath(`/landgoed/${landgoed_id}/contacten/${contact_id}`);
}

export async function voegRolToe(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const contact_id = String(fd.get("contact_id"));
  const rol_type_id = tekst(fd, "rol_type_id");
  const notitie = tekst(fd, "notitie");
  if (!rol_type_id) return;
  const supabase = await createClient();

  await moet(
    supabase.from("contact_rol").upsert(
      { contact_id, rol_type_id, notitie },
      { onConflict: "contact_id,rol_type_id", ignoreDuplicates: false }
    ),
    "rol toevoegen",
  );

  revalidatePath(`/landgoed/${landgoed_id}/contacten/${contact_id}`);
}

export async function verwijderRol(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const contact_id = String(fd.get("contact_id"));
  const contact_rol_id = String(fd.get("contact_rol_id"));
  const supabase = await createClient();

  await moet(
    supabase.from("contact_rol").delete().eq("id", contact_rol_id),
    "rol verwijderen",
  );

  revalidatePath(`/landgoed/${landgoed_id}/contacten/${contact_id}`);
}

export async function maakRolType(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const naam = tekst(fd, "naam");
  const contact_id = tekst(fd, "contact_id");
  if (!naam) return;
  const supabase = await createClient();

  const rolType = await moet(
    supabase
      .from("rol_type")
      .insert({
        naam,
        groep: tekst(fd, "groep") ?? "overig",
        systeem: false,
        tenant_id: landgoed_id,
      })
      .select("id")
      .single(),
    "rol-type aanmaken",
  );

  if (contact_id) {
    await moet(
      supabase.from("contact_rol").insert({
        contact_id,
        rol_type_id: rolType.id,
      }),
      "rol toevoegen",
    );
    revalidatePath(`/landgoed/${landgoed_id}/contacten/${contact_id}`);
  }

  revalidatePath(`/landgoed/${landgoed_id}/contacten`);
}

// Een door de AI aangemaakt contact (uit een contract-pdf) bevestigen:
// de gebruiker heeft het nagekeken, dus geaccordeerd. De herkomst blijft
// 'ai' staan — dat is eerlijke geschiedenis, geen smet.
export async function bevestigContact(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const contact_id = String(fd.get("contact_id"));
  const supabase = await createClient();

  await moet(
    supabase
      .from("relatie")
      .update({ geaccordeerd: true })
      .eq("id", contact_id)
      .eq("landgoed_id", landgoed_id),
    "contact bevestigen",
  );

  revalidatePath(`/landgoed/${landgoed_id}/contacten`);
  revalidatePath(`/landgoed/${landgoed_id}/contacten/${contact_id}`);
}

export async function archiveerContact(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const contact_id = String(fd.get("contact_id"));
  const supabase = await createClient();

  await moet(
    supabase
      .from("relatie")
      .update({ status: "gearchiveerd" })
      .eq("id", contact_id)
      .eq("landgoed_id", landgoed_id),
    "contact archiveren",
  );

  revalidatePath(`/landgoed/${landgoed_id}/contacten`);
}
