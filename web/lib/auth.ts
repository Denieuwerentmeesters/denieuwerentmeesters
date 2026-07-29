import { createClient } from "@/lib/supabase/server";

// Huidige ingelogde gebruiker (of null). Vertrouwt op getUser (geverifieerd).
export async function getHuidigeGebruiker() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// Controleert of de ingelogde gebruiker lid is van het opgegeven landgoed.
// Gebruikt de security-definer RPC is_lid_van (evalueert op auth.uid()).
// Nodig als vangnet wanneer de service-client (die RLS omzeilt) op een
// door de client aangeleverd pad opereert.
export async function isLidVan(landgoed_id: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_lid_van", {
    doel_landgoed: landgoed_id,
  });
  if (error) return false;
  return data === true;
}

// Profielregel van de ingelogde gebruiker.
export async function getProfiel() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiel")
    .select("id, naam, email")
    .maybeSingle();
  return data;
}
