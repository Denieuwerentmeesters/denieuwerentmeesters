"use client";

import { useState } from "react";
import SubmitKnop from "@/components/SubmitKnop";

// Bekijk/wijzig-patroon voor formulieren (wens Steven): de velden staan
// standaard op slot; pas na "Wijzigen" zijn ze aanpasbaar en verschijnt de
// opslaan-knop. Een AI-concept begint juist opengeklapt, met een eigen
// knoptekst ("Accepteren en opslaan").
// Let op: de velden (children) staan in een fieldset die buiten de
// wijzig-stand disabled is — verborgen inputs die altijd mee moeten,
// horen daar dus ook gewoon in (verstuurd wordt er alleen in wijzig-stand).
export default function WijzigbaarFormulier({
  action,
  beginOpen = false,
  opslaanLabel = "Opslaan",
  veldenKlasse,
  className,
  children,
}: {
  action: (fd: FormData) => Promise<void>;
  beginOpen?: boolean;
  opslaanLabel?: string;
  veldenKlasse?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(beginOpen);

  return (
    // Sluit optimistisch bij submit (zelfde patroon als ToevoegenToggle):
    // de pagina herlaadt de verse waarden na de server action.
    <form action={action} className={className} onSubmit={() => setOpen(false)}>
      <fieldset disabled={!open} className={veldenKlasse}>
        {children}
      </fieldset>
      <div className="mt-3 flex items-center gap-2">
        {open ? (
          <>
            <SubmitKnop className="btn btn-primary" pendingTekst="Opslaan…">
              {opslaanLabel}
            </SubmitKnop>
            {!beginOpen && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setOpen(false)}
              >
                Annuleren
              </button>
            )}
          </>
        ) : (
          <button type="button" className="btn" onClick={() => setOpen(true)}>
            Wijzigen
          </button>
        )}
      </div>
    </form>
  );
}
