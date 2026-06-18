"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; badge?: number };

export default function LandgoedNav({ items }: { items: Item[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 px-3 py-4">
      <div className="label-up px-2 pb-1.5 pt-2">Beheer</div>
      {items.map((item) => {
        const actief = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="mb-0.5 flex items-center gap-2.5 rounded-[9px] px-2.5 py-2.5 text-[13.5px] font-medium transition-colors"
            style={
              actief
                ? { background: "var(--primary)", color: "#fff" }
                : { color: "var(--text-2)" }
            }
          >
            <span>{item.label}</span>
            {item.badge ? (
              <span
                className="ml-auto rounded-full px-[7px] py-px text-[11px] font-semibold"
                style={
                  actief
                    ? { background: "rgba(255,255,255,.25)", color: "#fff" }
                    : { background: "var(--border)", color: "var(--text-2)" }
                }
              >
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
