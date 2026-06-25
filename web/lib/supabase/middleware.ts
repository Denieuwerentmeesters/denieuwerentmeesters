import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Ververst de Supabase-sessie bij elke request en beschermt de app-routes.
// Publieke paden: /login, /uitnodiging en de landingsroute "/".
const PUBLIEKE_PADEN = ["/login", "/uitnodiging", "/auth", "/api/extractie", "/api/subsidie"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // BELANGRIJK: niets tussen createServerClient en getUser uitvoeren —
  // anders kunnen gebruikers willekeurig uitgelogd raken.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pad = request.nextUrl.pathname;
  const isPubliek =
    pad === "/" || PUBLIEKE_PADEN.some((p) => pad.startsWith(p));

  if (!user && !isPubliek) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}
