"use server";

import { createClient } from "@/lib/supabase/server";
import { isUuid, moet } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { stelWerkorderRoutingVoor } from "@/lib/ai";
import {
  mailBeschikbaar,
  verstuurMail,
  bevestigingAanMelder,
  inplanningAanMelder,
  afrondingAanMelder,
} from "@/lib/mail";

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

// ── Hulp: toewijzing voor werkorders ──
// Als veiligeToewijzing, maar met een échte verwijzing naar het contact
// (uitvoerder_relatie_id) in plaats van alleen een naam. Werkorders gebruiken
// daarom "c:<uuid>" waar taken/agenda "c:<naam>" gebruiken; het contact moet
// van dít landgoed zijn, anders wordt de toewijzing genegeerd.
async function werkorderToewijzing(
  supabase: Awaited<ReturnType<typeof createClient>>,
  landgoed_id: string,
  waarde: string | null,
): Promise<{
  toegewezen_aan: string | null;
  toegewezen_aan_naam: string | null;
  uitvoerder_relatie_id: string | null;
}> {
  const leeg = { toegewezen_aan: null, toegewezen_aan_naam: null, uitvoerder_relatie_id: null };
  if (!waarde) return leeg;

  if (waarde.startsWith("c:")) {
    const idOfNaam = waarde.slice(2);
    if (isUuid(idOfNaam)) {
      const { data: contact } = await supabase
        .from("relatie")
        .select("id, naam")
        .eq("id", idOfNaam)
        .eq("landgoed_id", landgoed_id)
        .maybeSingle();
      return contact
        ? { toegewezen_aan: null, toegewezen_aan_naam: contact.naam, uitvoerder_relatie_id: contact.id }
        : leeg;
    }
    // Vangnet voor oudere formulieren die nog "c:<naam>" sturen.
    return { toegewezen_aan: null, toegewezen_aan_naam: idOfNaam, uitvoerder_relatie_id: null };
  }

  const basis = await veiligeToewijzing(supabase, landgoed_id, waarde);
  return { ...basis, uitvoerder_relatie_id: null };
}

// ── Hulp: meerdere foto's uploaden ──
async function uploadFotos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  landgoed_id: string,
  werkorder_id: string,
  submap: string,
  files: File[],
): Promise<string[]> {
  const paden: string[] = [];
  for (const file of files) {
    if (!file || file.size === 0) continue;
    const ext = file.name.split(".").pop() ?? "bin";
    const pad = `${landgoed_id}/werkorders/${werkorder_id}/${submap}/${Date.now()}-${paden.length}.${ext}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).storage.from("documenten").upload(pad, file);
    if (!error) paden.push(pad);
  }
  return paden;
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
  revalidatePath(`/landgoed/${landgoed_id}/werkorder/${object_id}`);
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

// ── Werkorders ──
// Drie statussen, meer heeft de praktijk niet nodig: iemand meldt iets, degene
// die het oppakt accepteert, en als het klaar is wordt de melding gesloten.
const WERKORDER_STATUSSEN = ["gemeld", "geaccepteerd", "afgerond"] as const;

// Accorderen van uitgaven is voorbehouden aan de eigenaar; RLS staat rentmeester
// wél toe werkorders te wijzigen, dus die grens moet hier expliciet gezet worden.
// (Open punt uit hfst 9 van het bronplan: definitief bij het rollenstuk.)
async function isEigenaar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  landgoed_id: string,
): Promise<boolean> {
  const { data } = await supabase.rpc("rol_op", { doel_landgoed: landgoed_id });
  return data === "eigenaar";
}

export async function nieuweWerkorder(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const titel = tekst(fd, "titel");
  if (!titel) return;
  const supabase = await createClient();
  const toewijzing = await werkorderToewijzing(supabase, landgoed_id, tekst(fd, "toegewezen_aan"));
  const { data: { user } } = await supabase.auth.getUser();

  const nieuw = await moet(supabase.from("werkorder").insert({
    landgoed_id,
    titel,
    omschrijving: tekst(fd, "omschrijving"),
    prioriteit: tekst(fd, "prioriteit"),
    deadline: tekst(fd, "deadline"),
    soort: tekst(fd, "soort"),
    stamobject_id: tekst(fd, "stamobject_id"),
    locatie_omschrijving: tekst(fd, "locatie_omschrijving"),
    ...toewijzing,
    status: "gemeld",
    aangemaakt_door: user?.id ?? null,
  }).select("id").single(), "werkorder aanmaken");

  const fotos = (fd.getAll("fotos") as File[]).filter((f) => f && f.size > 0);
  if (nieuw.id && fotos.length > 0) {
    const paden = await uploadFotos(supabase, landgoed_id, nieuw.id, "voor", fotos);
    if (paden.length > 0) {
      await moet(supabase.from("werkorder").update({ fotos_voor: paden }).eq("id", nieuw.id), "foto's koppelen");
    }
  }

  // GPS-punt apart wegschrijven: PostGIS-geometrie kan niet via een gewone
  // insert, en de WGS84→RD-transformatie hoort in de database (migratie 0068).
  const lat = getal(fd, "lat");
  const lon = getal(fd, "lon");
  if (nieuw.id && lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)) {
    const { error } = await supabase.rpc("werkorder_punt_zetten", {
      p_werkorder_id: nieuw.id,
      p_lat: lat,
      p_lon: lon,
    });
    if (error) console.error("[werkorder] locatie vastleggen mislukt:", error.message);
  }

  if (nieuw.id) {
    await stelWerkorderRoutingVoorEnBewaar(supabase, landgoed_id, nieuw.id, {
      titel,
      omschrijving: tekst(fd, "omschrijving"),
      soort: tekst(fd, "soort"),
    });
  }

  revalidatePath(`/landgoed/${landgoed_id}/werkorders`);
}

// Verzamelt de beschikbare uitvoerders (leden + contacten met rol 'werkorder'),
// vraagt het AI-routeringsvoorstel en schrijft dat weg als vóórstel — nooit als
// directe toewijzing (projectbrede regel, zie lib/ai.ts).
async function stelWerkorderRoutingVoorEnBewaar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  landgoed_id: string,
  werkorder_id: string,
  bron: { titel: string; omschrijving: string | null; soort: string | null },
) {
  const [ledenRaw, relatiesRaw] = await Promise.all([
    supabase.from("lidmaatschap").select("gebruiker_id, profiel(naam, email)").eq("landgoed_id", landgoed_id),
    // Alle contacten, met hun rollen als hint. Filteren op de 'werkorder'-rol
    // leverde een lege lijst zolang niemand die rol had — dan kon de AI per
    // definitie niemand voorstellen.
    supabase
      .from("relatie")
      .select("id, naam, contact_rol(rol_type(naam, koppelbaar_aan))")
      .eq("landgoed_id", landgoed_id),
  ]);

  type RelatieRij = {
    id: string;
    naam: string;
    contact_rol?: { rol_type?: { naam?: string; koppelbaar_aan?: string[] | null } | null }[] | null;
  };
  const beschikbareUitvoerders = [
    ...(ledenRaw.data ?? []).map((l) => {
      const p = (l.profiel as unknown) as { naam: string | null; email: string | null } | null;
      return { waarde: `u:${l.gebruiker_id}`, naam: p?.naam ?? p?.email ?? l.gebruiker_id };
    }),
    ...((relatiesRaw.data ?? []) as unknown as RelatieRij[]).map((r) => {
      const rollen = (r.contact_rol ?? [])
        .map((cr) => cr.rol_type?.naam)
        .filter((n): n is string => Boolean(n));
      return {
        waarde: `c:${r.id}`,
        naam: r.naam,
        toelichting: rollen.length > 0 ? `rol: ${rollen.join(", ")}` : undefined,
      };
    }),
  ];

  const voorstel = await stelWerkorderRoutingVoor({
    titel: bron.titel,
    omschrijving: bron.omschrijving,
    soort: bron.soort,
    stamobjectNaam: null,
    beschikbareUitvoerders,
  });
  if (!voorstel) return; // geen API-key of geen bruikbaar voorstel: blijft op 'gemeld'

  await moet(supabase.from("werkorder").update({
    ai_voorstel: voorstel,
    ai_voorstel_status: "voorgesteld",
  }).eq("id", werkorder_id), "AI-voorstel opslaan");
}

// ── Werkorders: AI-voorstel accorderen/verwerpen (voorstel->akkoord-patroon) ──
export async function accordeerWerkorderVoorstel(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const id = String(fd.get("id"));
  const supabase = await createClient();

  const { data: werkorder } = await supabase
    .from("werkorder")
    .select("ai_voorstel")
    .eq("id", id)
    .eq("landgoed_id", landgoed_id)
    .single();
  const voorstel = werkorder?.ai_voorstel as { uitvoerder_waarde: string | null } | null;
  const toewijzing = await werkorderToewijzing(supabase, landgoed_id, voorstel?.uitvoerder_waarde ?? null);

  // Zonder uitvoerder is er niets om aan toe te wijzen: dan alleen het voorstel
  // afvinken en de klus op 'gemeld' laten staan.
  const heeftUitvoerder = Boolean(toewijzing.toegewezen_aan || toewijzing.toegewezen_aan_naam);

  await moet(supabase.from("werkorder").update({
    ...toewijzing,
    ai_voorstel_status: "geaccordeerd",
    // Toewijzen is nog geen accepteren: dat doet de uitvoerder zelf.
    bijgewerkt_op: new Date().toISOString(),
  }).eq("id", id).eq("landgoed_id", landgoed_id), "AI-voorstel accorderen");

  if (heeftUitvoerder) {
    await berichtAanMelder(supabase, landgoed_id, id, "inplanning");
  }

  revalidatePath(`/landgoed/${landgoed_id}/werkorders`);
  revalidatePath(`/landgoed/${landgoed_id}/werkorder/${id}`);
}

// Handmatig toewijzen — het "Aanpassen"-spoor uit de triage. Zonder dit was
// verwerpen een doodlopende weg: het voorstel verdween en er was daarna nergens
// meer een plek om alsnog iemand op de klus te zetten.
export async function werkorderToewijzen(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const id = String(fd.get("id"));
  const supabase = await createClient();

  const toewijzing = await werkorderToewijzing(supabase, landgoed_id, tekst(fd, "toegewezen_aan"));
  const heeftUitvoerder = Boolean(toewijzing.toegewezen_aan || toewijzing.toegewezen_aan_naam);

  await moet(supabase.from("werkorder").update({
    ...toewijzing,
    // Wijkt de beheerder af van het voorstel, dan is dat voorstel afgewezen —
    // dat is precies het signaal waar de AI later van kan leren.
    ai_voorstel_status: "afgewezen",
    // Toewijzen is nog geen accepteren: dat doet de uitvoerder zelf.
    bijgewerkt_op: new Date().toISOString(),
  }).eq("id", id).eq("landgoed_id", landgoed_id), "werkorder toewijzen");

  if (heeftUitvoerder) {
    await berichtAanMelder(supabase, landgoed_id, id, "inplanning");
  }

  revalidatePath(`/landgoed/${landgoed_id}/werkorders`);
  revalidatePath(`/landgoed/${landgoed_id}/werkorder/${id}`);
}

// Bewaakt geldige overgangen zodat een gemanipuleerd formulier een werkorder
// niet buiten het statusmodel kan zetten (zelfde discipline als veiligeToewijzing).
export async function werkorderStatusWijzigen(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const id = String(fd.get("id"));
  const nieuweStatusRuw = String(fd.get("status") ?? "");
  if (!WERKORDER_STATUSSEN.includes(nieuweStatusRuw as (typeof WERKORDER_STATUSSEN)[number])) return;
  const supabase = await createClient();

  await moet(supabase.from("werkorder")
    .update({ status: nieuweStatusRuw, bijgewerkt_op: new Date().toISOString() })
    .eq("id", id)
    .eq("landgoed_id", landgoed_id), "werkorder status bijwerken");

  if (nieuweStatusRuw === "geaccepteerd") {
    await berichtAanMelder(supabase, landgoed_id, id, "inplanning");
  }

  revalidatePath(`/landgoed/${landgoed_id}/werkorders`);
  revalidatePath(`/landgoed/${landgoed_id}/werkorder/${id}`);
}

// Stuurt de melder een statusbericht (hfst 6: drie momenten). Bewust
// fire-and-forget: een mailfout mag de statuswijziging nooit blokkeren, dus
// geen `moet()` en geen throw. Zonder RESEND_API_KEY doet dit niets.
async function berichtAanMelder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  landgoed_id: string,
  werkorder_id: string,
  moment: "ontvangst" | "inplanning" | "afronding",
) {
  if (!mailBeschikbaar()) return;
  try {
    const { data: werkorder } = await supabase
      .from("werkorder")
      .select("titel, deadline, melder_email")
      .eq("id", werkorder_id)
      .eq("landgoed_id", landgoed_id)
      .maybeSingle();
    if (!werkorder?.melder_email) return;

    const { data: landgoed } = await supabase
      .from("landgoed")
      .select("naam")
      .eq("id", landgoed_id)
      .maybeSingle();
    const naam = landgoed?.naam ?? "het landgoed";

    const bericht =
      moment === "ontvangst"
        ? bevestigingAanMelder(werkorder.titel, naam)
        : moment === "inplanning"
          ? inplanningAanMelder(werkorder.titel, naam, werkorder.deadline)
          : afrondingAanMelder(werkorder.titel, naam);

    await verstuurMail({ aan: werkorder.melder_email, ...bericht });
  } catch (e) {
    console.error("[werkorder] statusbericht mislukt:", e instanceof Error ? e.message : String(e));
  }
}

// De melding sluiten. Eventueel met de werkelijke kosten en foto's van het
// resultaat erbij — allebei optioneel, want vaak is "het is gedaan" genoeg.
export async function werkorderAfronden(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const id = String(fd.get("id"));
  const heropenen = String(fd.get("heropenen")) === "ja";
  const supabase = await createClient();

  const fotos = (fd.getAll("fotos_na") as File[]).filter((f) => f && f.size > 0);
  const update: Record<string, unknown> = {
    status: heropenen ? "geaccepteerd" : "afgerond",
    bijgewerkt_op: new Date().toISOString(),
  };
  if (fotos.length > 0) {
    const paden = await uploadFotos(supabase, landgoed_id, id, "na", fotos);
    if (paden.length > 0) update.fotos_na = paden;
  }
  if (getal(fd, "kosten_werkelijk") !== null) update.kosten_werkelijk = getal(fd, "kosten_werkelijk");

  await moet(supabase.from("werkorder")
    .update(update)
    .eq("id", id)
    .eq("landgoed_id", landgoed_id), "werkorder afronden");

  if (!heropenen) {
    await berichtAanMelder(supabase, landgoed_id, id, "afronding");
  }

  revalidatePath(`/landgoed/${landgoed_id}/werkorders`);
  revalidatePath(`/landgoed/${landgoed_id}/werkorder/${id}`);
}

// Genereert de magic link waarmee een externe uitvoerder deze klus zonder
// account kan bijwerken (migratie 0066). Verstuurt zelf nog geen mail — dat is
// stap 5 (Resend).
//
// "Nieuwe link maken" laat bestaande links écht vervallen: de knop wekt de
// indruk dat de oude link dood is, en bij een token dat schrijfrechten geeft
// (uitvoerder van de klus gehaald na een geschil) mag dat geen loze belofte
// zijn. Daarom eerst verlopen zetten, dan pas een nieuwe rij.
export async function maakKlusLink(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const id = String(fd.get("id"));
  const supabase = await createClient();

  // RLS op werkorder_toegangstoken toetst de rol via de werkorder; deze check
  // voorkomt dat een verkeerd landgoed_id in het formulier tot een token voor
  // andermans werkorder leidt.
  const { data: werkorder } = await supabase
    .from("werkorder")
    .select("id")
    .eq("id", id)
    .eq("landgoed_id", landgoed_id)
    .maybeSingle();
  if (!werkorder) return;

  await moet(supabase
    .from("werkorder_toegangstoken")
    .update({ verloopt_op: new Date().toISOString() })
    .eq("werkorder_id", id)
    .gt("verloopt_op", new Date().toISOString()), "oude klus-links laten vervallen");

  await moet(supabase
    .from("werkorder_toegangstoken")
    .insert({ werkorder_id: id }), "klus-link aanmaken");

  revalidatePath(`/landgoed/${landgoed_id}/werkorder/${id}`);
}

// ── Drempelbedrag-akkoord (Werkorders_Plan_v1_0.md hfst 8) ──
//
// Boven het drempelbedrag van het landgoed is er een net beslismoment vóórdat
// er geld wordt uitgegeven; daaronder handelt de beheerder zelf af. Bewust géén
// generieke goedkeuringentabel: die bestaat nog nergens in de app, en één
// module is te weinig om op te generaliseren. Wordt hetzelfde patroon later
// elders nodig (subsidie, contract), dán is dat het moment.
export async function werkorderKostenBijwerken(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const id = String(fd.get("id"));
  const kosten = getal(fd, "kosten_verwacht");
  const supabase = await createClient();

  const { data: landgoed } = await supabase
    .from("landgoed")
    .select("werkorder_drempelbedrag")
    .eq("id", landgoed_id)
    .maybeSingle();
  const drempel = Number(landgoed?.werkorder_drempelbedrag ?? 0);

  const { data: huidig } = await supabase
    .from("werkorder")
    .select("status")
    .eq("id", id)
    .eq("landgoed_id", landgoed_id)
    .maybeSingle();
  if (!huidig) return;

  // Het akkoord staat los van de voortgang: een klus kan geaccepteerd zijn én
  // nog op akkoord voor de uitgave wachten. Een afgeronde klus hoeft niet
  // alsnog geaccordeerd te worden.
  const bovenDrempel =
    kosten != null && Number.isFinite(kosten) && kosten > drempel && huidig.status !== "afgerond";

  await moet(supabase.from("werkorder")
    .update({
      kosten_verwacht: kosten,
      wacht_op_akkoord: bovenDrempel,
      bijgewerkt_op: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("landgoed_id", landgoed_id), "kosten bijwerken");

  revalidatePath(`/landgoed/${landgoed_id}/werkorders`);
  revalidatePath(`/landgoed/${landgoed_id}/werkorder/${id}`);
}

export async function werkorderAkkoordGeven(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const id = String(fd.get("id"));
  const supabase = await createClient();

  if (!(await isEigenaar(supabase, landgoed_id))) {
    throw new Error("Alleen de eigenaar kan een uitgave boven het drempelbedrag accorderen.");
  }

  await moet(supabase.from("werkorder").update({
    wacht_op_akkoord: false,
    bijgewerkt_op: new Date().toISOString(),
  }).eq("id", id).eq("landgoed_id", landgoed_id), "uitgave accorderen");

  // Het akkoord hoort in de tijdlijn: wie het gaf en wanneer, is precies de
  // verantwoording die familie- en stichtingsconstructies nodig hebben.
  const { data: { user } } = await supabase.auth.getUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("notitie").insert({
    landgoed_id,
    object_type: "werkorder",
    object_id: id,
    tekst: "Uitgave boven het drempelbedrag geaccordeerd.",
    geschreven_door: user?.id ?? null,
  });

  revalidatePath(`/landgoed/${landgoed_id}/werkorders`);
  revalidatePath(`/landgoed/${landgoed_id}/werkorder/${id}`);
}

export async function drempelbedragInstellen(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const bedrag = getal(fd, "drempelbedrag");
  if (bedrag == null || !Number.isFinite(bedrag) || bedrag < 0) return;
  const supabase = await createClient();

  if (!(await isEigenaar(supabase, landgoed_id))) {
    throw new Error("Alleen de eigenaar kan het drempelbedrag wijzigen.");
  }

  await moet(supabase.from("landgoed")
    .update({ werkorder_drempelbedrag: bedrag })
    .eq("id", landgoed_id), "drempelbedrag opslaan");

  revalidatePath(`/landgoed/${landgoed_id}/werkorders`);
}

// Koppelt de werkorder aan een object uit de stamgegevens. Dit is wat het
// objectdossier zijn onderhoudshistorie geeft ("alles wat er aan Woning A is
// gedaan") — precies het materiaal waar MJOP, verzekeraar en subsidiegever
// later om vragen.
export async function werkorderObjectKoppelen(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const id = String(fd.get("id"));
  const ruw = tekst(fd, "stamobject_id");
  const supabase = await createClient();

  // Alleen een geaccordeerd object van dit landgoed; anders zou een aangepast
  // formulier de werkorder aan andermans object kunnen hangen.
  let stamobject_id: string | null = null;
  if (ruw && isUuid(ruw)) {
    const { data: object } = await supabase
      .from("stamobject")
      .select("id")
      .eq("id", ruw)
      .eq("landgoed_id", landgoed_id)
      .eq("geaccordeerd", true)
      .maybeSingle();
    if (object) stamobject_id = ruw;
  }

  await moet(supabase.from("werkorder")
    .update({ stamobject_id, bijgewerkt_op: new Date().toISOString() })
    .eq("id", id)
    .eq("landgoed_id", landgoed_id), "object koppelen");

  revalidatePath(`/landgoed/${landgoed_id}/werkorders`);
  revalidatePath(`/landgoed/${landgoed_id}/werkorder/${id}`);
  if (stamobject_id) revalidatePath(`/landgoed/${landgoed_id}/object/${stamobject_id}`);
}
