"use server";

import { createClient } from "@/lib/supabase/server";
import { isUuid, moet } from "@/lib/db";
import { revalidatePath } from "next/cache";

function tekst(fd: FormData, k: string) {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
}
function getal(fd: FormData, k: string) {
  const v = tekst(fd, k);
  return v === null ? null : Number(v.replace(",", "."));
}

// ── Hulp: bijlage uploaden ──
async function uploadBijlage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  landgoed_id: string,
  map: string,
  file: File,
): Promise<{ pad: string; naam: string } | null> {
  if (!file || file.size === 0) return null;
  const ext = file.name.split(".").pop() ?? "bin";
  const pad = `${landgoed_id}/${map}/${Date.now()}.${ext}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).storage.from("documenten").upload(pad, file);
  if (error) return null;
  return { pad, naam: file.name };
}

// ── Hulp: toewijzing-waarde parsen én toetsen ──
// Waarde "u:<uuid>" → profiel-UUID, maar alléén als die persoon lid is van
// dit landgoed (issue #9 — anders kon een aangepast formulier taken aan een
// willekeurige gebruikers-UUID hangen); "c:<naam>" → contactnaam; leeg → null.
async function veiligeToewijzing(
  supabase: Awaited<ReturnType<typeof createClient>>,
  landgoed_id: string,
  waarde: string | null,
): Promise<{ toegewezen_aan: string | null; toegewezen_aan_naam: string | null }> {
  const leeg = { toegewezen_aan: null, toegewezen_aan_naam: null };
  if (!waarde) return leeg;
  if (waarde.startsWith("c:")) {
    return { toegewezen_aan: null, toegewezen_aan_naam: waarde.slice(2) };
  }
  if (waarde.startsWith("u:")) {
    const uuid = waarde.slice(2);
    if (!isUuid(uuid)) return leeg;
    const { data: lid } = await supabase
      .from("lidmaatschap")
      .select("id")
      .eq("landgoed_id", landgoed_id)
      .eq("gebruiker_id", uuid)
      .maybeSingle();
    return lid ? { toegewezen_aan: uuid, toegewezen_aan_naam: null } : leeg;
  }
  return leeg;
}

// ── Taken ──
export async function nieuweTaak(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const titel = tekst(fd, "titel");
  if (!titel) return;
  const supabase = await createClient();
  const toewijzing = await veiligeToewijzing(supabase, landgoed_id, tekst(fd, "toegewezen_aan"));
  const bijlage = await uploadBijlage(supabase, landgoed_id, "taken", fd.get("bijlage") as File);
  await moet(supabase.from("taak").insert({
    landgoed_id,
    titel,
    omschrijving: tekst(fd, "omschrijving"),
    prioriteit: tekst(fd, "prioriteit"),
    deadline: tekst(fd, "deadline"),
    ...toewijzing,
    bijlage_pad: bijlage?.pad ?? null,
    bijlage_naam: bijlage?.naam ?? null,
    status: "open",
  }), "taak aanmaken");
  revalidatePath(`/landgoed/${landgoed_id}/overzicht`);
}

// ── Agenda ──
export async function nieuwAgendaItem(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const titel = tekst(fd, "titel");
  const datum = tekst(fd, "datum");
  if (!titel || !datum) return;
  const supabase = await createClient();
  const toewijzing = await veiligeToewijzing(supabase, landgoed_id, tekst(fd, "toegewezen_aan"));
  const bijlage = await uploadBijlage(supabase, landgoed_id, "agenda", fd.get("bijlage") as File);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await moet((supabase as any).from("agenda_item").insert({
    landgoed_id,
    titel,
    datum,
    tijd: tekst(fd, "tijd"),
    locatie: tekst(fd, "locatie"),
    omschrijving: tekst(fd, "omschrijving"),
    ...toewijzing,
    bijlage_pad: bijlage?.pad ?? null,
    bijlage_naam: bijlage?.naam ?? null,
  }), "agenda-item aanmaken");
  revalidatePath(`/landgoed/${landgoed_id}/overzicht`);
}

export async function verwijderAgendaItem(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const id = String(fd.get("id"));
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await moet((supabase as any).from("agenda_item").delete().eq("id", id), "agenda-item verwijderen");
  revalidatePath(`/landgoed/${landgoed_id}/overzicht`);
}

export async function taakAfronden(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const id = String(fd.get("id"));
  const nieuw = String(fd.get("nieuw_status")) === "afgerond" ? "afgerond" : "open";
  const supabase = await createClient();
  await moet(supabase.from("taak").update({ status: nieuw }).eq("id", id), "taak bijwerken");
  revalidatePath(`/landgoed/${landgoed_id}/overzicht`);
}

// ── Contacten ──
export async function nieuwContact(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const naam = tekst(fd, "naam");
  if (!naam) return;
  const supabase = await createClient();
  await moet(supabase.from("relatie").insert({
    landgoed_id,
    naam,
    type: tekst(fd, "type"),
    email: tekst(fd, "email"),
    telefoon: tekst(fd, "telefoon"),
    contact: tekst(fd, "contact"),
  }), "contact aanmaken");
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
    const relatie = await moet(supabase
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
      .single(), "contact opslaan");

    // Koppel rol als het voorstel matcht met een bestaand rol_type
    if (nf(c.rol_voorstel)) {
      const { data: rolType } = await supabase
        .from("rol_type")
        .select("id")
        .ilike("naam", nf(c.rol_voorstel)!)
        .maybeSingle();
      if (rolType) {
        await moet(supabase.from("contact_rol").insert({
          contact_id: relatie.id,
          rol_type_id: rolType.id,
        }), "rol koppelen");
      }
    }

    // Markeer run als bevestigd
    const { data: { user } } = await supabase.auth.getUser();
    await moet(supabase
      .from("intake_run")
      .update({
        status: "bevestigd",
        bevestigd_door: user?.id ?? null,
        bevestigd_op: new Date().toISOString(),
        resultaat_ref: relatie.id ?? null,
      })
      .eq("id", run_id), "intake-run bijwerken");
  }

  revalidatePath(`/landgoed/${landgoed_id}/contacten`);
}

export async function afwijsExtractie(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const run_id = String(fd.get("run_id"));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  await moet(supabase
    .from("intake_run")
    .update({
      status: "afgewezen",
      bevestigd_door: user?.id ?? null,
      bevestigd_op: new Date().toISOString(),
    })
    .eq("id", run_id)
    .eq("landgoed_id", landgoed_id), "extractie afwijzen");
  revalidatePath(`/landgoed/${landgoed_id}/contacten`);
}

// ── Inbox (inbound_extractie) ──
export async function bevestigInboundVoorstel(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const voorstel_id = String(fd.get("voorstel_id"));
  const type = String(fd.get("type"));
  const supabase = await createClient();

  // Velden uit het bewerkformulier (of defaults via hidden inputs)
  const titel = tekst(fd, "titel") ?? "";
  const deadline = tekst(fd, "deadline");
  const prioriteit = tekst(fd, "prioriteit");
  const omschrijving = tekst(fd, "omschrijving");
  // Rauwe profiel-UUID uit het formulier: alleen accepteren als de persoon
  // lid is van dit landgoed (issue #9).
  const toewijzingRuw = tekst(fd, "toegewezen_aan");
  let toegewezen_aan: string | null = null;
  if (toewijzingRuw && isUuid(toewijzingRuw)) {
    const { data: lid } = await supabase
      .from("lidmaatschap")
      .select("id")
      .eq("landgoed_id", landgoed_id)
      .eq("gebruiker_id", toewijzingRuw)
      .maybeSingle();
    if (lid) toegewezen_aan = toewijzingRuw;
  }
  const datum = tekst(fd, "datum");
  const tijd = tekst(fd, "tijd");
  const locatie = tekst(fd, "locatie");

  let gekoppeld_object_id: string | null = null;

  if (type === "contact") {
    const naam = tekst(fd, "contact_naam");
    if (naam) {
      const relatie = await moet(supabase
        .from("relatie")
        .insert({
          landgoed_id,
          naam,
          organisatie: tekst(fd, "contact_organisatie"),
          email: tekst(fd, "contact_email"),
          telefoon: tekst(fd, "contact_telefoon"),
          omschrijving: tekst(fd, "contact_omschrijving"),
          status: "actief",
        })
        .select("id")
        .single(), "contact aanmaken");
      gekoppeld_object_id = relatie.id ?? null;
    }
  } else if (type === "taak") {
    const taak = await moet(supabase
      .from("taak")
      .insert({
        landgoed_id,
        titel,
        deadline: deadline ?? null,
        prioriteit: prioriteit ?? null,
        omschrijving: omschrijving ?? null,
        toegewezen_aan: toegewezen_aan ?? null,
        status: "open",
      })
      .select("id")
      .single(), "taak aanmaken");
    gekoppeld_object_id = taak.id ?? null;
  } else if (type === "agendapunt") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const item = await moet<{ id: string }>((supabase as any)
      .from("agenda_item")
      .insert({
        landgoed_id,
        titel,
        datum: datum ?? new Date().toISOString().slice(0, 10),
        tijd: tijd ?? null,
        locatie: locatie ?? null,
        toegewezen_aan: toegewezen_aan ?? null,
      })
      .select("id")
      .single(), "agenda-item aanmaken");
    gekoppeld_object_id = item.id ?? null;
  }

  const { data: { user } } = await supabase.auth.getUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await moet((supabase as any)
    .from("inbound_extractie")
    .update({
      status: "bevestigd",
      gekoppeld_object_id,
      beoordeeld_door: user?.id ?? null,
      beoordeeld_op: new Date().toISOString(),
    })
    .eq("id", voorstel_id), "inbound-voorstel bijwerken");

  revalidatePath(`/landgoed/${landgoed_id}/inbox`);
  revalidatePath(`/landgoed/${landgoed_id}/taken`);
  revalidatePath(`/landgoed/${landgoed_id}/agenda`);
  revalidatePath(`/landgoed/${landgoed_id}/contacten`);
}

export async function verWerpInboundVoorstel(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const voorstel_id = String(fd.get("voorstel_id"));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  await moet(supabase
    .from("inbound_extractie")
    .update({
      status: "verworpen",
      beoordeeld_door: user?.id ?? null,
      beoordeeld_op: new Date().toISOString(),
    })
    .eq("id", voorstel_id)
    .eq("landgoed_id", landgoed_id), "inbound-voorstel verwerpen");
  revalidatePath(`/landgoed/${landgoed_id}/inbox`);
}

// ── Notities ──
export async function voegNotitieToe(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const object_type = String(fd.get("object_type"));
  const object_id = String(fd.get("object_id"));
  const tekst = String(fd.get("tekst") ?? "").trim();
  if (!tekst) return;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  await moet((supabase as any).from("notitie").insert({
    landgoed_id,
    object_type,
    object_id,
    tekst,
    geschreven_door: user?.id ?? null,
  }), "notitie toevoegen");
  revalidatePath(`/landgoed/${landgoed_id}/taak/${object_id}`);
  revalidatePath(`/landgoed/${landgoed_id}/agenda/${object_id}`);
}

// ── Contracten ──
export async function nieuwContract(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const titel = tekst(fd, "titel");
  if (!titel) return;
  const supabase = await createClient();
  const bedrag = getal(fd, "bedrag");
  const ingangsdatum = tekst(fd, "ingangsdatum");
  const nieuw = await moet(supabase.from("contract").insert({
    landgoed_id,
    titel,
    type: tekst(fd, "type"),
    partij: tekst(fd, "partij"),
    bedrag,
    ingangsdatum,
    einddatum: tekst(fd, "einddatum"),
    indexatie_type: tekst(fd, "indexatie_type"),
    volgende_indexatie: tekst(fd, "volgende_indexatie"),
    servicekosten: getal(fd, "servicekosten"),
    achterstand: getal(fd, "achterstand"),
    achterstand_notitie: tekst(fd, "achterstand_notitie"),
    status: "actief",
  }).select("id").single(), "contract opslaan");
  // Plak 2: het bedrag leeft als prijsafspraak met geldigheidsperiode;
  // het bedrag-veld op contract is daarvan de spiegel.
  if (nieuw.id && bedrag != null && Number.isFinite(bedrag)) {
    await moet(
      supabase.from("contract_prijsafspraak").insert({
        landgoed_id,
        contract_id: nieuw.id,
        bedrag,
        geldig_van: ingangsdatum ?? new Date().toISOString().slice(0, 10),
        status: "geaccordeerd",
        herkomst: "handmatig",
        toelichting: "eerste prijs bij aanmaken",
      }),
      "prijsafspraak opslaan",
    );
  }
  revalidatePath(`/landgoed/${landgoed_id}/contracten`);
}
