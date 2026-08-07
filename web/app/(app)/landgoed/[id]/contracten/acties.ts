"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { moet } from "@/lib/db";
import {
  contractExtractieBeschikbaar,
  extraheerContractUitPdf,
  normaliseerAanduiding,
  type ContractVoorstel,
} from "@/lib/contracten/extractie";

function veiligeNaam(naam: string) {
  return naam.replace(/[^a-zA-Z0-9._-]/g, "_");
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// ── Nieuw contract uit document(en) (plak 4, issue #152) ──
// Eén of meer pdf's tegelijk (bulk, wens Steven); ze worden één voor één
// verwerkt. Met het vinkje "één contract" worden alle pdf's juist als één
// geheel gelezen (hoofdovereenkomst + bijlagen) en komt er één dossier uit.
// Elk document wordt altijd eerst veiliggesteld (upload + document-rij),
// daarna leest de AI het contract. Het resultaat is een CONCEPT-dossier
// (herkomst 'ai') dat de gebruiker naloopt en accordeert door de status op
// Actief te zetten. Mislukt de extractie, dan bestaat het dossier alsnog —
// met de documenten eraan en een eerlijke notitie waarom de velden leeg zijn.
export async function nieuwContractUitDocument(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const eenContract = fd.get("een_contract") === "ja";
  const bestanden = fd
    .getAll("bestand")
    .filter(
      (b): b is File =>
        b instanceof File && b.size > 0 && b.type === "application/pdf",
    );
  if (bestanden.length === 0) return;

  const supabase = await createClient();
  const { data: gebruiker } = await supabase.auth.getUser();

  // Partijen en kadastrale percelen van het landgoed één keer ophalen om de
  // AI-namen aan échte registraties te matchen (AI schept geen feiten).
  const [{ data: relaties }, { data: percelen }] = await Promise.all([
    supabase.from("relatie").select("id, naam").eq("landgoed_id", landgoed_id),
    supabase
      .from("kadastraal_perceel")
      .select("id, kadastrale_aanduiding")
      .eq("landgoed_id", landgoed_id),
  ]);
  const relatieVanNaam = new Map(
    (relaties ?? []).map((r) => [String(r.naam).toLowerCase().trim(), r.id as string]),
  );
  const perceelVanAanduiding = new Map(
    (percelen ?? []).map((p) => [
      normaliseerAanduiding(String(p.kadastrale_aanduiding)),
      p.id as string,
    ]),
  );

  // Met het vinkje "één contract" gaan alle bestanden samen in één beurt;
  // anders elk bestand apart, en dan mag één mislukt bestand de rest niet
  // blokkeren.
  const beurten: File[][] = eenContract
    ? [bestanden]
    : bestanden.map((f) => [f]);
  const dossierIds: string[] = [];
  const mislukt: string[] = [];
  for (const files of beurten) {
    try {
      dossierIds.push(
        await verwerkContractPdfs({
          supabase,
          landgoed_id,
          gebruikerId: gebruiker.user?.id ?? null,
          files,
          relatieVanNaam,
          perceelVanAanduiding,
        }),
      );
    } catch (e) {
      mislukt.push(
        `${files.map((f) => f.name).join(" + ")} (${e instanceof Error ? e.message : String(e)})`,
      );
    }
  }

  // Eén dossier dat lukte (één bestand, of alle bestanden samen als één
  // contract): direct naar het dossier. Anders terug naar het register,
  // met een eerlijke melding over wat er wel en niet lukte.
  if (dossierIds.length === 1 && mislukt.length === 0) {
    redirect(`/landgoed/${landgoed_id}/contracten/${dossierIds[0]}`);
  }
  const delen: string[] = [];
  if (dossierIds.length > 0) {
    delen.push(
      dossierIds.length === 1
        ? "1 document gelezen en als concept-dossier klaargezet."
        : `${dossierIds.length} documenten gelezen en als concept-dossiers klaargezet.`,
    );
  }
  if (mislukt.length > 0) {
    delen.push(`Niet gelukt: ${mislukt.join("; ")}.`);
  }
  redirect(
    `/landgoed/${landgoed_id}/contracten?melding=${encodeURIComponent(delen.join(" "))}`,
  );
}

// De verwerking van één contract: één of meer pdf's (hoofdovereenkomst +
// eventuele bijlagen) veiligstellen → in samenhang door de AI laten lezen →
// één concept-dossier. Geeft het contract-id terug.
async function verwerkContractPdfs({
  supabase,
  landgoed_id,
  gebruikerId,
  files,
  relatieVanNaam,
  perceelVanAanduiding,
}: {
  supabase: SupabaseClient;
  landgoed_id: string;
  gebruikerId: string | null;
  files: File[];
  relatieVanNaam: Map<string, string>;
  perceelVanAanduiding: Map<string, string>;
}): Promise<string> {
  // 1. Documenten veiligstellen (private bucket + document-rij per bestand).
  const documentIds: string[] = [];
  const base64s: string[] = [];
  for (const file of files) {
    const bestandPad = `${landgoed_id}/${crypto.randomUUID()}-${veiligeNaam(file.name)}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: uploadFout } = await supabase.storage
      .from("documenten")
      .upload(bestandPad, bytes, { contentType: "application/pdf" });
    if (uploadFout) throw new Error(uploadFout.message);

    const document = await moet(
      supabase
        .from("document")
        .insert({
          landgoed_id,
          scope: "landgoed",
          titel: file.name,
          bestand_pad: bestandPad,
          geupload_door: gebruikerId,
        })
        .select("id")
        .single(),
      "document opslaan",
    );
    documentIds.push(document.id as string);
    base64s.push(bytes.toString("base64"));
  }

  // 2. AI-extractie over alle bestanden samen — falen is geen ramp: het
  //    dossier komt er toch, met een eerlijke notitie in plaats van stil
  //    lege velden.
  let voorstel: ContractVoorstel | null = null;
  let extractieFout: string | null = null;
  if (!contractExtractieBeschikbaar()) {
    extractieFout = "AI niet beschikbaar (geen sleutel ingesteld)";
  } else {
    try {
      voorstel = await extraheerContractUitPdf(base64s);
    } catch (e) {
      extractieFout = e instanceof Error ? e.message : String(e);
    }
  }

  const notities: string[] = [];
  if (extractieFout) {
    notities.push(`AI-extractie mislukt: ${extractieFout} — vul de velden handmatig in.`);
  }
  if (voorstel?.onzekerheden) notities.push(`AI-onzekerheden: ${voorstel.onzekerheden}`);

  // Partijen zonder bestaand contact worden direct aangemaakt — als
  // AI-voorstel (herkomst 'ai', niet geaccordeerd) dat de gebruiker bij
  // Contacten bevestigt. Zo is het dossier meteen compleet gekoppeld,
  // zonder dat de AI ongezien feiten vastlegt. Nieuwe contacten komen in
  // relatieVanNaam, zodat een tweede document in dezelfde beurt dezelfde
  // partij niet nóg eens aanmaakt.
  const ongematchtePartijen = (voorstel?.partijen ?? []).filter(
    (p) => !relatieVanNaam.has(p.naam.toLowerCase().trim()),
  );
  if (ongematchtePartijen.length) {
    const { data: rolTypen } = await supabase
      .from("rol_type")
      .select("id, naam")
      .or(`tenant_id.is.null,tenant_id.eq.${landgoed_id}`);
    const rolTypeVanNaam = new Map(
      (rolTypen ?? []).map((r) => [String(r.naam).toLowerCase().trim(), r.id as string]),
    );
    for (const p of ongematchtePartijen) {
      const contact = await moet(
        supabase
          .from("relatie")
          .insert({
            landgoed_id,
            naam: p.naam,
            status: "actief",
            herkomst: "ai",
            geaccordeerd: false,
            bron: `uit contract-pdf ${files.map((f) => f.name).join(" + ")}`,
          })
          .select("id")
          .single(),
        "contact aanmaken",
      );
      relatieVanNaam.set(p.naam.toLowerCase().trim(), contact.id as string);
      // Rol als contactrol meegeven als die als rol-type bestaat (bv.
      // 'pachter') — puur gemak, geen harde eis.
      const rolTypeId = rolTypeVanNaam.get(p.rol);
      if (rolTypeId) {
        await moet(
          supabase.from("contact_rol").upsert(
            { contact_id: contact.id as string, rol_type_id: rolTypeId },
            { onConflict: "contact_id,rol_type_id", ignoreDuplicates: true },
          ),
          "contactrol toevoegen",
        );
      }
    }
    notities.push(
      `Nieuwe contacten uit het document, aangemaakt door AI: ${ongematchtePartijen
        .map((p) => `${p.naam} (${p.rol})`)
        .join(", ")} — bevestig ze bij Contacten.`,
    );
  }
  const ongematchteAanduidingen = (voorstel?.kadastrale_aanduidingen ?? []).filter(
    (a) => !perceelVanAanduiding.has(normaliseerAanduiding(a)),
  );
  if (ongematchteAanduidingen.length) {
    notities.push(
      `Kadastrale aanduidingen uit het document die niet in het bezit staan: ${ongematchteAanduidingen.join(
        ", ",
      )}.`,
    );
  }

  // 3. Het concept-dossier (herkomst 'ai' — het hele dossier is het voorstel).
  const contract = await moet(
    supabase
      .from("contract")
      .insert({
        landgoed_id,
        titel: voorstel?.titel ?? files[0].name.replace(/\.pdf$/i, ""),
        contractnummer: voorstel?.contractnummer ?? null,
        type: voorstel?.type ?? "pacht",
        pachtvorm: voorstel?.pachtvorm ?? null,
        looptijd_type: voorstel?.looptijd_type ?? null,
        ingangsdatum: voorstel?.ingangsdatum ?? null,
        einddatum: voorstel?.einddatum ?? null,
        // transitie-tekstveld: zo toont het register de partijen ook zolang
        // er nog geen contact gekoppeld is
        partij: (voorstel?.partijen ?? []).map((p) => p.naam).join(", ") || null,
        status: "concept",
        herkomst: "ai",
        notitie: notities.join(" ") || null,
      })
      .select("id")
      .single(),
    "contract opslaan",
  );
  const contract_id = contract.id as string;

  // 4. Alle documenten aan het dossier hangen.
  for (const documentId of documentIds) {
    await moet(
      supabase.from("verband").insert({
        landgoed_id,
        bron_type: "document",
        bron_id: documentId,
        doel_type: "contract",
        doel_id: contract_id,
        rol: "betreft",
        status: "geaccordeerd",
        aangemaakt_door: gebruikerId,
      }),
      "document koppelen",
    );
  }

  // 5. Gematchte partijen en percelen koppelen (alleen bestaande
  //    registraties — de rest staat in de notitie).
  for (const p of voorstel?.partijen ?? []) {
    const relatie_id = relatieVanNaam.get(p.naam.toLowerCase().trim());
    if (!relatie_id) continue;
    await moet(
      supabase.from("contract_partij").upsert(
        { landgoed_id, contract_id, relatie_id, rol: p.rol },
        { onConflict: "contract_id,relatie_id,rol", ignoreDuplicates: true },
      ),
      "partij koppelen",
    );
  }
  for (const a of voorstel?.kadastrale_aanduidingen ?? []) {
    const object_id = perceelVanAanduiding.get(normaliseerAanduiding(a));
    if (!object_id) continue;
    await moet(
      supabase.from("contract_object").upsert(
        { landgoed_id, contract_id, object_type: "kadastraal_perceel", object_id },
        { onConflict: "contract_id,object_type,object_id", ignoreDuplicates: true },
      ),
      "perceel koppelen",
    );
  }

  // 6. De prijs uit het document als voorstel-regel (accordeer-flow plak 2).
  if (voorstel?.bedrag_per_jaar != null) {
    await moet(
      supabase.from("contract_prijsafspraak").insert({
        landgoed_id,
        contract_id,
        bedrag: voorstel.bedrag_per_jaar,
        geldig_van: voorstel.ingangsdatum ?? new Date().toISOString().slice(0, 10),
        status: "voorstel",
        herkomst: "ai",
        toelichting: "prijs uit het geüploade contract",
      }),
      "prijsvoorstel opslaan",
    );
  }

  return contract_id;
}
