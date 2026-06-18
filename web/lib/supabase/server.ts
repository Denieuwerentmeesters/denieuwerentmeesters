import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Supabase-client voor de serverkant (server components, route handlers, actions).
// Vertrouwt op Row Level Security; filter niet handmatig op landgoed_id.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll vanuit een Server Component — wordt door de middleware
            // afgehandeld bij het verversen van de sessie. Veilig te negeren.
          }
        },
      },
    },
  );
}
