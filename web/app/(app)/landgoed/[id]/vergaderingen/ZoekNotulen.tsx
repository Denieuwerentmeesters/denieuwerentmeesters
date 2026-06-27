"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useRef, useState, useEffect } from "react";

export function ZoekNotulen() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [open, setOpen] = useState(false);
  const [modus, setModus] = useState<"titel" | "datum">("titel");
  const [waarde, setWaarde] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  // Herstel zoekveld vanuit URL
  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    const m = searchParams.get("m") as "titel" | "datum" | null;
    if (q) { setWaarde(q); setModus(m ?? "titel"); setOpen(true); }
  }, []);

  // Sluit panel bij klik buiten
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function zoek(nieuwWaarde?: string) {
    const v = nieuwWaarde ?? waarde;
    const params = new URLSearchParams(searchParams.toString());
    if (v.trim()) {
      params.set("q", v.trim());
      params.set("m", modus);
    } else {
      params.delete("q");
      params.delete("m");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function wis() {
    setWaarde("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    params.delete("m");
    router.push(`${pathname}?${params.toString()}`);
  }

  const actief = Boolean(searchParams.get("q"));

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`btn btn-sm ${actief ? "btn-primary" : "btn-ghost"}`}
      >
        {actief ? `🔍 Zoekresultaten` : "Zoek notulen"}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 z-50 rounded-lg shadow-lg p-4 flex flex-col gap-3"
          style={{ background: "var(--bg-1)", border: "1px solid var(--border)", minWidth: 300 }}
        >
          {/* Modus-tabs */}
          <div className="flex gap-1">
            {(["titel", "datum"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setModus(m); setWaarde(""); }}
                className={`btn btn-sm ${modus === m ? "btn-primary" : "btn-ghost"}`}
              >
                {m === "titel" ? "Op titel" : "Op datum"}
              </button>
            ))}
          </div>

          {/* Invoerveld */}
          {modus === "titel" ? (
            <input
              autoFocus
              className="input w-full"
              placeholder="Zoek op titel…"
              value={waarde}
              onChange={(e) => setWaarde(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") zoek(); }}
            />
          ) : (
            <input
              autoFocus
              type="date"
              className="input w-full"
              value={waarde}
              onChange={(e) => { setWaarde(e.target.value); zoek(e.target.value); }}
            />
          )}

          <div className="flex gap-2">
            {modus === "titel" && (
              <button type="button" onClick={() => zoek()} className="btn btn-primary btn-sm">Zoeken</button>
            )}
            {actief && (
              <button type="button" onClick={wis} className="btn btn-ghost btn-sm">Wis filter</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
