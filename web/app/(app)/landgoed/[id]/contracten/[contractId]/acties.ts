"use server";

import { redirect } from "next/navigation";
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
        // bedrag ontbreekt bewust: dat is sinds plak 2 de spiegel van de
        // actuele geaccordeerde prijsafspraak. De overige prijsvelden
        // (servicekosten, indexatie, achterstand) horen bij Prijs &
        // indexatie en hebben hun eigen formulier + actie hieronder.
        ingangsdatum: tekst(fd, "ingangsdatum"),
        einddatum: tekst(fd, "einddatum"),
        notitie: tekst(fd, "notitie"),
      })
      .eq("id", contract_id)
      .eq("landgoed_id", landgoed_id),
    "contract bijwerken",
  );
  revalidatePath(pad(landgoed_id, contract_id));
}

// ── Overige prijsgegevens (sectie Prijs & indexatie) ──
export async function bewerkContractPrijsgegevens(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const contract_id = String(fd.get("contract_id"));
  if (!isUuid(contract_id)) return;
  const supabase = await createClient();
  await moet(
    supabase
      .from("contract")
      .update({
        servicekosten: getal(fd, "servicekosten"),
        indexatie_type: tekst(fd, "indexatie_type"),
        volgende_indexatie: tekst(fd, "volgende_indexatie"),
        achterstand: getal(fd, "achterstand"),
        achterstand_notitie: tekst(fd, "achterstand_notitie"),
      })
      .eq("id", contract_id)
      .eq("landgoed_id", landgoed_id),
    "prijsgegevens bijwerken",
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
  // Zonder redirect blijf je op de dossierpagina van het zojuist
  // verwijderde contract staan — en die geeft dan een 404.
  redirect(`/landgoed/${landgoed_id}/contracten`);
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

// ── Prijsafspraken (plak 2): historie met geldigheidsperioden ──

function dagErvoor(datum: string): string {
  const d = new Date(`${datum}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// De spiegel: contract.bedrag volgt de geaccordeerde prijs die vandaag
// geldt (of anders de meest recente). Zo blijven register, dossierkop en
// perceelpagina kloppen zonder joins.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function zetHuidigePrijs(supabase: any, landgoed_id: string, contract_id: string) {
  const { data } = await supabase
    .from("contract_prijsafspraak")
    .select("bedrag, geldig_van, geldig_tot")
    .eq("contract_id", contract_id)
    .eq("status", "geaccordeerd")
    .order("geldig_van", { ascending: false });
  const vandaag = new Date().toISOString().slice(0, 10);
  const rijen = (data ?? []) as { bedrag: number; geldig_van: string; geldig_tot: string | null }[];
  const actueel =
    rijen.find(
      (r) => r.geldig_van <= vandaag && (r.geldig_tot == null || r.geldig_tot >= vandaag),
    ) ?? rijen[0];
  await moet(
    supabase
      .from("contract")
      .update({ bedrag: actueel?.bedrag ?? null })
      .eq("id", contract_id)
      .eq("landgoed_id", landgoed_id),
    "huidige prijs bijwerken",
  );
}

// Bij een nieuwe geaccordeerde regel sluiten de nog openstaande oudere
// regels netjes af op de dag ervóór — zo blijft de historie sluitend.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sluitOudereRegels(supabase: any, contract_id: string, geldig_van: string) {
  const { data } = await supabase
    .from("contract_prijsafspraak")
    .select("id, geldig_van")
    .eq("contract_id", contract_id)
    .eq("status", "geaccordeerd")
    .is("geldig_tot", null)
    .lt("geldig_van", geldig_van);
  for (const rij of data ?? []) {
    await moet(
      supabase
        .from("contract_prijsafspraak")
        .update({ geldig_tot: dagErvoor(geldig_van) })
        .eq("id", rij.id),
      "vorige prijsperiode afsluiten",
    );
  }
}

export async function nieuwePrijsafspraak(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const contract_id = String(fd.get("contract_id"));
  const bedrag = getal(fd, "bedrag");
  const geldig_van = tekst(fd, "geldig_van");
  if (!isUuid(contract_id) || bedrag == null || !Number.isFinite(bedrag) || !geldig_van)
    return;
  const supabase = await createClient();
  await moet(
    supabase.from("contract_prijsafspraak").insert({
      landgoed_id,
      contract_id,
      bedrag,
      geldig_van,
      status: "geaccordeerd",
      herkomst: "handmatig",
      toelichting: tekst(fd, "toelichting"),
    }),
    "prijsafspraak opslaan",
  );
  await sluitOudereRegels(supabase, contract_id, geldig_van);
  await zetHuidigePrijs(supabase, landgoed_id, contract_id);
  revalidatePath(pad(landgoed_id, contract_id));
}

export async function maakIndexatieVoorstel(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const contract_id = String(fd.get("contract_id"));
  const percentage = getal(fd, "percentage");
  const ingangsdatum = tekst(fd, "ingangsdatum");
  if (!isUuid(contract_id) || percentage == null || !Number.isFinite(percentage) || !ingangsdatum)
    return;
  const supabase = await createClient();
  const { data: contract } = await supabase
    .from("contract")
    .select("bedrag")
    .eq("id", contract_id)
    .eq("landgoed_id", landgoed_id)
    .maybeSingle();
  const huidig = Number(contract?.bedrag);
  if (!Number.isFinite(huidig)) return;
  const nieuw = Math.round(huidig * (1 + percentage / 100) * 100) / 100;
  await moet(
    supabase.from("contract_prijsafspraak").insert({
      landgoed_id,
      contract_id,
      bedrag: nieuw,
      geldig_van: ingangsdatum,
      status: "voorstel",
      herkomst: "indexatie",
      toelichting: `indexatie ${percentage.toLocaleString("nl-NL")}% over ${huidig.toLocaleString("nl-NL")}`,
    }),
    "indexatievoorstel opslaan",
  );
  revalidatePath(pad(landgoed_id, contract_id));
}

export async function accordeerPrijsvoorstel(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const contract_id = String(fd.get("contract_id"));
  const afspraak_id = String(fd.get("afspraak_id"));
  if (!isUuid(afspraak_id)) return;
  const supabase = await createClient();
  const { data: afspraak } = await supabase
    .from("contract_prijsafspraak")
    .select("id, geldig_van, herkomst")
    .eq("id", afspraak_id)
    .eq("landgoed_id", landgoed_id)
    .maybeSingle();
  if (!afspraak) return;
  await moet(
    supabase
      .from("contract_prijsafspraak")
      .update({ status: "geaccordeerd" })
      .eq("id", afspraak_id),
    "prijsvoorstel accorderen",
  );
  await sluitOudereRegels(supabase, contract_id, afspraak.geldig_van);
  await zetHuidigePrijs(supabase, landgoed_id, contract_id);
  // Geaccordeerde indexatie: administratie meteen bij — de laatste
  // indexatiedatum wordt de ingangsdatum, de volgende schuift een jaar op.
  if (afspraak.herkomst === "indexatie") {
    const volgend = new Date(`${afspraak.geldig_van}T12:00:00Z`);
    volgend.setUTCFullYear(volgend.getUTCFullYear() + 1);
    await moet(
      supabase
        .from("contract")
        .update({
          laatste_indexatie: afspraak.geldig_van,
          volgende_indexatie: volgend.toISOString().slice(0, 10),
        })
        .eq("id", contract_id)
        .eq("landgoed_id", landgoed_id),
      "indexatiedata bijwerken",
    );
  }
  revalidatePath(pad(landgoed_id, contract_id));
}

export async function wijsAfPrijsvoorstel(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const contract_id = String(fd.get("contract_id"));
  const afspraak_id = String(fd.get("afspraak_id"));
  if (!isUuid(afspraak_id)) return;
  const supabase = await createClient();
  await moet(
    supabase
      .from("contract_prijsafspraak")
      .update({ status: "afgewezen" })
      .eq("id", afspraak_id)
      .eq("landgoed_id", landgoed_id),
    "prijsvoorstel afwijzen",
  );
  revalidatePath(pad(landgoed_id, contract_id));
}

export async function verwijderPrijsafspraak(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const contract_id = String(fd.get("contract_id"));
  const afspraak_id = String(fd.get("afspraak_id"));
  if (!isUuid(afspraak_id)) return;
  const supabase = await createClient();
  await moet(
    supabase
      .from("contract_prijsafspraak")
      .delete()
      .eq("id", afspraak_id)
      .eq("landgoed_id", landgoed_id),
    "prijsafspraak verwijderen",
  );
  await zetHuidigePrijs(supabase, landgoed_id, contract_id);
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
