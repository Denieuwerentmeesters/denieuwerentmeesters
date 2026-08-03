"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "./LandgoedNav";
import { Icon } from "./LandgoedNav";

type Props = {
  items: NavItem[];
  landgoedNaam: string;
  landgoedId: string;
  userEmail: string;
  initialen: string;
  uitloggenAction: () => Promise<void>;
};

export default function MobileNav({
  items,
  landgoedNaam,
  landgoedId,
  userEmail,
  initialen,
  uitloggenAction,
}: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Groepeer items (zelfde logica als LandgoedNav)
  const groepen: { label: string | null; items: NavItem[] }[] = [];
  for (const item of items) {
    const groep = item.group ?? null;
    const laatste = groepen[groepen.length - 1];
    if (!laatste || laatste.label !== groep) {
      groepen.push({ label: groep, items: [item] });
    } else {
      laatste.items.push(item);
    }
  }

  return (
    <>
      {/* Sticky top-bar */}
      <header
        className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center justify-between px-4 bg-white"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <Link
          href={`/landgoed/${landgoedId}/overzicht`}
          className="flex items-center gap-2.5 min-w-0"
        >
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]"
            style={{ background: "var(--primary)" }}
          >
            <span className="text-sm font-bold text-white">R</span>
          </div>
          <span className="truncate text-[15px] font-bold leading-tight">
            {landgoedNaam}
          </span>
        </Link>

        <button
          onClick={() => setOpen(true)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] transition-colors"
          style={{ color: "var(--text)" }}
          aria-label="Menu openen"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </header>

      {/* Drawer overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          {/* Drawer header */}
          <div
            className="flex h-14 shrink-0 items-center justify-between px-4"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <Link
              href="/landgoederen"
              className="flex items-center gap-2.5 min-w-0"
              onClick={() => setOpen(false)}
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]"
                style={{ background: "var(--primary)" }}
              >
                <span className="text-sm font-bold text-white">R</span>
              </div>
              <div className="min-w-0">
                <div className="truncate text-[15px] font-bold leading-tight">
                  {landgoedNaam}
                </div>
                <div className="text-[11px]" style={{ color: "var(--text-2)" }}>
                  ← Alle landgoederen
                </div>
              </div>
            </Link>

            <button
              onClick={() => setOpen(false)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px]"
              style={{ color: "var(--text)" }}
              aria-label="Menu sluiten"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Nav items */}
          <nav className="flex-1 overflow-y-auto px-3 py-3">
            {groepen.map((groep, gi) => (
              <div key={gi} className={gi > 0 ? "mt-4" : ""}>
                {groep.label && (
                  <div
                    className="px-2.5 pb-1 pt-0.5 text-[10.5px] font-semibold uppercase tracking-widest"
                    style={{ color: "var(--text-3)" }}
                  >
                    {groep.label}
                  </div>
                )}
                {groep.items.map((item) => {
                  const actief =
                    pathname === item.href ||
                    (!item.exact && pathname.startsWith(item.href + "/"));
                  const badgeKleur = item.badgeKleur ?? "grijs";
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="mb-0.5 flex items-center gap-2.5 rounded-[9px] px-2.5 py-[11px] text-[14px] font-medium transition-colors"
                      style={
                        actief
                          ? { background: "var(--primary)", color: "#fff" }
                          : { color: "var(--text-2)" }
                      }
                    >
                      {item.icon && <Icon naam={item.icon} actief={actief} />}
                      <span className="flex-1 leading-tight">{item.label}</span>
                      {item.badge ? (
                        <span
                          className="rounded-full px-[7px] py-px text-[11px] font-semibold"
                          style={
                            actief
                              ? { background: "rgba(255,255,255,.25)", color: "#fff" }
                              : badgeKleur === "rood"
                                ? { background: "#fee2e2", color: "#dc2626" }
                                : badgeKleur === "oranje"
                                  ? { background: "#fef3c7", color: "#d97706" }
                                  : { background: "var(--border)", color: "var(--text-2)" }
                          }
                        >
                          {item.badge}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Gebruiker + uitloggen */}
          <div className="shrink-0 p-4" style={{ borderTop: "1px solid var(--border)" }}>
            <div
              className="mb-2 flex items-center gap-2.5 rounded-[10px] p-2.5"
              style={{ background: "var(--bg)" }}
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
                style={{ background: "var(--primary)" }}
              >
                {initialen}
              </div>
              <div
                className="truncate text-[12.5px] font-semibold"
                style={{ color: "var(--text)" }}
              >
                {userEmail}
              </div>
            </div>
            <form action={uitloggenAction}>
              <button type="submit" className="btn btn-ghost w-full">
                Uitloggen
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
