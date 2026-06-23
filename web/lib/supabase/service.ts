import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client: ALLEEN serverkant, omzeilt RLS. Uitsluitend voor
// ingestie naar de nationaal/provinciaal-catalogus (regeling + §7-lagen +
// bron/run/snapshot), waar geen ingelogde admin-sessie is.
//
// Nooit naar de browser. Zonder SUPABASE_SERVICE_ROLE_KEY blijft de rest van
// de app werken; alleen de import-/verrijk-routes geven dan een nette 503.

export function serviceBeschikbaar(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export function createServiceClient() {
  if (!serviceBeschikbaar()) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY ontbreekt — vereist voor subsidie-ingestie.",
    );
  }
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
