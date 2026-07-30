"use client";

import { useMemo } from "react";
import { useOpname } from "@/components/OpnameProvider";

export function AudioOpname({
  gesprekId,
  transcriptiesBeschikbaar,
}: {
  gesprekId: string;
  transcriptiesBeschikbaar: boolean;
}) {
  // De recorder zelf leeft in de layout (OpnameProvider) zodat de opname doorloopt
  // bij navigatie; hier tonen we alleen de knoppen en de status voor dít gesprek.
  const { status, seconden, voortgang, fout, start, stop, verwerkBestand, bezigMet, doel: lopendDoel } =
    useOpname();
  const doel = useMemo(() => ({ soort: "bestaand" as const, gesprekId }), [gesprekId]);
  const ditGesprek = lopendDoel?.soort === "bestaand" && lopendDoel.gesprekId === gesprekId;

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const actief = bezigMet(doel);
  const opnemend = actief && status === "opnemen";

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="label-up mb-2">Live opnemen</div>
        {opnemend ? (
          <div className="flex items-center gap-3">
            <span
              className="inline-block h-2.5 w-2.5 animate-pulse rounded-full"
              style={{ background: "var(--red)" }}
            />
            <span className="font-mono text-[14px]">{fmt(seconden)}</span>
            <button type="button" onClick={stop} className="btn btn-ghost btn-sm">
              ■ Stop en transcribeer
            </button>
          </div>
        ) : actief ? (
          <div className="text-[13px]" style={{ color: "var(--text-2)" }}>{voortgang}</div>
        ) : (
          <button
            type="button"
            onClick={() => start(doel)}
            className="btn btn-primary"
            disabled={!transcriptiesBeschikbaar}
          >
            ● Start opname
          </button>
        )}
        {!transcriptiesBeschikbaar && (
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-3)" }}>GROQ_API_KEY ontbreekt.</p>
        )}
        {opnemend && (
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-3)" }}>
            De opname loopt door als je naar een andere pagina gaat.
          </p>
        )}
      </div>

      <div>
        <div className="label-up mb-2">Of upload een audiobestand</div>
        <input
          type="file"
          accept=".m4a,.mp3,.mp4,.wav,.webm,.ogg,audio/*"
          className="input text-[13px]"
          disabled={!transcriptiesBeschikbaar || actief}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) verwerkBestand(f, doel); }}
        />
      </div>

      {actief && fout && <div className="text-[13px]" style={{ color: "var(--red)" }}>{fout}</div>}
      {status === "klaar" && ditGesprek && (
        <div className="rounded p-3 text-[12.5px]" style={{ background: "var(--bg-2)", color: "var(--text-2)" }}>
          Transcript opgeslagen ✓ — scroll omlaag voor de tekst.
        </div>
      )}
    </div>
  );
}
