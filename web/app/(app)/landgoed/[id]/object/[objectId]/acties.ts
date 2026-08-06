"use server";

import { createClient } from "@/lib/supabase/server";
import { moet } from "@/lib/db";
import { revalidatePath } from "next/cache";

function tekst(fd: FormData, k: string) {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
}
function getal(fd: FormData, k: string) {
  const v = tekst(fd, k);
  return v === null ? null : Number(v.replace(",", "."));
}
function veiligeNaam(naam: string) {
  return naam.replace(/[^a-zA-Z0-9._-]/g, "_");
}
function pad(landgoed_id: string, object_id: string) {
  return `/landgoed/${landgoed_id}/object/${object_id}`;
}

// Maak een geaccordeerde koppeling (verband) naar een stamobject.
async function koppel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  landgoed_id: string,
  bron_type: string,
  bron_id: string,
  object_id: string,
  rol: string | null,
) {
  const { data: gebruiker } = await supabase.auth.getUser();
  await moet(
    supabase.from("verband").upsert(
      {
        landgoed_id,
        bron_type,
        bron_id,
        doel_type: "stamobject",
        doel_id: object_id,
        rol,
        status: "geaccordeerd",
        aangemaakt_door: gebruiker.user?.id ?? null,
      },
      {
        onConflict: "bron_type,bron_id,doel_type,doel_id,rol",
        ignoreDuplicates: true,
      },
    ),
    "koppeling opslaan",
  );
}

// Een koppeling verwijderen (de onderliggende relatie/contract/document blijft).
async function ontkoppel(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const object_id = String(fd.get("object_id"));
  const verband_id = String(fd.get("verband_id"));
  if (!verband_id) return;
  const supabase = await createClient();
  await moet(
    supabase.from("verband").delete().eq("id", verband_id),
    "koppeling verwijderen",
  );
  revalidatePath(pad(landgoed_id, object_id));
}

// ── Contacten ──
export async function koppelContact(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const object_id = String(fd.get("object_id"));
  const relatie_id = tekst(fd, "relatie_id");
  if (!relatie_id) return;
  const supabase = await createClient();
  await koppel(
    supabase,
    landgoed_id,
    "relatie",
    relatie_id,
    object_id,
    tekst(fd, "rol"),
  );
  revalidatePath(pad(landgoed_id, object_id));
}

export async function nieuwContactEnKoppel(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const object_id = String(fd.get("object_id"));
  const naam = tekst(fd, "naam");
  if (!naam) return;
  const supabase = await createClient();
  const relatie = await moet(
    supabase
      .from("relatie")
      .insert({
        landgoed_id,
        naam,
        type: tekst(fd, "type"),
        email: tekst(fd, "email"),
        telefoon: tekst(fd, "telefoon"),
        contact: tekst(fd, "contact"),
      })
      .select("id")
      .single(),
    "contact opslaan",
  );
  if (relatie.id) {
    await koppel(
      supabase,
      landgoed_id,
      "relatie",
      relatie.id,
      object_id,
      tekst(fd, "rol"),
    );
  }
  revalidatePath(pad(landgoed_id, object_id));
}

export async function ontkoppelContact(fd: FormData) {
  await ontkoppel(fd);
}

// ── Pacht-/huurafspraken (contract) ──
function contractVelden(fd: FormData) {
  return {
    titel: tekst(fd, "titel"),
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
  };
}

export async function nieuwAfspraakEnKoppel(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const object_id = String(fd.get("object_id"));
  const velden = contractVelden(fd);
  if (!velden.titel) return;
  const supabase = await createClient();
  const contract = await moet(
    supabase
      .from("contract")
      .insert({ landgoed_id, status: "actief", ...velden })
      .select("id")
      .single(),
    "contract opslaan",
  );
  if (contract.id) {
    await koppel(
      supabase,
      landgoed_id,
      "contract",
      contract.id,
      object_id,
      "betreft",
    );
  }
  revalidatePath(pad(landgoed_id, object_id));
}

export async function koppelAfspraak(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const object_id = String(fd.get("object_id"));
  const contract_id = tekst(fd, "contract_id");
  if (!contract_id) return;
  const supabase = await createClient();
  await koppel(
    supabase,
    landgoed_id,
    "contract",
    contract_id,
    object_id,
    "betreft",
  );
  revalidatePath(pad(landgoed_id, object_id));
}

export async function bewerkAfspraak(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const object_id = String(fd.get("object_id"));
  const contract_id = String(fd.get("contract_id"));
  if (!contract_id) return;
  const velden = contractVelden(fd);
  if (!velden.titel) return;
  const supabase = await createClient();
  await moet(
    supabase.from("contract").update(velden).eq("id", contract_id),
    "contract bijwerken",
  );
  revalidatePath(pad(landgoed_id, object_id));
}

export async function ontkoppelAfspraak(fd: FormData) {
  await ontkoppel(fd);
}

// ── Gebruikseenheden (Hugo 2.2, issue #114) ──
// De check-constraints in migratie 0052 zijn de harde grens; deze lijsten
// houden de invoer netjes vóór de database het afkeurt.
const EENHEID_TYPES = [
  "woning",
  "appartement",
  "kantoor",
  "opslag",
  "bedrijfsruimte",
  "recreatieverblijf",
  "overig",
];
const EENHEID_STATUSSEN = ["in_gebruik", "leegstand", "in_renovatie"];

function eenheidVelden(fd: FormData) {
  const type = tekst(fd, "type");
  const status = tekst(fd, "status");
  return {
    naam: tekst(fd, "naam"),
    type: type && EENHEID_TYPES.includes(type) ? type : "overig",
    status:
      status && EENHEID_STATUSSEN.includes(status) ? status : "in_gebruik",
    adres: tekst(fd, "adres"),
    oppervlakte_m2: getal(fd, "oppervlakte_m2"),
    omschrijving: tekst(fd, "omschrijving"),
  };
}

export async function nieuweGebruikseenheid(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const object_id = String(fd.get("object_id"));
  const velden = eenheidVelden(fd);
  if (!velden.naam) return;
  const supabase = await createClient();
  await moet(
    supabase
      .from("gebruikseenheid")
      .insert({ landgoed_id, stamobject_id: object_id, ...velden }),
    "gebruikseenheid opslaan",
  );
  revalidatePath(pad(landgoed_id, object_id));
}

export async function bewerkGebruikseenheid(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const object_id = String(fd.get("object_id"));
  const eenheid_id = String(fd.get("eenheid_id"));
  if (!eenheid_id) return;
  const velden = eenheidVelden(fd);
  if (!velden.naam) return;
  const supabase = await createClient();
  await moet(
    supabase
      .from("gebruikseenheid")
      .update(velden)
      .eq("id", eenheid_id)
      .eq("landgoed_id", landgoed_id),
    "gebruikseenheid bijwerken",
  );
  revalidatePath(pad(landgoed_id, object_id));
}

export async function verwijderGebruikseenheid(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const object_id = String(fd.get("object_id"));
  const eenheid_id = String(fd.get("eenheid_id"));
  if (!eenheid_id) return;
  const supabase = await createClient();
  // Verband is generiek (geen FK) — eerst de koppelingen naar deze eenheid
  // opruimen, anders blijven er wees-verbanden achter.
  await moet(
    supabase
      .from("verband")
      .delete()
      .eq("landgoed_id", landgoed_id)
      .eq("doel_type", "gebruikseenheid")
      .eq("doel_id", eenheid_id),
    "koppelingen van eenheid verwijderen",
  );
  await moet(
    supabase
      .from("gebruikseenheid")
      .delete()
      .eq("id", eenheid_id)
      .eq("landgoed_id", landgoed_id),
    "gebruikseenheid verwijderen",
  );
  revalidatePath(pad(landgoed_id, object_id));
}

export async function koppelContactAanEenheid(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const object_id = String(fd.get("object_id"));
  const eenheid_id = tekst(fd, "eenheid_id");
  const relatie_id = tekst(fd, "relatie_id");
  if (!eenheid_id || !relatie_id) return;
  const supabase = await createClient();
  const { data: gebruiker } = await supabase.auth.getUser();
  await moet(
    supabase.from("verband").upsert(
      {
        landgoed_id,
        bron_type: "relatie",
        bron_id: relatie_id,
        doel_type: "gebruikseenheid",
        doel_id: eenheid_id,
        rol: tekst(fd, "rol"),
        status: "geaccordeerd",
        aangemaakt_door: gebruiker.user?.id ?? null,
      },
      {
        onConflict: "bron_type,bron_id,doel_type,doel_id,rol",
        ignoreDuplicates: true,
      },
    ),
    "contact aan eenheid koppelen",
  );
  revalidatePath(pad(landgoed_id, object_id));
}

export async function ontkoppelContactVanEenheid(fd: FormData) {
  await ontkoppel(fd);
}

// ── Documenten ──
export async function uploadDocumentBijObject(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const object_id = String(fd.get("object_id"));
  const file = fd.get("bestand") as File | null;
  const titel = String(fd.get("titel") ?? "").trim();
  if (!file || file.size === 0) return;

  const supabase = await createClient();
  const bestandPad = `${landgoed_id}/${crypto.randomUUID()}-${veiligeNaam(file.name)}`;
  const { error } = await supabase.storage
    .from("documenten")
    .upload(bestandPad, file, { contentType: file.type || undefined });
  if (error) throw new Error(error.message);

  const { data: gebruiker } = await supabase.auth.getUser();
  const document = await moet(
    supabase
      .from("document")
      .insert({
        landgoed_id,
        scope: "landgoed",
        titel: titel || file.name,
        bestand_pad: bestandPad,
        geupload_door: gebruiker.user?.id,
      })
      .select("id")
      .single(),
    "document opslaan",
  );
  if (document.id) {
    await koppel(
      supabase,
      landgoed_id,
      "document",
      document.id,
      object_id,
      "betreft",
    );
  }
  revalidatePath(pad(landgoed_id, object_id));
}

export async function ontkoppelDocument(fd: FormData) {
  await ontkoppel(fd);
}
