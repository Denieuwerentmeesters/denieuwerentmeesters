import { createServiceClient } from "@/lib/supabase/service";
import { extraheerContactUitMail, ContactUitMailVoorstel } from "@/lib/ai";

export type ExtractieRunRow = {
  id: string;
  landgoed_id: string;
  brontype: string;
  bron_ref: string | null;
  vrije_instructie: string | null;
  concept: ContactUitMailVoorstel | null;
  status: "concept" | "bevestigd" | "afgewezen";
  bevestigd_door: string | null;
  bevestigd_op: string | null;
  resultaat_ref: string | null;
  aangemaakt_op: string;
};

// Laad de extractie_opzet-id voor contact_uit_mail (gecached in module-scope).
let _opzetId: string | null = null;
async function opzetId(): Promise<string> {
  if (_opzetId) return _opzetId;
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("extractie_opzet")
    .select("id")
    .eq("brontype", "contact_uit_mail")
    .single();
  if (error || !data) throw new Error("extractie_opzet voor contact_uit_mail niet gevonden");
  _opzetId = data.id as string;
  return _opzetId;
}

/**
 * Voert de volledige intake-flow uit voor één doorgestuurde mail:
 * 1. Laad opzet
 * 2. AI-extractie
 * 3. Sla intake_run op met status = concept
 * Geeft de aangemaakte run terug (of null bij AI-fout zonder key).
 */
export async function intakeMail(opts: {
  landgoed_id: string;
  mailTekst: string;
  bron_ref?: string | null;
  vrije_instructie?: string | null;
}): Promise<ExtractieRunRow | null> {
  const { landgoed_id, mailTekst, bron_ref, vrije_instructie } = opts;

  const oid = await opzetId();
  const concept = await extraheerContactUitMail(mailTekst, vrije_instructie);

  const sb = createServiceClient();
  const { data, error } = await sb
    .from("intake_run")
    .insert({
      landgoed_id,
      opzet_id: oid,
      brontype: "contact_uit_mail",
      bron_ref: bron_ref ?? null,
      vrije_instructie: vrije_instructie ?? null,
      concept: concept ?? null,
      status: "concept",
    })
    .select()
    .single();

  if (error) throw new Error(`intake_run opslaan mislukt: ${error.message}`);
  return data as ExtractieRunRow;
}

/**
 * Laad alle openstaande concept-runs voor een landgoed (status = concept).
 */
export async function laadConceptRuns(landgoed_id: string): Promise<ExtractieRunRow[]> {
  const sb = createServiceClient();
  const { data } = await sb
    .from("intake_run")
    .select("*")
    .eq("landgoed_id", landgoed_id)
    .eq("status", "concept")
    .order("aangemaakt_op", { ascending: false });
  return (data ?? []) as ExtractieRunRow[];
}
