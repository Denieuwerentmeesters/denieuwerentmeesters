"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Bewust NIET het gedeelde app/(app)/landgoed/[id]/actions.ts: deze acties
// werken zonder ingelogde sessie (magic link) en mogen nooit door de
// lidmaatschap-check van veiligeToewijzing lopen. De SECURITY DEFINER-functies
// uit migratie 0066 valideren het token en bepalen zelf welke werkorder en welk
// landgoed erbij horen — clientinvoer bepaalt dat nooit.

export async function klusStatusBijwerken(
  token: string,
  fd: FormData,
): Promise<{ ok: true } | { ok: false; fout: string }> {
  const status = String(fd.get("status") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("klus_status_bijwerken", {
    p_token: token,
    p_status: status,
  });
  if (error) return { ok: false, fout: "Bijwerken is niet gelukt. Probeer het opnieuw." };
  revalidatePath(`/klus/${token}`);
  return { ok: true };
}

export async function klusNieuwPuntMelden(
  token: string,
  fd: FormData,
): Promise<{ ok: true } | { ok: false; fout: string }> {
  const titel = String(fd.get("titel") ?? "").trim();
  if (!titel) return { ok: false, fout: "Vul in wat u wilt melden." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("klus_nieuw_punt_melden", {
    p_token: token,
    p_titel: titel,
    p_omschrijving: String(fd.get("omschrijving") ?? ""),
  });
  if (error) return { ok: false, fout: "Melden is niet gelukt. Probeer het opnieuw." };
  return { ok: true };
}
