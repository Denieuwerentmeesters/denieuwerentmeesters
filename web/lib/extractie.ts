import type { SupabaseClient } from "@supabase/supabase-js";
import {
  extraheerUitDocument,
  extraheerUitTekst,
  extraheerLopendeSubsidies,
  type ExtractieContext,
  type ExtractieResultaat,
  type LopendeSubsidieVoorstel,
} from "@/lib/ai";

// Bron-adapters: elke bron levert een ExtractieResultaat (objecten + koppelingen),
// die via persisteerVoorstellen als voorstellen (te accorderen) wordt weggeschreven.
// v1: document (Claude leest PDF) + transacties (bestaande data). E-mail volgt met
// de koppelingenlaag (Deel V).

type Db = SupabaseClient;

const TOEGESTANE_CATEGORIEEN = new Set([
  "gebouw",
  "woning",
  "opstal",
  "pachtperceel",
  "tuin",
  "natuur",
  "infrastructuur",
  "water",
  "overig",
]);

function normNaam(s: string): string {
  return (s ?? "").toLowerCase().trim();
}

// Context: de reeds bekende records waar de AI naar mag verwijzen.
async function laadContext(
  supabase: Db,
  landgoedId: string,
): Promise<ExtractieContext> {
  const [contracten, relaties, objecten] = await Promise.all([
    supabase
      .from("contract")
      .select("id, titel, type")
      .eq("landgoed_id", landgoedId),
    supabase
      .from("relatie")
      .select("id, naam, type")
      .eq("landgoed_id", landgoedId),
    supabase
      .from("stamobject")
      .select("id, naam, categorie")
      .eq("landgoed_id", landgoedId)
      .eq("geaccordeerd", true),
  ]);
  return {
    contracten: (contracten.data ?? []).map((c) => ({
      id: c.id,
      label: `${c.titel}${c.type ? ` (${c.type})` : ""}`,
    })),
    relaties: (relaties.data ?? []).map((r) => ({
      id: r.id,
      label: `${r.naam}${r.type ? ` (${r.type})` : ""}`,
    })),
    objecten: (objecten.data ?? []).map((o) => ({
      id: o.id,
      label: `${o.naam} (${o.categorie})`,
    })),
  };
}

// ── Bron: geüpload document (PDF) ──
export async function documentBron(
  supabase: Db,
  landgoedId: string,
  documentId: string,
): Promise<{ resultaat: ExtractieResultaat | null; fout?: string }> {
  const { data: doc } = await supabase
    .from("document")
    .select("id, titel, bestand_pad")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc?.bestand_pad) return { resultaat: null, fout: "Document niet gevonden." };
  if (!doc.bestand_pad.toLowerCase().endsWith(".pdf")) {
    return {
      resultaat: null,
      fout: "Alleen PDF-documenten kunnen nu door de AI gelezen worden.",
    };
  }

  const { data: blob, error } = await supabase.storage
    .from("documenten")
    .download(doc.bestand_pad);
  if (error || !blob) return { resultaat: null, fout: "Bestand niet te lezen." };

  const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
  const context = await laadContext(supabase, landgoedId);
  const resultaat = await extraheerUitDocument(
    { base64, mediaType: "application/pdf" },
    context,
  );
  return { resultaat };
}

// ── Bron: bestaande transacties (boekhouding/bank al geïmporteerd) ──
export async function transactieBron(
  supabase: Db,
  landgoedId: string,
): Promise<{ resultaat: ExtractieResultaat | null; fout?: string }> {
  const { data: transacties } = await supabase
    .from("transactie")
    .select("omschrijving, bedrag, tegenpartij, categorie")
    .eq("landgoed_id", landgoedId)
    .limit(200);
  if (!transacties?.length)
    return { resultaat: null, fout: "Geen transacties om uit te lezen." };

  const tekst = transacties
    .map(
      (t) =>
        `${t.bedrag} — ${t.omschrijving}${t.tegenpartij ? ` [${t.tegenpartij}]` : ""}${t.categorie ? ` {${t.categorie}}` : ""}`,
    )
    .join("\n");
  const context = await laadContext(supabase, landgoedId);
  const resultaat = await extraheerUitTekst(
    `Onderstaande banktransacties van het landgoed. Leid hier alleen objecten/koppelingen uit af die duidelijk volgen (bv. terugkerende huur/pacht die naar een woning of pachter wijst). Verzin niets.\n\n${tekst}`,
    context,
  );
  return { resultaat };
}

// ── Bron: e-mail (IMAP) — wacht op de koppelingenlaag (Deel V) ──
export async function emailBron(): Promise<{
  resultaat: ExtractieResultaat | null;
  fout?: string;
}> {
  return {
    resultaat: null,
    fout: "E-mailbron komt met de koppelingenlaag (e-mail/boekhouding-integratie).",
  };
}

// ── Voorstellen wegschrijven ──
// stamobject -> herkomst='ai', geaccordeerd=false. verband -> status='voorgesteld'.
// tijdelijk_id's worden vertaald naar de nieuwe stamobject-uuids.
export async function persisteerVoorstellen(
  supabase: Db,
  opts: {
    landgoedId: string;
    gebruikerId?: string;
    bronSoort: "document" | "transacties" | "email";
    bronId?: string;
    resultaat: ExtractieResultaat;
    model: string;
  },
): Promise<{ objecten: number; koppelingen: number }> {
  const { landgoedId, gebruikerId, bronSoort, bronId, resultaat } = opts;
  const idMap = new Map<string, string>(); // tijdelijk_id -> echte uuid

  // Bestaande objecten ophalen om duplicaten te voorkomen (match op naam).
  const { data: bestaand } = await supabase
    .from("stamobject")
    .select("id, naam")
    .eq("landgoed_id", landgoedId);
  const naamNaarId = new Map<string, string>();
  (bestaand ?? []).forEach((b) => naamNaarId.set(normNaam(b.naam), b.id));

  let nieuwAantal = 0;
  // 1. Objecten inserten — duplicaten (zelfde naam) overslaan en koppelen aan bestaand.
  for (const o of resultaat.objecten ?? []) {
    const nrm = normNaam(o.naam);
    const bestaandeId = naamNaarId.get(nrm);
    if (bestaandeId) {
      if (o.tijdelijk_id) idMap.set(o.tijdelijk_id, bestaandeId);
      continue;
    }
    const categorie = TOEGESTANE_CATEGORIEEN.has(o.categorie)
      ? o.categorie
      : "overig";
    const { data, error } = await supabase
      .from("stamobject")
      .insert({
        landgoed_id: landgoedId,
        categorie,
        naam: o.naam,
        code: o.code ?? null,
        beschrijving: o.beschrijving ?? null,
        kenmerken: o.kenmerken ?? {},
        herkomst: "ai",
        voorstel_reden: o.reden ?? null,
        geaccordeerd: false,
        bron_document_id: bronSoort === "document" ? (bronId ?? null) : null,
      })
      .select("id")
      .single();
    if (!error && data) {
      naamNaarId.set(nrm, data.id);
      if (o.tijdelijk_id) idMap.set(o.tijdelijk_id, data.id);
      nieuwAantal++;
    }
  }

  // 2. Koppelingen inserten; refs vertalen (tijdelijk_id -> uuid, anders bestaande uuid).
  const verbandRijen = [];
  for (const k of resultaat.koppelingen ?? []) {
    const bron_id = idMap.get(k.bron_ref) ?? k.bron_ref;
    const doel_id = idMap.get(k.doel_ref) ?? k.doel_ref;
    if (!isUuid(bron_id) || !isUuid(doel_id)) continue; // onbruikbare verwijzing overslaan
    verbandRijen.push({
      landgoed_id: landgoedId,
      bron_type: k.bron_type,
      bron_id,
      doel_type: k.doel_type,
      doel_id,
      rol: k.rol ?? null,
      status: "voorgesteld",
      voorstel_reden: k.reden ?? null,
      aangemaakt_door: gebruikerId ?? null,
    });
  }
  if (verbandRijen.length) {
    // onConflict op de unique-constraint: dubbele voorstellen stil overslaan.
    await supabase
      .from("verband")
      .upsert(verbandRijen, {
        onConflict: "bron_type,bron_id,doel_type,doel_id,rol",
        ignoreDuplicates: true,
      });
  }

  const telling = {
    objecten: nieuwAantal,
    koppelingen: verbandRijen.length,
  };

  // 3. Logboek.
  await supabase.from("extractie_run").insert({
    landgoed_id: landgoedId,
    bron_soort: bronSoort,
    bron_id: bronId ?? null,
    model: opts.model,
    aantal_objecten: telling.objecten,
    aantal_koppelingen: telling.koppelingen,
    aangemaakt_door: gebruikerId ?? null,
  });

  return telling;
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

// ── Datastroom B: lopende subsidies uit eigen documenten (§4a) ──
// Leest een onboarding-PDF en stelt de AL LOPENDE subsidies voor. Draait onder
// RLS (ingelogd lid); schrijft per-landgoed subsidie-rijen (geen service-role).

export async function subsidieBron(
  supabase: Db,
  documentId: string,
): Promise<{ lijst: LopendeSubsidieVoorstel[] | null; fout?: string }> {
  const { data: doc } = await supabase
    .from("document")
    .select("id, titel, bestand_pad")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc?.bestand_pad) return { lijst: null, fout: "Document niet gevonden." };
  if (!doc.bestand_pad.toLowerCase().endsWith(".pdf")) {
    return { lijst: null, fout: "Alleen PDF-documenten kunnen nu gelezen worden." };
  }
  const { data: blob, error } = await supabase.storage
    .from("documenten")
    .download(doc.bestand_pad);
  if (error || !blob) return { lijst: null, fout: "Bestand niet te lezen." };

  const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
  const res = await extraheerLopendeSubsidies({
    pdf: { base64, mediaType: "application/pdf" },
  });
  return { lijst: res?.subsidies ?? null };
}

// Schrijft voorgestelde lopende subsidies weg als subsidie-rijen (soort='lopend',
// al_in_gebruik=true), gekoppeld aan een catalogus-regeling waar de naam matcht.
export async function persisteerLopendeSubsidies(
  supabase: Db,
  opts: {
    landgoedId: string;
    documentId: string;
    lijst: LopendeSubsidieVoorstel[];
  },
): Promise<{ aantal: number; gekoppeld: number }> {
  const { landgoedId, documentId, lijst } = opts;

  // Catalogus voor naam-matching (eenvoudige ilike-vergelijking).
  const { data: regelingen } = await supabase
    .from("regeling")
    .select("id, naam")
    .eq("geaccordeerd", true);
  const catalogus = (regelingen ?? []).map((r) => ({
    id: r.id,
    naam: normNaam(r.naam),
  }));

  let aantal = 0;
  let gekoppeld = 0;
  for (const s of lijst) {
    if (!s.naam?.trim()) continue;
    const nrm = normNaam(s.naam);
    const match = catalogus.find(
      (c) => c.naam.includes(nrm) || nrm.includes(c.naam),
    );
    const bedrag = s.bedrag ?? null;

    const { data: rij } = await supabase
      .from("subsidie")
      .upsert(
        match
          ? {
              landgoed_id: landgoedId,
              regeling_id: match.id,
              scope: "landgoed",
              soort: "lopend",
              al_in_gebruik: true,
              naam: s.naam.trim(),
              organisatie: s.organisatie ?? null,
              categorie: "subsidie",
              status: "lopend",
              bedrag_indicatie: bedrag,
              deadline: s.looptijd_tot ?? null,
              redenering: s.reden ?? null,
            }
          : {
              landgoed_id: landgoedId,
              scope: "landgoed",
              soort: "lopend",
              al_in_gebruik: true,
              naam: s.naam.trim(),
              organisatie: s.organisatie ?? null,
              categorie: "subsidie",
              status: "lopend",
              bedrag_indicatie: bedrag,
              deadline: s.looptijd_tot ?? null,
              redenering: s.reden ?? null,
            },
        match ? { onConflict: "landgoed_id,regeling_id" } : undefined,
      )
      .select("id")
      .maybeSingle();

    if (rij) {
      aantal++;
      if (match) gekoppeld++;
      // Koppel aan het bron-document via verband (bestaande koppellaag).
      await supabase.from("verband").upsert(
        {
          landgoed_id: landgoedId,
          bron_type: "subsidie",
          bron_id: rij.id,
          doel_type: "document",
          doel_id: documentId,
          rol: "blijkt_uit",
          status: "geaccordeerd",
        },
        {
          onConflict: "bron_type,bron_id,doel_type,doel_id,rol",
          ignoreDuplicates: true,
        },
      );
    }
  }
  return { aantal, gekoppeld };
}
