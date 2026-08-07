"use client";

import { useState } from "react";

// De meldlink was een kaal pad ("/melden/<uuid>") zonder uitleg: onduidelijk
// wát het was en niet te delen, want zonder domein. Nu de volledige URL met een
// kopieerknop, achter een toggle zodat het de lijst niet in de weg zit.
export function MeldlinkKaart({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  const [gekopieerd, setGekopieerd] = useState(false);

  async function kopieer() {
    try {
      await navigator.clipboard.writeText(url);
      setGekopieerd(true);
      setTimeout(() => setGekopieerd(false), 2000);
    } catch {
      // Clipboard geweigerd (geen https of geen toestemming): de link staat
      // zichtbaar in beeld, dus handmatig kopiëren kan altijd nog.
    }
  }

  if (!open) {
    return (
      <div className="mb-5">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
          Meldlink voor huurders en bewoners
        </button>
      </div>
    );
  }

  return (
    <div className="card mb-5 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-semibold">Meldlink voor huurders en bewoners</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Sluiten
        </button>
      </div>
      <p className="mb-2 text-[12.5px]" style={{ color: "var(--text-2)" }}>
        Deel deze link met huurders, bewoners of anderen op het landgoed. Wie hem opent kan een
        melding doen <strong>zonder account</strong>. Die meldingen komen hier binnen met de status
        &quot;Gemeld&quot;, zodat u ze eerst beoordeelt.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="flex-1 break-all rounded-[6px] px-2 py-1.5 text-[12px]" style={{ background: "var(--bg)" }}>
          {url}
        </code>
        <button type="button" className="btn btn-ghost btn-sm" onClick={kopieer}>
          {gekopieerd ? "Gekopieerd" : "Kopieer"}
        </button>
      </div>
    </div>
  );
}
