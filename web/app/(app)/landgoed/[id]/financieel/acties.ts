"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { categoriseerTransacties } from "@/lib/ai";

function parseBedrag(s: string): number | null {
  let t = s.trim().replace(/\s|€/g, "");
  if (t === "") return null;
  if (t.includes(".") && t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (t.includes(",")) t = t.replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parseDatum(s: string): string | null {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

// Verwacht CSV (kop optioneel): datum ; bedrag ; omschrijving ; tegenpartij
// Scheidingsteken ; of , wordt automatisch herkend. Bedrag negatief = uitgave.
export async function importBankCsv(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const file = fd.get("bestand") as File | null;
  if (!file || file.size === 0) return;

  const tekst = await file.text();
  const regels = tekst.split(/\r?\n/).filter((r) => r.trim() !== "");
  if (regels.length === 0) return;

  const sep = (regels[0].match(/;/g)?.length ?? 0) >= (regels[0].match(/,/g)?.length ?? 0) ? ";" : ",";

  const supabase = await createClient();

  // Eén vaste bankimport-bron per landgoed.
  const { data: bestaand } = await supabase
    .from("financiele_bron")
    .select("id")
    .eq("landgoed_id", landgoed_id)
    .eq("type", "bank_import")
    .maybeSingle();
  let bronId = bestaand?.id as string | undefined;
  if (!bronId) {
    const { data: nieuw } = await supabase
      .from("financiele_bron")
      .insert({ landgoed_id, type: "bank_import", naam: "Bankimport" })
      .select("id")
      .single();
    bronId = nieuw?.id;
  }

  const rijen: {
    landgoed_id: string;
    bron_id: string;
    datum: string;
    bedrag: number;
    omschrijving: string;
    tegenpartij: string | null;
    extern_id: string;
  }[] = [];

  for (const regel of regels) {
    const cols = regel.split(sep).map((c) => c.replace(/^"|"$/g, "").trim());
    const datum = parseDatum(cols[0] ?? "");
    const bedrag = parseBedrag(cols[1] ?? "");
    if (datum === null || bedrag === null) continue; // kop of lege regel
    const omschrijving = cols[2] ?? "";
    const tegenpartij = cols[3] ?? null;
    rijen.push({
      landgoed_id,
      bron_id: bronId!,
      datum,
      bedrag,
      omschrijving,
      tegenpartij,
      extern_id: `${datum}|${bedrag}|${omschrijving}`.slice(0, 200),
    });
  }

  if (rijen.length > 0) {
    // Dedupe via unique(bron_id, extern_id).
    await supabase.from("transactie").upsert(rijen, {
      onConflict: "bron_id,extern_id",
      ignoreDuplicates: true,
    });
  }

  revalidatePath(`/landgoed/${landgoed_id}/financieel`);
}

export async function nieuweTransactie(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const datum = String(fd.get("datum") ?? "").trim();
  const bedrag = parseBedrag(String(fd.get("bedrag") ?? ""));
  if (!datum || bedrag === null) return;
  const supabase = await createClient();
  await supabase.from("transactie").insert({
    landgoed_id,
    datum,
    bedrag,
    omschrijving: String(fd.get("omschrijving") ?? "").trim() || null,
    categorie: String(fd.get("categorie") ?? "").trim() || null,
  });
  revalidatePath(`/landgoed/${landgoed_id}/financieel`);
}

// AI: categoriseer transacties zonder categorie (max 50 per keer).
export async function categoriseerNu(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const supabase = await createClient();
  const { data: ongecat } = await supabase
    .from("transactie")
    .select("id, omschrijving, bedrag")
    .eq("landgoed_id", landgoed_id)
    .is("categorie", null)
    .limit(50);
  if (!ongecat || ongecat.length === 0) return;

  const voorstel = await categoriseerTransacties(
    ongecat.map((t) => ({ omschrijving: t.omschrijving ?? "", bedrag: Number(t.bedrag) })),
  );
  if (!voorstel) return; // geen AI-key of fout

  for (const v of voorstel) {
    const t = ongecat[v.index];
    if (t && v.categorie) {
      await supabase.from("transactie").update({ categorie: v.categorie }).eq("id", t.id);
    }
  }
  revalidatePath(`/landgoed/${landgoed_id}/financieel`);
}
