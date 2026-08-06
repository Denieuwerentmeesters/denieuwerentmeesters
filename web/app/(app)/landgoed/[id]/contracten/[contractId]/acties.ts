"use server";

import { createClient } from "@/lib/supabase/server";
import { isUuid, moet } from "@/lib/db";
import { revalidatePath } from "next/cache";
import {
  CONTRACT_STATUS_LABEL,
  CONTRACT_TYPE_LABEL,
  LOOPTIJD_LABEL,
  PACHTVORM_LABEL,
  PARTIJ_ROL_LABEL,
} from "../constanten";

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
function pad(landgoed_id: string, contract_id: string) {
  return `/landgoed/${landgoed_id}/contracten/${contract_id}`;
}
// Alleen waarden uit de eigen lijsten toelaten (status heeft geen
// DB-constraint, dus hier is de grens).
function uitLijst(waarde: string | null, lijst: Record<string, string>) {
  return waarde && waarde in lijst ? waarde : null;
}

// ── Kerngegevens van het dossier ──
export async function bewerkContractDossier(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const contract_id = String(fd.get("contract_id"));
  if (!isUuid(contract_id)) return;
  const titel = tekst(fd, "titel");
  if (!titel) return;
  const supabase = await createClient();
  await moet(
    supabase
      .from("contract")
      .update({
        titel,
        contractnummer: tekst(fd, "contractnummer"),
        type: uitLijst(tekst(fd, "type"), CONTRACT_TYPE_LABEL),
        status: uitLijst(tekst(fd, "status"), CONTRACT_STATUS_LABEL) ?? "concept",
        pachtvorm: uitLijst(tekst(fd, "pachtvorm"), PACHTVORM_LABEL),
        looptijd_type: uitLijst(tekst(fd, "looptijd_type"), LOOPTIJD_LABEL),
        bedrag: getal(fd, "bedrag"),
        servicekosten: getal(fd, "servicekosten"),
        ingangsdatum: tekst(fd, "ingangsdatum"),
        einddatum: tekst(fd, "einddatum"),
        indexatie_type: tekst(fd, "indexatie_type"),
        volgende_indexatie: tekst(fd, "volgende_indexatie"),
        achterstand: getal(fd, "achterstand"),
        achterstand_notitie: tekst(fd, "achterstand_notitie"),
        notitie: tekst(fd, "notitie"),
      })
      .eq("id", contract_id)
      .eq("landgoed_id", landgoed_id),
    "contract bijwerken",
  );
  revalidatePath(pad(landgoed_id, contract_id));
}

export async function verwijderContract(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const contract_id = String(fd.get("contract_id"));
  if (!isUuid(contract_id)) return;
  const supabase = await createClient();
  // Verband is generiek (geen FK): eerst de koppelingen opruimen — zowel
  // de oude afspraak-verbanden (bron) als document-koppelingen (doel).
  await moet(
    supabase
      .from("verband")
      .delete()
      .eq("landgoed_id", landgoed_id)
      .or(
        `and(bron_type.eq.contract,bron_id.eq.${contract_id}),and(doel_type.eq.contract,doel_id.eq.${contract_id})`,
      ),
    "contract-koppelingen verwijderen",
  );
  // contract_partij en contract_object ruimen zichzelf op (FK cascade).
  await moet(
    supabase
      .from("contract")
      .delete()
      .eq("id", contract_id)
      .eq("landgoed_id", landgoed_id),
    "contract verwijderen",
  );
  revalidatePath(`/landgoed/${landgoed_id}/contracten`);
}

// ── Partijen ──
export async function koppelPartij(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const contract_id = String(fd.get("contract_id"));
  const relatie_id = tekst(fd, "relatie_id");
  if (!isUuid(contract_id) || !relatie_id || !isUuid(relatie_id)) return;
  const rol = uitLijst(tekst(fd, "rol"), PARTIJ_ROL_LABEL) ?? "partij";
  const supabase = await createClient();
  await moet(
    supabase.from("contract_partij").upsert(
      { landgoed_id, contract_id, relatie_id, rol },
      { onConflict: "contract_id,relatie_id,rol", ignoreDuplicates: true },
    ),
    "partij koppelen",
  );
  revalidatePath(pad(landgoed_id, contract_id));
}

export async function ontkoppelPartij(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const contract_id = String(fd.get("contract_id"));
  const partij_id = String(fd.get("partij_id"));
  if (!isUuid(partij_id)) return;
  const supabase = await createClient();
  await moet(
    supabase
      .from("contract_partij")
      .delete()
      .eq("id", partij_id)
      .eq("landgoed_id", landgoed_id),
    "partij ontkoppelen",
  );
  revalidatePath(pad(landgoed_id, contract_id));
}

// ── Objecten (waar rust het contract op) ──
const OBJECT_TYPES = new Set(["kadastraal_perceel", "stamobject", "gebruikseenheid"]);
const OBJECT_TABEL: Record<string, string> = {
  kadastraal_perceel: "kadastraal_perceel",
  stamobject: "stamobject",
  gebruikseenheid: "gebruikseenheid",
};

export async function koppelContractObject(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const contract_id = String(fd.get("contract_id"));
  // Eén select levert "type:id" — zo blijft het formulier één dropdown.
  const keuze = tekst(fd, "object_keuze");
  if (!isUuid(contract_id) || !keuze) return;
  const [object_type, object_id] = keuze.split(":");
  if (!OBJECT_TYPES.has(object_type) || !isUuid(object_id)) return;
  const supabase = await createClient();
  // Het object moet van dit landgoed zijn (polymorf, dus geen FK-check).
  const { data: bestaat } = await supabase
    .from(OBJECT_TABEL[object_type])
    .select("id")
    .eq("id", object_id)
    .eq("landgoed_id", landgoed_id)
    .maybeSingle();
  if (!bestaat) return;
  await moet(
    supabase.from("contract_object").upsert(
      { landgoed_id, contract_id, object_type, object_id },
      { onConflict: "contract_id,object_type,object_id", ignoreDuplicates: true },
    ),
    "object koppelen",
  );
  revalidatePath(pad(landgoed_id, contract_id));
}

export async function ontkoppelContractObject(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const contract_id = String(fd.get("contract_id"));
  const koppel_id = String(fd.get("koppel_id"));
  if (!isUuid(koppel_id)) return;
  const supabase = await createClient();
  await moet(
    supabase
      .from("contract_object")
      .delete()
      .eq("id", koppel_id)
      .eq("landgoed_id", landgoed_id),
    "object ontkoppelen",
  );
  revalidatePath(pad(landgoed_id, contract_id));
}

// ── Documenten (via verband, doel = contract) ──
export async function uploadDocumentBijContract(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const contract_id = String(fd.get("contract_id"));
  const file = fd.get("bestand") as File | null;
  const titel = String(fd.get("titel") ?? "").trim();
  if (!isUuid(contract_id) || !file || file.size === 0) return;

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
    await moet(
      supabase.from("verband").upsert(
        {
          landgoed_id,
          bron_type: "document",
          bron_id: document.id,
          doel_type: "contract",
          doel_id: contract_id,
          rol: "betreft",
          status: "geaccordeerd",
          aangemaakt_door: gebruiker.user?.id ?? null,
        },
        {
          onConflict: "bron_type,bron_id,doel_type,doel_id,rol",
          ignoreDuplicates: true,
        },
      ),
      "document koppelen",
    );
  }
  revalidatePath(pad(landgoed_id, contract_id));
}

export async function ontkoppelDocumentVanContract(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const contract_id = String(fd.get("contract_id"));
  const verband_id = String(fd.get("verband_id"));
  if (!isUuid(verband_id)) return;
  const supabase = await createClient();
  await moet(
    supabase.from("verband").delete().eq("id", verband_id),
    "document ontkoppelen",
  );
  revalidatePath(pad(landgoed_id, contract_id));
}
