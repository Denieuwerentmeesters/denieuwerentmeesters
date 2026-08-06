"use client";

import { useState } from "react";

// De integrale beleidstekst is BEWIJSMATERIAAL, geen leesvoer. Standaard tonen
// zou de pagina laten verdrinken in tien pagina's fondsproza waar de gebruiker
// niets aan heeft; hem weglaten zou de onderbouwing onnavolgbaar maken. Vandaar
// een knop: dicht is de normale stand, open is de controlestand.
//
// Bewust géén <details>: de UI-conventie in dit platform is een knop met een
// duidelijk label, en de tekst binnenin moet zijn eigen scrollgebied hebben —
// anders duwt één beleidsplan de rest van de pagina buiten beeld.
export function Uitklap({
  label,
  labelOpen,
  children,
}: {
  label: string;
  labelOpen?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? (labelOpen ?? `Verberg ${label}`) : label}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}
