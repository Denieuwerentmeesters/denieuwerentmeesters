"use client";

import { useState } from "react";

export function KopieerKnop({ tekst }: { tekst: string }) {
  const [gekopieerd, setGekopieerd] = useState(false);

  async function kopieer() {
    await navigator.clipboard.writeText(tekst);
    setGekopieerd(true);
    setTimeout(() => setGekopieerd(false), 2000);
  }

  return (
    <button type="button" onClick={kopieer} className="btn btn-ghost btn-sm">
      {gekopieerd ? "✓ Gekopieerd" : "Kopieer tekst"}
    </button>
  );
}
