"use client"; // Error-boundaries moeten client components zijn.

import { useEffect } from "react";

// Vangt onverwachte fouten binnen de ingelogde schermen op — met name database-
// fouten die nu via de datalaag (lib/db.ts `moet`) worden gegooid i.p.v. stil
// genegeerd. Zo ziet de gebruiker dat er iets misging in plaats van een
// "geslaagde" redirect naar een ongewijzigd scherm.
export default function Fout({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[app] onafgevangen fout:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg px-6 py-16 text-center">
      <div
        className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-4 text-[22px]"
        style={{ background: "var(--bg-2)", color: "var(--red)" }}
      >
        !
      </div>
      <h1 className="text-[18px] font-semibold mb-2" style={{ color: "var(--text-1)" }}>
        Er ging iets mis
      </h1>
      <p className="text-[13.5px] mb-1" style={{ color: "var(--text-2)" }}>
        De actie is niet uitgevoerd. Er is niets half opgeslagen — probeer het opnieuw.
      </p>
      {error.message && (
        <p className="text-[12px] mb-5 font-mono break-words" style={{ color: "var(--text-3)" }}>
          {error.message}
        </p>
      )}
      <button type="button" onClick={() => unstable_retry()} className="btn btn-primary">
        Opnieuw proberen
      </button>
    </div>
  );
}
