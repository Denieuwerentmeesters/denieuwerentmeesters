"use client";

import { useState } from "react";

export function ToevoegenToggle({
  label,
  children,
  stijl = "knop",
}: {
  label: string;
  children: React.ReactNode;
  // "tekst" = bescheiden tekstlink i.p.v. primaire knop, voor secundaire
  // routes (bv. handmatig een contract invoeren naast de AI-upload).
  stijl?: "knop" | "tekst";
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-5">
      {!open && stijl === "knop" && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setOpen(true)}
        >
          + {label}
        </button>
      )}
      {!open && stijl === "tekst" && (
        <button
          type="button"
          className="text-[12.5px] underline"
          style={{ color: "var(--text-2)" }}
          onClick={() => setOpen(true)}
        >
          + {label}
        </button>
      )}
      {open && (
        // Sluit na een succesvolle submit: submit-events van het formulier in
        // children bubbelen hier naartoe. Faalt de browservalidatie (leeg
        // verplicht veld), dan komt het event niet — het formulier blijft dan
        // open staan, zoals bedoeld. Zonder dit bleef het formulier open na
        // toevoegen en zag je bij terugkeer via het menu nóg steeds het
        // formulier in plaats van het overzicht.
        <div onSubmit={() => setOpen(false)}>
          <div className="card p-4 md:p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[13px] font-semibold">{label}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setOpen(false)}
              >
                Annuleren
              </button>
            </div>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
