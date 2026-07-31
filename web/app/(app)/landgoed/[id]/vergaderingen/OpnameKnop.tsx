"use client";

import { useOpname } from "@/components/OpnameProvider";

const DOEL = { soort: "nieuw" } as const;

export function OpnameKnop({ beschikbaar }: { beschikbaar: boolean }) {
  // De recorder zelf leeft in de layout (OpnameProvider), zodat de opname doorloopt
  // als je tijdens het opnemen naar een andere pagina navigeert.
  const { status, seconden, voortgang, fout, start, stop, verwerkBestand, bezigMet } = useOpname();

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const actief = bezigMet(DOEL);
  const opnemend = actief && status === "opnemen";

  if (!beschikbaar) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {opnemend ? (
          <>
            <span
              className="inline-block h-2.5 w-2.5 animate-pulse rounded-full"
              style={{ background: "var(--red)" }}
            />
            <span className="font-mono text-[14px]">{fmt(seconden)}</span>
            <button type="button" onClick={stop} className="btn btn-ghost btn-sm">
              ■ Stop en transcribeer
            </button>
          </>
        ) : actief ? (
          <span className="text-[13px]" style={{ color: "var(--text-2)" }}>{voortgang}</span>
        ) : (
          <button type="button" onClick={() => start(DOEL)} className="btn btn-primary">
            ● Start opname
          </button>
        )}
      </div>

      {!actief && (
        <label className="btn btn-ghost btn-sm cursor-pointer" style={{ display: "inline-flex", alignItems: "center" }}>
          ↑ Upload audiobestand (m4a, mp3, wav…)
          <input
            type="file"
            accept=".m4a,.mp3,.mp4,.wav,.webm,.ogg,audio/*"
            className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) verwerkBestand(f, DOEL); }}
          />
        </label>
      )}

      {actief && fout && <p className="text-[12.5px]" style={{ color: "var(--red)" }}>{fout}</p>}
      {opnemend && (
        <p className="text-[12px]" style={{ color: "var(--text-3)" }}>
          De opname loopt door als je naar een andere pagina gaat.
        </p>
      )}
    </div>
  );
}
