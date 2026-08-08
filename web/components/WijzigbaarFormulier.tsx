"use client";

import { useState } from "react";
import SubmitKnop from "@/components/SubmitKnop";

// Bekijk/wijzig-patroon voor formulieren (wens Steven): buiten de
// wijzig-stand een compacte gegevensweergave (geen uitgegrijsde
// invulvakjes) met een echte Wijzigen-knop; pas na een klik daarop
// verschijnen de velden. Een AI-concept begint juist opengeklapt, met een
// eigen knoptekst ("Accepteren en opslaan").
// De velden (children) worden buiten de wijzig-stand niet gerenderd —
// annuleren gooit onopgeslagen aanpassingen dus ook echt weg.
export default function WijzigbaarFormulier({
  action,
  weergave,
  beginOpen = false,
  opslaanLabel = "Opslaan",
  veldenKlasse,
  className,
  formId,
  children,
}: {
  action: (fd: FormData) => Promise<void>;
  weergave: React.ReactNode;
  beginOpen?: boolean;
  opslaanLabel?: string;
  veldenKlasse?: string;
  className?: string;
  // Optioneel id op het formulier, zodat een knop elders op de pagina
  // (form="…") ditzelfde formulier kan versturen.
  formId?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(beginOpen);

  if (!open) {
    return (
      <div className={className}>
        {weergave}
        <div className="mt-3">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setOpen(true)}
          >
            Wijzigen
          </button>
        </div>
      </div>
    );
  }

  return (
    // Sluit optimistisch bij submit (zelfde patroon als ToevoegenToggle):
    // de pagina herlaadt de verse waarden na de server action.
    <form id={formId} action={action} className={className} onSubmit={() => setOpen(false)}>
      <div className={veldenKlasse}>{children}</div>
      <div className="mt-3 flex items-center gap-2">
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
      </div>
    </form>
  );
}
