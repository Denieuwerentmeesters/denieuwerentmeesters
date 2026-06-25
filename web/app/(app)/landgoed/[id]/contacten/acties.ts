"use server";

import { createClient } from "@/lib/supabase/server";
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

  const { data: contact } = await supabase
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
    .single();

  if (contact) {
    const rolTypeId = tekst(fd, "rol_type_id");
    if (rolTypeId) {
      await supabase.from("contact_rol").insert({
        contact_id: contact.id,
        rol_type_id: rolTypeId,
      });
    }
  }

  revalidatePath(`/landgoed/${landgoed_id}/contacten`);
}

export async function bewerkContact(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const contact_id = String(fd.get("contact_id"));
  const supabase = await createClient();

  await supabase
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
    .eq("landgoed_id", landgoed_id);

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

  await supabase.from("contact_rol").upsert(
    { contact_id, rol_type_id, notitie },
    { onConflict: "contact_id,rol_type_id", ignoreDuplicates: false }
  );

  revalidatePath(`/landgoed/${landgoed_id}/contacten/${contact_id}`);
}

export async function verwijderRol(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const contact_id = String(fd.get("contact_id"));
  const contact_rol_id = String(fd.get("contact_rol_id"));
  const supabase = await createClient();

  await supabase.from("contact_rol").delete().eq("id", contact_rol_id);

  revalidatePath(`/landgoed/${landgoed_id}/contacten/${contact_id}`);
}

export async function maakRolType(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const naam = tekst(fd, "naam");
  const contact_id = tekst(fd, "contact_id");
  if (!naam) return;
  const supabase = await createClient();

  const { data: rolType } = await supabase
    .from("rol_type")
    .insert({
      naam,
      groep: tekst(fd, "groep") ?? "overig",
      systeem: false,
      tenant_id: landgoed_id,
    })
    .select("id")
    .single();

  if (rolType && contact_id) {
    await supabase.from("contact_rol").insert({
      contact_id,
      rol_type_id: rolType.id,
    });
    revalidatePath(`/landgoed/${landgoed_id}/contacten/${contact_id}`);
  }

  revalidatePath(`/landgoed/${landgoed_id}/contacten`);
}

export async function archiveerContact(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const contact_id = String(fd.get("contact_id"));
  const supabase = await createClient();

  await supabase
    .from("relatie")
    .update({ status: "gearchiveerd" })
    .eq("id", contact_id)
    .eq("landgoed_id", landgoed_id);

  revalidatePath(`/landgoed/${landgoed_id}/contacten`);
}
