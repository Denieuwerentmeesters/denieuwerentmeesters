import { createClient } from "@/lib/supabase/server";

// Huidige ingelogde gebruiker (of null). Vertrouwt op getUser (geverifieerd).
export async function getHuidigeGebruiker() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
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
