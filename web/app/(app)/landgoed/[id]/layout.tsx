import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { uitloggen } from "../../actions";
import LandgoedNav from "@/components/LandgoedNav";

export default async function LandgoedLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS: alleen lid -> anders niets terug -> terug naar overzicht.
  const { data: landgoed } = await supabase
    .from("landgoed")
    .select("id, naam")
    .eq("id", id)
    .maybeSingle();
  if (!landgoed) redirect("/landgoederen");

  // Open taken + inbox-voorstellen voor badges.
  const { count: openTaken } = await supabase
    .from("taak")
    .select("id", { count: "exact", head: true })
    .eq("landgoed_id", id)
    .eq("status", "open");

  const { count: inboxConcept } = await supabase
    .from("inbound_extractie")
    .select("id", { count: "exact", head: true })
    .eq("landgoed_id", id)
    .eq("status", "concept");

  const naam = user.email ?? "Gebruiker";
  const initialen = naam.slice(0, 2).toUpperCase();

  const items = [
    { href: `/landgoed/${id}/profiel`, label: "Profiel en Stamgegevens" },
    {
      href: `/landgoed/${id}/inbox`,
      label: "Inbox",
      badge: inboxConcept ?? undefined,
    },
    {
      href: `/landgoed/${id}/overzicht`,
      label: "Overzicht (agenda en taken)",
      badge: openTaken ?? undefined,
    },
    { href: `/landgoed/${id}/kaart`, label: "Kaart" },
    { href: `/landgoed/${id}/documenten`, label: "Documenten" },
    { href: `/landgoed/${id}/financieel`, label: "Financieel" },
    { href: `/landgoed/${id}/contacten`, label: "Contacten" },
    { href: `/landgoed/${id}/contracten`, label: "Contracten" },
    { href: `/landgoed/${id}/subsidies`, label: "Subsidieradar" },
    { href: `/landgoed/${id}/omgeving`, label: "Omgevingsradar" },
    { href: `/landgoed/${id}/vergaderingen`, label: "Vergaderingen" },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      <aside
        className="flex w-[240px] shrink-0 flex-col overflow-y-auto bg-white"
        style={{ borderRight: "1px solid var(--border)" }}
      >
        <Link
          href="/landgoederen"
          className="flex items-center gap-2.5 px-5 py-5"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div
            className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px]"
            style={{ background: "var(--primary)" }}
          >
            <span className="text-sm font-bold text-white">R</span>
          </div>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-bold leading-tight">
              {landgoed.naam}
            </div>
            <div className="text-[11px]" style={{ color: "var(--text-2)" }}>
              ← Alle landgoederen
            </div>
          </div>
        </Link>

        <LandgoedNav items={items} />

        <div className="p-4" style={{ borderTop: "1px solid var(--border)" }}>
          <div
            className="mb-2 flex items-center gap-2.5 rounded-[10px] p-2.5"
            style={{ background: "var(--bg)" }}
          >
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-bold text-white"
              style={{ background: "var(--primary)" }}
            >
              {initialen}
            </div>
            <div
              className="truncate text-[12.5px] font-semibold"
              style={{ color: "var(--text)" }}
            >
              {user.email}
            </div>
          </div>
          <form action={uitloggen}>
            <button type="submit" className="btn btn-ghost w-full">
              Uitloggen
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
