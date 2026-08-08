"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { moet } from "@/lib/db";
import mammoth from "mammoth";
import heicConvert from "heic-convert";
import { bepaalBestandsSoort } from "@/lib/contracten/bestanden";
import { normaliseerContactNaam } from "@/lib/contacten/namen";
import {
  contractExtractieBeschikbaar,
  extraheerContract,
  normaliseerAanduiding,
  type ContractVoorstel,
  type ExtractieBron,
} from "@/lib/contracten/extractie";

function veiligeNaam(naam: string) {
  return naam.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// Eén geüpload bestand omzetten naar iets wat de AI kan lezen:
// pdf gaat rechtstreeks mee; jpg/png/webp als afbeelding; heic (iPhone-
// foto's) wordt eerst naar jpeg omgezet; uit een Word-bestand halen we de
// tekst. Gooit een leesbare fout bij een niet-ondersteund of onleesbaar
// bestand — de aanroeper meldt die per bestand.
async function maakBron(file: File, bytes: Buffer): Promise<ExtractieBron> {
  const soort = bepaalBestandsSoort(file.type, file.name);
  if (soort === "pdf") {
    return { soort: "pdf", base64: bytes.toString("base64") };
  }
  if (soort === "afbeelding") {
    const n = file.name.toLowerCase();
    const mediaType =
      file.type === "image/png" || n.endsWith(".png")
        ? ("image/png" as const)
        : file.type === "image/webp" || n.endsWith(".webp")
          ? ("image/webp" as const)
          : ("image/jpeg" as const);
    return { soort: "afbeelding", mediaType, base64: bytes.toString("base64") };
  }
  if (soort === "heic") {
    const jpeg = Buffer.from(
      await heicConvert({ buffer: bytes, format: "JPEG", quality: 0.7 }),
    );
    return {
      soort: "afbeelding",
      mediaType: "image/jpeg",
      base64: jpeg.toString("base64"),
    };
  }
  if (soort === "docx") {
    const { value } = await mammoth.extractRawText({ buffer: bytes });
    const tekst = value.trim();
    if (!tekst) throw new Error("geen tekst gevonden in het Word-bestand");
    return { soort: "tekst", naam: file.name, tekst };
  }
  throw new Error("bestandstype wordt niet ondersteund");
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
        b instanceof File &&
        b.size > 0 &&
        bepaalBestandsSoort(b.type, b.name) !== null,
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
    (relaties ?? []).map((r) => [normaliseerContactNaam(String(r.naam)), r.id as string]),
  );
  const bekendeNamen = (relaties ?? []).map((r) => String(r.naam));
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
        await verwerkContractBestanden({
          supabase,
          landgoed_id,
          gebruikerId: gebruiker.user?.id ?? null,
          files,
          relatieVanNaam,
          bekendeNamen,
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

// De verwerking van één contract: één of meer bestanden (pdf, Word,
// scan/foto — hoofdovereenkomst + eventuele bijlagen) veiligstellen → in
// samenhang door de AI laten lezen → één concept-dossier. Geeft het
// contract-id terug.
async function verwerkContractBestanden({
  supabase,
  landgoed_id,
  gebruikerId,
  files,
  relatieVanNaam,
  bekendeNamen,
  perceelVanAanduiding,
}: {
  supabase: SupabaseClient;
  landgoed_id: string;
  gebruikerId: string | null;
  files: File[];
  relatieVanNaam: Map<string, string>;
  bekendeNamen: string[];
  perceelVanAanduiding: Map<string, string>;
}): Promise<string> {
  // 1. Elk bestand eerst leesbaar maken voor de AI (vóór de upload — een
  //    mislukte conversie laat dan niets half achter), daarna veiligstellen
  //    in de private bucket + document-rij.
  const documentIds: string[] = [];
  const bronnen: ExtractieBron[] = [];
  for (const file of files) {
    const bytes = Buffer.from(await file.arrayBuffer());
    bronnen.push(await maakBron(file, bytes));

    const bestandPad = `${landgoed_id}/${crypto.randomUUID()}-${veiligeNaam(file.name)}`;
    const { error: uploadFout } = await supabase.storage
      .from("documenten")
      .upload(bestandPad, bytes, {
        contentType: file.type || "application/octet-stream",
      });
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
  }

  // 2. AI-extractie over alle bronnen samen — falen is geen ramp: het
  //    dossier komt er toch, met een eerlijke notitie in plaats van stil
  //    lege velden.
  let voorstel: ContractVoorstel | null = null;
  let extractieFout: string | null = null;
  if (!contractExtractieBeschikbaar()) {
    extractieFout = "AI niet beschikbaar (geen sleutel ingesteld)";
  } else {
    try {
      voorstel = await extraheerContract(bronnen, { bekendeNamen });
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
    (p) => !relatieVanNaam.has(normaliseerContactNaam(p.naam)),
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
      relatieVanNaam.set(normaliseerContactNaam(p.naam), contact.id as string);
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
        indexatie_type: voorstel?.indexatie_type ?? null,
        indexatie_percentage: voorstel?.indexatie_percentage ?? null,
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
    const relatie_id = relatieVanNaam.get(normaliseerContactNaam(p.naam));
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
