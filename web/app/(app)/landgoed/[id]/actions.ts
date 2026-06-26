"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

function tekst(fd: FormData, k: string) {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
}
function getal(fd: FormData, k: string) {
  const v = tekst(fd, k);
  return v === null ? null : Number(v.replace(",", "."));
}

// ── Taken ──
export async function nieuweTaak(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const titel = tekst(fd, "titel");
  if (!titel) return;
  const supabase = await createClient();
  await supabase.from("taak").insert({
    landgoed_id,
    titel,
    prioriteit: tekst(fd, "prioriteit"),
    deadline: tekst(fd, "deadline"),
    status: "open",
  });
  revalidatePath(`/landgoed/${landgoed_id}/taken`);
}

export async function taakAfronden(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const id = String(fd.get("id"));
  const nieuw = String(fd.get("nieuw_status")) === "afgerond" ? "afgerond" : "open";
  const supabase = await createClient();
  await supabase.from("taak").update({ status: nieuw }).eq("id", id);
  revalidatePath(`/landgoed/${landgoed_id}/taken`);
}

// ── Contacten ──
export async function nieuwContact(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const naam = tekst(fd, "naam");
  if (!naam) return;
  const supabase = await createClient();
  await supabase.from("relatie").insert({
    landgoed_id,
    naam,
    type: tekst(fd, "type"),
    email: tekst(fd, "email"),
    telefoon: tekst(fd, "telefoon"),
    contact: tekst(fd, "contact"),
  });
  revalidatePath(`/landgoed/${landgoed_id}/contacten`);
}

// ── Extractie-runs ──
export async function bevestigExtractie(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const run_id = String(fd.get("run_id"));
  const supabase = await createClient();

  // Haal concept op
  const { data: run } = await supabase
    .from("intake_run")
    .select("concept, brontype")
    .eq("id", run_id)
    .eq("landgoed_id", landgoed_id)
    .single();

  if (!run) return;
  const c = run.concept as Record<string, string> ?? {};

  // Schrijf contact weg vanuit het concept
  const nf = (v: string | undefined) => (!v || v === "niet gevonden" ? null : v);
  const naam = nf(c.naam);
  if (naam) {
    const { data: relatie } = await supabase
      .from("relatie")
      .insert({
        landgoed_id,
        naam,
        organisatie: nf(c.organisatie),
        email: nf(c.email),
        telefoon: nf(c.telefoon),
        omschrijving: nf(c.omschrijving),
        status: nf(c.status_voorstel) ?? "actief",
        bron: nf(c.bron_notitie),
      })
      .select("id")
      .single();

    // Koppel rol als het voorstel matcht met een bestaand rol_type
    if (relatie && nf(c.rol_voorstel)) {
      const { data: rolType } = await supabase
        .from("rol_type")
        .select("id")
        .ilike("naam", nf(c.rol_voorstel)!)
        .maybeSingle();
      if (rolType) {
        await supabase.from("contact_rol").insert({
          contact_id: relatie.id,
          rol_type_id: rolType.id,
        });
      }
    }

    // Markeer run als bevestigd
    const { data: { user } } = await supabase.auth.getUser();
    await supabase
      .from("intake_run")
      .update({
        status: "bevestigd",
        bevestigd_door: user?.id ?? null,
        bevestigd_op: new Date().toISOString(),
        resultaat_ref: relatie?.id ?? null,
      })
      .eq("id", run_id);
  }

  revalidatePath(`/landgoed/${landgoed_id}/contacten`);
}

export async function afwijsExtractie(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const run_id = String(fd.get("run_id"));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  await supabase
    .from("intake_run")
    .update({
      status: "afgewezen",
      bevestigd_door: user?.id ?? null,
      bevestigd_op: new Date().toISOString(),
    })
    .eq("id", run_id)
    .eq("landgoed_id", landgoed_id);
  revalidatePath(`/landgoed/${landgoed_id}/contacten`);
}

// ── Inbox (inbound_extractie) ──
export async function bevestigInboundVoorstel(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const voorstel_id = String(fd.get("voorstel_id"));
  const supabase = await createClient();

  const { data: voorstel } = await supabase
    .from("inbound_extractie")
    .select("type, titel, voorgestelde_velden")
    .eq("id", voorstel_id)
    .eq("landgoed_id", landgoed_id)
    .single();

  if (!voorstel) return;

  const velden = (voorstel.voorgestelde_velden ?? {}) as Record<string, string | null>;
  let gekoppeld_object_id: string | null = null;

  if (voorstel.type === "taak") {
    const { data: taak } = await supabase
      .from("taak")
      .insert({
        landgoed_id,
        titel: voorstel.titel,
        deadline: velden.deadline ?? null,
        status: "open",
      })
      .select("id")
      .single();
    gekoppeld_object_id = taak?.id ?? null;
  } else if (voorstel.type === "agendapunt") {
    const { data: item } = await supabase
      .from("agenda_item")
      .insert({
        landgoed_id,
        titel: voorstel.titel,
        datum: velden.datum ?? new Date().toISOString().slice(0, 10),
        locatie: velden.plaats ?? null,
      })
      .select("id")
      .single();
    gekoppeld_object_id = item?.id ?? null;
  }

  const { data: { user } } = await supabase.auth.getUser();
  await supabase
    .from("inbound_extractie")
    .update({
      status: "bevestigd",
      gekoppeld_object_id,
      beoordeeld_door: user?.id ?? null,
      beoordeeld_op: new Date().toISOString(),
    })
    .eq("id", voorstel_id);

  revalidatePath(`/landgoed/${landgoed_id}/inbox`);
  revalidatePath(`/landgoed/${landgoed_id}/taken`);
}

export async function verWerpInboundVoorstel(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const voorstel_id = String(fd.get("voorstel_id"));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  await supabase
    .from("inbound_extractie")
    .update({
      status: "verworpen",
      beoordeeld_door: user?.id ?? null,
      beoordeeld_op: new Date().toISOString(),
    })
    .eq("id", voorstel_id)
    .eq("landgoed_id", landgoed_id);
  revalidatePath(`/landgoed/${landgoed_id}/inbox`);
}

// ── Contracten ──
export async function nieuwContract(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const titel = tekst(fd, "titel");
  if (!titel) return;
  const supabase = await createClient();
  await supabase.from("contract").insert({
    landgoed_id,
    titel,
    type: tekst(fd, "type"),
    partij: tekst(fd, "partij"),
    bedrag: getal(fd, "bedrag"),
    ingangsdatum: tekst(fd, "ingangsdatum"),
    einddatum: tekst(fd, "einddatum"),
    indexatie_type: tekst(fd, "indexatie_type"),
    volgende_indexatie: tekst(fd, "volgende_indexatie"),
    servicekosten: getal(fd, "servicekosten"),
    achterstand: getal(fd, "achterstand"),
    achterstand_notitie: tekst(fd, "achterstand_notitie"),
    status: "actief",
  });
  revalidatePath(`/landgoed/${landgoed_id}/contracten`);
}
