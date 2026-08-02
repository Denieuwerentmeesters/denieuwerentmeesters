import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { uitloggen } from "../../actions";
import LandgoedNav, { type NavItem } from "@/components/LandgoedNav";
import MobileNav from "@/components/MobileNav";
import { OpnameProvider } from "@/components/OpnameProvider";

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

  const items: NavItem[] = [
    // ── Menu ──
    { href: `/landgoed/${id}/profiel`,   label: "Profiel en Stamgegevens", icon: "profiel",    group: "Menu" },
    { href: `/landgoed/${id}/overzicht`, label: "Overzicht (agenda en taken)", icon: "overzicht", group: "Menu",
      badge: openTaken ?? undefined, badgeKleur: (openTaken ?? 0) > 0 ? "oranje" : "grijs" },
    // "Kaart" = de kijk-pagina; invoeren gebeurt op /kaart/invoer (bereikbaar
    // via "Pas de kaart aan" en via het profiel).
    { href: `/landgoed/${id}/kaart`,     label: "Kaart",      icon: "kaart",       group: "Menu" },
    // ── Communicatie ──
    { href: `/landgoed/${id}/inbox`,     label: "Inbox",      icon: "inbox",       group: "Communicatie",
      badge: inboxConcept ?? undefined, badgeKleur: (inboxConcept ?? 0) > 0 ? "rood" : "grijs" },
    { href: `/landgoed/${id}/documenten`, label: "Documenten", icon: "documenten", group: "Communicatie" },
    { href: `/landgoed/${id}/contacten`, label: "Contacten",  icon: "contacten",   group: "Communicatie" },
    { href: `/landgoed/${id}/vergaderingen`, label: "Vergaderingen/opnames", icon: "vergaderingen", group: "Communicatie" },
    // ── Beheer ──
    { href: `/landgoed/${id}/financieel`, label: "Financieel", icon: "financieel", group: "Beheer" },
    { href: `/landgoed/${id}/contracten`, label: "Contracten", icon: "contracten", group: "Beheer" },
    // ── Radar ──
    { href: `/landgoed/${id}/subsidies`, label: "Subsidieradar",  icon: "subsidies", group: "Radar" },
    { href: `/landgoed/${id}/omgeving`,  label: "Omgevingsradar", icon: "omgeving",  group: "Radar" },
  ];

  return (
    // OpnameProvider staat in de layout (niet in een pagina), zodat een lopende opname
    // doorloopt als je binnen dit landgoed naar een andere pagina navigeert.
    <OpnameProvider landgoedId={id}>
    <div className="flex h-screen overflow-hidden">
      {/* Mobiel: sticky burger-menu (verborgen op desktop) */}
      <div className="md:hidden">
        <MobileNav
          items={items}
          landgoedNaam={landgoed.naam}
          landgoedId={id}
          userEmail={user.email ?? "Gebruiker"}
          initialen={initialen}
          uitloggenAction={uitloggen}
        />
      </div>

      {/* Desktop: vaste zijbalk (verborgen op mobiel) */}
      <aside
        className="hidden md:flex w-[240px] shrink-0 flex-col overflow-y-auto bg-white"
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

      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">{children}</main>
    </div>
    </OpnameProvider>
  );
}
