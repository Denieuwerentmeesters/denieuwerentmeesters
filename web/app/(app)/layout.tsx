import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Auth-vangnet voor alle app-routes (naast de proxy). Geen visuele shell —
// /landgoederen en /landgoed/[id] hebben hun eigen layout.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <div className="min-h-screen">{children}</div>;
}
