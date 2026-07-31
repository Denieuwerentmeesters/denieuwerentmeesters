"use server";

import { createClient } from "@/lib/supabase/server";
import { moet } from "@/lib/db";
import { isLidVan } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { classificeerDocument } from "@/lib/ai";
import { isCategorie, NOG_IN_TE_DELEN } from "./categorieen";

function veiligeNaam(naam: string) {
  return naam.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// ── Classificatie: bron gaat vóór inhoud ─────────────────────────────────
//
// Twee routes, bewust gescheiden gehouden:
//
//   bron   — de herkomst legt de categorie vast (notulen uit een gesprek, upload
//            vanaf een contract- of subsidiepagina). Er valt niets te raden, dus
//            geen AI en geen bevestiging: geaccordeerd = true.
//   inhoud — losse upload of e-mailbijlage. De AI leidt de categorie af uit de
//            tekst en dat is een vóórstel: geaccordeerd = false, tot de gebruiker
//            in de werkvoorraad bevestigt.
//
// Kiest de gebruiker zelf een categorie in het uploadformulier, dan wint dat van
// beide routes — dan is het handmatig en dus per definitie geaccordeerd.

type CategorieVelden = {
  categorie: string;
  categorie_herkomst: "handmatig" | "bron" | "inhoud";
  categorie_geaccordeerd: boolean;
  categorie_voorstel_reden: string | null;
  geldig_tot: string | null;
  is_leidend: boolean;
};

const ONBEPAALD: CategorieVelden = {
  categorie: NOG_IN_TE_DELEN,
  categorie_herkomst: "inhoud",
  categorie_geaccordeerd: false,
  categorie_voorstel_reden: null,
  geldig_tot: null,
  is_leidend: false,
};

/**
 * Laat de AI een PDF classificeren. Geeft altijd bruikbare velden terug: zonder
 * API-key, bij een niet-PDF of bij een mislukte aanroep landt het document in de
 * werkvoorraad in plaats van dat de upload sneuvelt — het bestand staat dan al in
 * Storage en de gebruiker mag daar niets van merken.
 */
async function classificeerUitInhoud(
  bestand: File,
  titel: string,
): Promise<CategorieVelden> {
  if (bestand.type !== "application/pdf") return ONBEPAALD;
  try {
    const base64 = Buffer.from(await bestand.arrayBuffer()).toString("base64");
    const uitslag = await classificeerDocument({
      titel,
      pdf: { base64, mediaType: "application/pdf" },
    });
    if (!uitslag) return ONBEPAALD;
    return {
      categorie: uitslag.categorie,
      categorie_herkomst: "inhoud",
      categorie_geaccordeerd: false,
      categorie_voorstel_reden: uitslag.reden || null,
      geldig_tot: uitslag.geldig_tot ?? null,
      is_leidend: uitslag.is_leidend === true,
    };
  } catch (e) {
    console.error("[documenten] classificatie mislukt:", e);
    return ONBEPAALD;
  }
}

export async function uploadDocument(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const file = fd.get("bestand") as File | null;
  const titel = String(fd.get("titel") ?? "").trim();
  const gekozenCategorie = String(fd.get("categorie") ?? "").trim();
  const soort = fd.get("soort") === "bijlage" ? "bijlage" : "archiefstuk";
  const vertrouwelijkheidRuw = String(fd.get("vertrouwelijkheid") ?? "normaal");
  const vertrouwelijkheid = ["normaal", "vertrouwelijk", "gevoelig"].includes(
    vertrouwelijkheidRuw,
  )
    ? vertrouwelijkheidRuw
    : "normaal";
  // Optionele bron-context: upload vanaf een contract-, subsidie- of objectpagina.
  const doel_soort = String(fd.get("doel_soort") ?? "").trim();
  const doel_id = String(fd.get("doel_id") ?? "").trim();

  if (!file || file.size === 0) return;
  if (!landgoed_id || !(await isLidVan(landgoed_id))) return;

  const supabase = await createClient();
  const pad = `${landgoed_id}/${crypto.randomUUID()}-${veiligeNaam(file.name)}`;
  const definitieveTitel = titel || file.name;

  // Koos de gebruiker zelf? Dan niets vragen aan de AI. Anders: bron vóór inhoud.
  let velden: CategorieVelden;
  if (gekozenCategorie && isCategorie(gekozenCategorie)) {
    velden = {
      categorie: gekozenCategorie,
      categorie_herkomst: "handmatig",
      categorie_geaccordeerd: true,
      categorie_voorstel_reden: null,
      geldig_tot: null,
      is_leidend: false,
    };
  } else if (doel_soort === "contract") {
    velden = {
      categorie: "contracten_verhuur",
      categorie_herkomst: "bron",
      categorie_geaccordeerd: true,
      categorie_voorstel_reden: null,
      geldig_tot: null,
      is_leidend: false,
    };
  } else if (doel_soort === "subsidie") {
    velden = {
      categorie: "subsidies",
      categorie_herkomst: "bron",
      categorie_geaccordeerd: true,
      categorie_voorstel_reden: null,
      geldig_tot: null,
      is_leidend: false,
    };
  } else {
    velden = await classificeerUitInhoud(file, definitieveTitel);
  }

  const { error } = await supabase.storage
    .from("documenten")
    .upload(pad, file, { contentType: file.type || undefined });
  if (error) throw new Error(`document uploaden mislukt: ${error.message}`);

  const { data: gebruiker } = await supabase.auth.getUser();
  const doc = await moet(
    supabase
      .from("document")
      .insert({
        landgoed_id,
        scope: "landgoed",
        titel: definitieveTitel,
        bestand_pad: pad,
        geupload_door: gebruiker.user?.id,
        soort,
        vertrouwelijkheid,
        ...velden,
      })
      .select("id")
      .single(),
    "document opslaan",
  );

  if (doel_soort && doel_id) {
    await koppelDocument(doc.id, doel_soort, doel_id);
  }

  revalidatePath(`/landgoed/${landgoed_id}/documenten`);
  revalidatePath(`/landgoed/${landgoed_id}/documenten/${velden.categorie}`);
}

/** Legt een koppeling van een document naar een contract, object, subsidie, … */
export async function koppelDocument(
  documentId: string,
  doelSoort: string,
  doelId: string,
) {
  const supabase = await createClient();
  await moet(
    supabase
      .from("document_koppeling")
      .upsert(
        { document_id: documentId, doel_soort: doelSoort, doel_id: doelId },
        { onConflict: "document_id,doel_soort,doel_id" },
      ),
    "document koppelen",
  );
}

/**
 * Bevestigt de indeling van een AI-voorstel, eventueel met een andere categorie.
 * Vanaf dat moment is de indeling handmatig: de gebruiker heeft ernaar gekeken.
 */
export async function accordeerCategorie(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const id = String(fd.get("id"));
  const gekozen = String(fd.get("categorie") ?? "").trim();
  if (!landgoed_id || !(await isLidVan(landgoed_id))) return;

  const supabase = await createClient();
  const { data: huidig } = await supabase
    .from("document")
    .select("categorie")
    .eq("id", id)
    .eq("landgoed_id", landgoed_id)
    .maybeSingle();
  if (!huidig) return;

  const categorie = gekozen && isCategorie(gekozen) ? gekozen : huidig.categorie;

  await moet(
    supabase
      .from("document")
      .update({
        categorie,
        // Bevestigen zonder te wijzigen laat de herkomst 'inhoud' staan — dan blijft
        // zichtbaar dat de AI het voorstelde en de mens het goedkeurde. Koos de
        // gebruiker iets anders, dan is de indeling zijn eigen keuze.
        categorie_herkomst: categorie === huidig.categorie ? "inhoud" : "handmatig",
        categorie_geaccordeerd: true,
      })
      .eq("id", id)
      .eq("landgoed_id", landgoed_id),
    "categorie bevestigen",
  );

  revalidatePath(`/landgoed/${landgoed_id}/documenten`);
  revalidatePath(`/landgoed/${landgoed_id}/documenten/${categorie}`);
}

/** Handmatig herindelen vanaf de categoriepagina. */
export async function wijzigCategorie(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const id = String(fd.get("id"));
  const gekozen = String(fd.get("categorie") ?? "").trim();
  if (!landgoed_id || !(await isLidVan(landgoed_id))) return;
  if (!isCategorie(gekozen)) return;

  const supabase = await createClient();
  await moet(
    supabase
      .from("document")
      .update({
        categorie: gekozen,
        categorie_herkomst: "handmatig",
        categorie_geaccordeerd: true,
        categorie_voorstel_reden: null,
      })
      .eq("id", id)
      .eq("landgoed_id", landgoed_id),
    "categorie wijzigen",
  );

  revalidatePath(`/landgoed/${landgoed_id}/documenten`);
  revalidatePath(`/landgoed/${landgoed_id}/documenten/${gekozen}`);
}

/**
 * Haalt de documenten die nog op 'nog_in_te_delen' staan alsnog door de
 * classificatie. Bewust een knop en geen migratiestap: bij de migratie zou het
 * een berg ongecontroleerde AI-uitspraken opleveren waar niemand op zat te wachten.
 */
export async function herclassificeerOnbekende(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  if (!landgoed_id || !(await isLidVan(landgoed_id))) return;

  const supabase = await createClient();
  const { data: onbekend, error } = await supabase
    .from("document")
    .select("id, titel, bestand_pad")
    .eq("landgoed_id", landgoed_id)
    .eq("categorie", NOG_IN_TE_DELEN)
    .limit(20);
  if (error) throw new Error(`documenten ophalen mislukt: ${error.message}`);

  for (const doc of onbekend ?? []) {
    if (!doc.bestand_pad?.toLowerCase().endsWith(".pdf")) continue;
    const { data: blob } = await supabase.storage
      .from("documenten")
      .download(doc.bestand_pad);
    if (!blob) continue;
    const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
    const uitslag = await classificeerDocument({
      titel: doc.titel ?? "",
      pdf: { base64, mediaType: "application/pdf" },
    });
    if (!uitslag || uitslag.categorie === NOG_IN_TE_DELEN) continue;

    await moet(
      supabase
        .from("document")
        .update({
          categorie: uitslag.categorie,
          categorie_herkomst: "inhoud",
          categorie_geaccordeerd: false,
          categorie_voorstel_reden: uitslag.reden || null,
          geldig_tot: uitslag.geldig_tot ?? null,
          is_leidend: uitslag.is_leidend === true,
        })
        .eq("id", doc.id)
        .eq("landgoed_id", landgoed_id),
      "classificatie opslaan",
    );
  }

  revalidatePath(`/landgoed/${landgoed_id}/documenten`);
}

export async function verwijderDocument(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const id = String(fd.get("id"));
  const pad = String(fd.get("pad"));
  if (!landgoed_id || !(await isLidVan(landgoed_id))) return;

  const supabase = await createClient();
  if (pad) await supabase.storage.from("documenten").remove([pad]);
  await moet(
    supabase.from("document").delete().eq("id", id).eq("landgoed_id", landgoed_id),
    "document verwijderen",
  );
  revalidatePath(`/landgoed/${landgoed_id}/documenten`);
}
