"use server";

import { createClient } from "@/lib/supabase/server";
import { mailBeschikbaar, verstuurMail, bevestigingAanMelder } from "@/lib/mail";

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

  const getal = (k: string) => {
    const v = String(fd.get(k) ?? "").trim();
    if (v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const supabase = await createClient();
  const { error } = await supabase.rpc("meld_werkorder_publiek", {
    p_token: token,
    p_titel: titel,
    p_omschrijving: String(fd.get("omschrijving") ?? ""),
    p_melder_naam: String(fd.get("melder_naam") ?? ""),
    p_melder_email: String(fd.get("melder_email") ?? ""),
    p_locatie: String(fd.get("locatie_omschrijving") ?? ""),
    p_lat: getal("lat"),
    p_lon: getal("lon"),
  });

  if (error) return { ok: false, fout: "Melding versturen is niet gelukt. Probeer het opnieuw." };

  // Ontvangstbevestiging (hfst 6, moment 1). Fire-and-forget: de melding is
  // binnen, en dat is wat telt — een mailfout mag dat niet ongedaan lijken maken.
  const melderEmail = String(fd.get("melder_email") ?? "").trim();
  if (melderEmail && mailBeschikbaar()) {
    const { data: landgoedNaam } = await supabase.rpc("landgoed_naam_voor_meldtoken", {
      p_token: token,
    });
    await verstuurMail({
      aan: melderEmail,
      ...bevestigingAanMelder(titel, landgoedNaam ?? "het landgoed"),
    });
  }

  return { ok: true };
}
