"use client";

import { useOptimistic, startTransition, useState } from "react";
import { CATEGORIEEN, NOG_IN_TE_DELEN, categorieLabel } from "./categorieen";

// Werkvoorraad: alles wat de AI voorstelde maar de mens nog niet bevestigde.
// Zelfde vorm als VoorstelReview bij stamgegevens — één regel per voorstel, de
// reden eronder, en één klik om te bevestigen. Bewust optimistisch: de regel
// verdwijnt meteen, zodat een rij van tien stukken in tien klikken leeg is zonder
// dat je op de server hoeft te wachten.

type Voorstel = {
  id: string;
  titel: string | null;
  categorie: string;
  categorie_voorstel_reden: string | null;
  url: string | null;
};

export default function CategorieReview({
  voorstellen,
  landgoedId,
  accordeerCategorie,
}: {
  voorstellen: Voorstel[];
  landgoedId: string;
  accordeerCategorie: (fd: FormData) => Promise<void>;
}) {
  const [zichtbaar, verwijderRegel] = useOptimistic(
    voorstellen,
    (state: Voorstel[], id: string) => state.filter((v) => v.id !== id),
  );

  if (zichtbaar.length === 0) return null;

  return (
    <div className="card mb-5 p-4" style={{ borderColor: "var(--primary-mid)" }}>
      <div className="mb-1 text-[14px] font-semibold">
        Indeling bevestigen ({zichtbaar.length})
      </div>
      <p className="mb-3 text-[12px]" style={{ color: "var(--text-3)" }}>
        De AI stelde een categorie voor op basis van de inhoud. Tot je bevestigt telt
        het stuk mee onder Nog in te delen. Klopt het voorstel niet, kies dan zelf een
        categorie en bevestig.
      </p>
      <div className="flex flex-col gap-2">
        {zichtbaar.map((v) => (
          <Regel
            key={v.id}
            v={v}
            landgoedId={landgoedId}
            onBevestig={(categorie) => {
              const fd = new FormData();
              fd.set("landgoed_id", landgoedId);
              fd.set("id", v.id);
              fd.set("categorie", categorie);
              startTransition(async () => {
                verwijderRegel(v.id);
                await accordeerCategorie(fd);
              });
            }}
          />
        ))}
      </div>
    </div>
  );
}

function Regel({
  v,
  onBevestig,
}: {
  v: Voorstel;
  landgoedId: string;
  onBevestig: (categorie: string) => void;
}) {
  const [keuze, setKeuze] = useState(v.categorie);

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-[10px] p-3"
      style={{ background: "var(--bg)" }}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-semibold">
          {v.titel ?? "Naamloos document"}{" "}
          <span className="text-[11px] font-normal" style={{ color: "var(--text-3)" }}>
            voorstel: {categorieLabel(v.categorie)}
          </span>
        </div>
        {v.categorie_voorstel_reden ? (
          <div className="text-[12px]" style={{ color: "var(--text-2)" }}>
            {v.categorie_voorstel_reden}
          </div>
        ) : (
          <div className="text-[12px]" style={{ color: "var(--text-3)" }}>
            Geen categorie herkend — kies er zelf een.
          </div>
        )}
      </div>

      <select
        className="input"
        value={keuze}
        onChange={(e) => setKeuze(e.target.value)}
        aria-label="Categorie"
      >
        {CATEGORIEEN.filter(
          (c) => c.sleutel !== NOG_IN_TE_DELEN || v.categorie === NOG_IN_TE_DELEN,
        ).map((c) => (
          <option key={c.sleutel} value={c.sleutel}>
            {c.label}
          </option>
        ))}
      </select>

      {v.url && (
        <a href={v.url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
          Openen
        </a>
      )}
      <button
        className="btn btn-primary btn-sm"
        disabled={keuze === NOG_IN_TE_DELEN}
        onClick={() => onBevestig(keuze)}
      >
        Bevestig
      </button>
    </div>
  );
}
