"use client";

import { useState } from "react";

// Eén regel in het overzichtsblok bovenaan de melding: label, waarde en een
// knop "Pas aan" die het bijbehorende formulier openklapt. Zo staat alles wat
// vastligt bij elkaar in plaats van als losse kaarten onder de pagina, en zie
// je in één oogopslag wat er nog ontbreekt.
export function OverzichtRij({
  label,
  waarde,
  leeg = "—",
  extra,
  children,
}: {
  label: string;
  waarde: string | null;
  /** Wat er staat als de waarde nog niet is ingevuld. */
  leeg?: string;
  /** Kleine toevoeging achter de waarde, bv. een link naar het objectdossier. */
  extra?: React.ReactNode;
  /** Het formulier dat openklapt bij "Pas aan". */
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ingevuld = Boolean(waarde);

  return (
    <div className="py-2.5" style={{ borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-[130px] text-[12.5px]" style={{ color: "var(--text-2)" }}>
          {label}
        </span>
        <span className="flex-1 text-[13.5px]" style={{ color: ingevuld ? "var(--text)" : "var(--text-3)" }}>
          {ingevuld ? <strong>{waarde}</strong> : leeg}
          {ingevuld && extra ? <span className="ml-2">{extra}</span> : null}
        </span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)}>
          {open ? "Annuleren" : "Pas aan"}
        </button>
      </div>
      {/* Sluit na een succesvolle submit: submit-events uit het formulier in
          children bubbelen hierheen. Faalt de browservalidatie, dan komt het
          event niet en blijft het formulier open staan — zoals bedoeld.
          Zelfde gedrag als ToevoegenToggle. */}
      {open && (
        <div className="mt-3" onSubmit={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}
