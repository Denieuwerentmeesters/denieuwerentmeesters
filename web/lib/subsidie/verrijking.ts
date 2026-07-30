import type { SupabaseClient } from "@supabase/supabase-js";
import { verrijkRegeling } from "@/lib/ai";

// Verrijkt een catalogus-regeling: leest de bron-URL (paginatekst) en schrijft
// de drie §7-lagen (criteria/maatregelen/bewijs) + openstellingsperiode als
// VOORSTEL weg (herkomst='ai', geaccordeerd=false). Pas na accordering matchbaar.
//
// Dit is óók het AI-extractiepad voor provinciale (Zeeland-)regelingen: de
// connector zet alleen de catalogusrij neer; de §7-lagen komen hier uit de pagina.

type Db = SupabaseClient;

// Toegestane waarden van regeling_criterium.fase (migratie 0030).
const FASEN = ["vooraf", "bij_aanvraag", "na_toekenning"];

// Grof HTML -> platte tekst. Genoeg voor server-gerenderde overheidspagina's.
function striptHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export async function haalPaginaTekst(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { accept: "text/html" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const html = await res.text();
    const tekst = striptHtml(html);
    return tekst.length > 80 ? tekst.slice(0, 24000) : null;
  } catch {
    return null;
  }
}

export type VerrijkUitkomst = {
  regeling_id: string;
  naam: string;
  ok: boolean;
  criteria: number;
  maatregelen: number;
  bewijs: number;
  fout?: string;
};

export async function verrijkRegelingRij(
  db: Db,
  regelingId: string,
): Promise<VerrijkUitkomst> {
  const { data: r } = await db
    .from("regeling")
    .select("id, naam, bron_url")
    .eq("id", regelingId)
    .maybeSingle();
  if (!r) {
    return {
      regeling_id: regelingId,
      naam: "?",
      ok: false,
      criteria: 0,
      maatregelen: 0,
      bewijs: 0,
      fout: "Regeling niet gevonden.",
    };
  }

  const tekst = r.bron_url ? await haalPaginaTekst(r.bron_url) : null;
  if (!tekst) {
    return {
      regeling_id: r.id,
      naam: r.naam,
      ok: false,
      criteria: 0,
      maatregelen: 0,
      bewijs: 0,
      fout: "Geen bruikbare brontekst (bron_url leeg of niet leesbaar).",
    };
  }

  const v = await verrijkRegeling({ naam: r.naam, tekst });
  if (!v) {
    return {
      regeling_id: r.id,
      naam: r.naam,
      ok: false,
      criteria: 0,
      maatregelen: 0,
      bewijs: 0,
      fout: "AI niet beschikbaar of gaf geen resultaat (ANTHROPIC_API_KEY?).",
    };
  }

  // Oude, nog niet geaccordeerde AI-voorstellen vervangen (idempotent her-verrijken).
  for (const tabel of [
    "regeling_criterium",
    "regeling_maatregel",
    "regeling_bewijs",
  ]) {
    await db
      .from(tabel)
      .delete()
      .eq("regeling_id", r.id)
      .eq("herkomst", "ai")
      .eq("geaccordeerd", false);
  }

  const criteria = (v.criteria ?? []).filter((c) => c.omschrijving?.trim());
  const maatregelen = (v.maatregelen ?? []).filter((m) => m.omschrijving?.trim());
  const bewijs = (v.bewijs ?? []).filter((b) => b.omschrijving?.trim());

  if (criteria.length)
    await db.from("regeling_criterium").insert(
      criteria.map((c) => ({
        regeling_id: r.id,
        omschrijving: c.omschrijving.trim(),
        veld: c.veld ?? null,
        operator: c.operator ?? null,
        waarde: c.waarde ?? null,
        verplicht: c.verplicht ?? true,
        // Onbekende of afwijkende fase => 'bij_aanvraag', niet 'vooraf'. Een fout de
        // andere kant op laat een procedurestap als harde eis in de matchmotor landen.
        fase: FASEN.includes(c.fase ?? "") ? c.fase : "bij_aanvraag",
        herkomst: "ai",
        geaccordeerd: false,
      })),
    );
  if (maatregelen.length)
    await db.from("regeling_maatregel").insert(
      maatregelen.map((m) => ({
        regeling_id: r.id,
        omschrijving: m.omschrijving.trim(),
        natuurbeheertype: m.natuurbeheertype ?? null,
        eenheid: m.eenheid ?? null,
        herkomst: "ai",
        geaccordeerd: false,
      })),
    );
  if (bewijs.length)
    await db.from("regeling_bewijs").insert(
      bewijs.map((b) => ({
        regeling_id: r.id,
        omschrijving: b.omschrijving.trim(),
        document_type: b.document_type ?? null,
        herkomst: "ai",
        geaccordeerd: false,
      })),
    );

  // Catalogusvelden bijwerken — alleen wat de verrijking opleverde.
  const upd: Record<string, unknown> = {
    verrijkt_op: new Date().toISOString(),
    bijgewerkt_op: new Date().toISOString(),
  };
  const zet = (k: string, w: unknown) => {
    if (w !== undefined && w !== null) upd[k] = w;
  };
  zet("organisatie", v.organisatie);
  zet("samenvatting", v.samenvatting);
  zet("themas", v.themas?.length ? v.themas : undefined);
  zet("trefwoorden", v.trefwoorden?.length ? v.trefwoorden : undefined);
  zet("doelgroepen", v.doelgroepen?.length ? v.doelgroepen : undefined);
  zet("openstelling_van", v.openstelling_van);
  zet("openstelling_tot", v.openstelling_tot);
  zet("budget_indicatie", v.budget_indicatie);
  if (typeof v.is_tijdelijk === "boolean") upd.is_tijdelijk = v.is_tijdelijk;
  await db.from("regeling").update(upd).eq("id", r.id);

  return {
    regeling_id: r.id,
    naam: r.naam,
    ok: true,
    criteria: criteria.length,
    maatregelen: maatregelen.length,
    bewijs: bewijs.length,
  };
}
