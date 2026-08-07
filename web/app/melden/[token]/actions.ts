"use server";

import { createClient } from "@/lib/supabase/server";

// Bewust NIET het gedeelde app/(app)/landgoed/[id]/actions.ts: deze actie werkt
// zonder ingelogde sessie (meldlink zonder account) en mag nooit door een
// lidmaatschap-check lopen. Het token bepaalt zelf het landgoed — nooit
// clientinvoer vertrouwen voor de landgoed-koppeling. De SECURITY DEFINER-
// functie (migratie 0065) doet de eigenlijke validatie en insert.
export async function meldWerkorderPubliek(
  token: string,
  fd: FormData,
): Promise<{ ok: true } | { ok: false; fout: string }> {
  const titel = String(fd.get("titel") ?? "").trim();
  if (!titel) return { ok: false, fout: "Vul in wat er aan de hand is." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("meld_werkorder_publiek", {
    p_token: token,
    p_titel: titel,
    p_omschrijving: String(fd.get("omschrijving") ?? ""),
    p_melder_naam: String(fd.get("melder_naam") ?? ""),
    p_melder_email: String(fd.get("melder_email") ?? ""),
  });

  if (error) return { ok: false, fout: "Melding versturen is niet gelukt. Probeer het opnieuw." };
  return { ok: true };
}
