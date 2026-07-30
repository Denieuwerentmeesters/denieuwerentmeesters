import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Notulen ophalen: de tekst-outputs (notulen, besluitenlijst, samenvatting…) die de AI
 * per gesprek heeft gemaakt. Gedeeld door de vergaderingen-pagina en de documentenpagina,
 * zodat beide exact hetzelfde tonen zonder de tekst te dupliceren.
 */

export type NotulenFilter = {
  /** Zoekterm op de titel van het gesprek. */
  titel?: string;
  /** Datumbereik (yyyy-mm-dd), beide grenzen zijn optioneel en inclusief. */
  van?: string;
  tot?: string;
};

export type NotuleTekst = {
  id: string;
  soort: string;
  tekst: string;
};

export type NotulenGesprek = {
  id: string;
  titel: string;
  datum: string | null;
  status: string;
  notulen: NotuleTekst[];
};

type BewerkingRij = {
  id: string;
  output_tekst: string | null;
  prompt_sjabloon: { titel?: string; output_type?: string } | null;
};

export async function haalNotulen(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  landgoedId: string,
  filter: NotulenFilter = {},
): Promise<{ gesprekken: NotulenGesprek[]; fout: string | null }> {
  let query = supabase
    .from("gesprek")
    .select("id, titel, datum, status, gesprek_bewerking(id, output_tekst, prompt_sjabloon(titel, output_type))")
    .eq("landgoed_id", landgoedId)
    .order("datum", { ascending: false, nullsFirst: false });

  if (filter.titel?.trim()) query = query.ilike("titel", `%${filter.titel.trim()}%`);
  if (filter.van) query = query.gte("datum", filter.van);
  if (filter.tot) query = query.lte("datum", filter.tot);

  const { data, error } = await query;
  if (error) return { gesprekken: [], fout: error.message };

  const gesprekken = (data ?? []).map((g) => {
    const bewerkingen = (g.gesprek_bewerking ?? []) as unknown as BewerkingRij[];
    return {
      id: g.id as string,
      titel: g.titel as string,
      datum: (g.datum as string | null) ?? null,
      status: g.status as string,
      // 'taken' is geen tekst maar een set actievoorstellen — die hoort niet in de notulen.
      notulen: bewerkingen
        .filter((b) => b.prompt_sjabloon?.output_type !== "taken" && (b.output_tekst ?? "").trim())
        .map((b) => ({
          id: b.id,
          soort: b.prompt_sjabloon?.titel ?? "Notitie",
          tekst: b.output_tekst ?? "",
        })),
    };
  });

  return { gesprekken, fout: null };
}
