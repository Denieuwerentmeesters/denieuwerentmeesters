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

// Twee contacten die dezelfde partij blijken te zijn (bv. "Mts Dreessen"
// naast "Maatschap Dreessen" uit twee documenten) samenvoegen: alle
// koppelingen verhuizen naar het doelcontact, daarna verdwijnt de dubbele.
export async function voegContactSamen(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const contact_id = String(fd.get("contact_id"));
  const doel_id = String(fd.get("doel_contact_id"));
  if (!contact_id || !doel_id || contact_id === doel_id) return;
  const supabase = await createClient();

  // Beide contacten moeten van dit landgoed zijn — anders niets doen.
  const { data: beide } = await supabase
    .from("relatie")
    .select("id")
    .eq("landgoed_id", landgoed_id)
    .in("id", [contact_id, doel_id]);
  if ((beide ?? []).length !== 2) return;

  // Contractpartijen verhuizen (unieke combinatie contract+relatie+rol:
  // bestaat de koppeling al op het doel, dan vervalt de dubbele stil).
  const { data: partijRijen } = await supabase
    .from("contract_partij")
    .select("id, contract_id, rol")
    .eq("relatie_id", contact_id);
  for (const rij of partijRijen ?? []) {
    await moet(
      supabase.from("contract_partij").upsert(
        { landgoed_id, contract_id: rij.contract_id, relatie_id: doel_id, rol: rij.rol },
        { onConflict: "contract_id,relatie_id,rol", ignoreDuplicates: true },
      ),
      "contractpartij verhuizen",
    );
    await moet(
      supabase.from("contract_partij").delete().eq("id", rij.id),
      "oude contractpartij opruimen",
    );
  }

  // Contactrollen verhuizen (zelfde patroon).
  const { data: rolRijen } = await supabase
    .from("contact_rol")
    .select("id, rol_type_id, notitie")
    .eq("contact_id", contact_id);
  for (const rij of rolRijen ?? []) {
    await moet(
      supabase.from("contact_rol").upsert(
        { contact_id: doel_id, rol_type_id: rij.rol_type_id, notitie: rij.notitie },
        { onConflict: "contact_id,rol_type_id", ignoreDuplicates: true },
      ),
      "contactrol verhuizen",
    );
    await moet(
      supabase.from("contact_rol").delete().eq("id", rij.id),
      "oude contactrol opruimen",
    );
  }

  // Generieke verbanden en werkorder-uitvoerders volgen mee.
  await moet(
    supabase
      .from("verband")
      .update({ bron_id: doel_id })
      .eq("landgoed_id", landgoed_id)
      .eq("bron_type", "relatie")
      .eq("bron_id", contact_id),
    "verbanden (bron) verhuizen",
  );
  await moet(
    supabase
      .from("verband")
      .update({ doel_id: doel_id })
      .eq("landgoed_id", landgoed_id)
      .eq("doel_type", "relatie")
      .eq("doel_id", contact_id),
    "verbanden (doel) verhuizen",
  );
  await moet(
    supabase
      .from("werkorder")
      .update({ uitvoerder_relatie_id: doel_id })
      .eq("landgoed_id", landgoed_id)
      .eq("uitvoerder_relatie_id", contact_id),
    "werkorder-uitvoerders verhuizen",
  );

  await moet(
    supabase
      .from("relatie")
      .delete()
      .eq("id", contact_id)
      .eq("landgoed_id", landgoed_id),
    "dubbel contact verwijderen",
  );

  revalidatePath(`/landgoed/${landgoed_id}/contacten`);
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
