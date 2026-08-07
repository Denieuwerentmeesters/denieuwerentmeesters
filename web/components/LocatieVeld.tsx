"use client";

import { useState } from "react";

// Locatie bij een melding: vrije tekst plus optioneel een GPS-punt van het
// toestel. Mobiel is dit het punt van de hele module — je staat bij het kapotte
// hek en wilt niet eerst het juiste object opzoeken.
//
// De coördinaten gaan mee als verborgen velden; het formulier werkt gewoon door
// als de gebruiker geen toestemming geeft of geen GPS heeft.
export function LocatieVeld({ verplichtLabel = true }: { verplichtLabel?: boolean }) {
  const [status, setStatus] = useState<"leeg" | "bezig" | "gevonden" | "mislukt">("leeg");
  const [coord, setCoord] = useState<{ lat: number; lon: number } | null>(null);

  function haalLocatie() {
    if (!navigator.geolocation) {
      setStatus("mislukt");
      return;
    }
    setStatus("bezig");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoord({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setStatus("gevonden");
      },
      () => setStatus("mislukt"),
      // Een melding op het terrein mag even duren; liever nauwkeurig dan snel.
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  return (
    <div className="flex-1 basis-full">
      {verplichtLabel && <label className="label-up mb-1 block">Locatie</label>}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input min-w-[200px] flex-1"
          name="locatie_omschrijving"
          placeholder="Bijv. achter de schuur, bij de derde paal"
        />
        <button type="button" className="btn btn-ghost btn-sm" onClick={haalLocatie}>
          {status === "bezig" ? "Bepalen…" : "Gebruik mijn locatie"}
        </button>
      </div>

      {coord && (
        <>
          <input type="hidden" name="lat" value={coord.lat} />
          <input type="hidden" name="lon" value={coord.lon} />
        </>
      )}

      {status === "gevonden" && coord && (
        <p className="mt-1 text-[12px]" style={{ color: "var(--text-2)" }}>
          Locatie vastgelegd ({coord.lat.toFixed(5)}, {coord.lon.toFixed(5)}).
        </p>
      )}
      {status === "mislukt" && (
        <p className="mt-1 text-[12px]" style={{ color: "var(--text-2)" }}>
          Locatie ophalen lukte niet. De omschrijving hierboven is genoeg.
        </p>
      )}
    </div>
  );
}
