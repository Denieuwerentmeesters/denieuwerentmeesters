import { createClient } from "@/lib/supabase/server";
import Kaart from "@/components/Kaart";
import {
  setBasisLocatie,
  plaatsOpKaart,
  lookupPerceel,
  lookupGebouw,
  verwijderObject,
  wisBasis,
} from "./acties";

function haTekst(m2: unknown): string | null {
  const n = Number(m2);
  if (!Number.isFinite(n)) return null;
  return `${(n / 10000).toLocaleString("nl-NL", {
    maximumFractionDigits: 2,
  })} ha`;
}

export default async function KaartPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: landgoed } = await supabase
    .from("landgoed")
    .select("naam, adres, postcode, plaats, gemeente, provincie, lat, lon")
    .eq("id", id)
    .maybeSingle();

  const { data } = await supabase
    .from("stamobject")
    .select("id, naam, categorie, kenmerken")
    .eq("landgoed_id", id)
    .eq("geaccordeerd", true)
    .order("aangemaakt_op", { ascending: false });

  const objecten = (data ?? []).map((o) => {
    const k = (o.kenmerken ?? {}) as {
      lat?: number;
      lon?: number;
      gebruik?: string;
      oppervlakte_m2?: unknown;
      pandstatus?: unknown;
      bouwjaar?: unknown;
      adres?: unknown;
    };
    return {
      id: o.id,
      naam: o.naam,
      categorie: o.categorie as string,
      lat: Number(k.lat),
      lon: Number(k.lon),
      gebruik: k.gebruik ?? null,
      oppervlakteHa: haTekst(k.oppervlakte_m2),
      oppervlakteM2: k.oppervlakte_m2 != null ? String(k.oppervlakte_m2) : null,
      pandstatus: k.pandstatus != null ? String(k.pandstatus) : null,
      bouwjaar: k.bouwjaar != null ? String(k.bouwjaar) : null,
      adres: k.adres != null ? String(k.adres) : null,
    };
  });

  const geplaatst = objecten.filter(
    (m) => Number.isFinite(m.lat) && Number.isFinite(m.lon),
  );

  // Alle stamgegevens (ook zonder geo, bv. AI-objecten) voor de koppel-dropdown.
  const koppelbaar = (data ?? []).map((o) => ({
    id: o.id,
    naam: o.naam,
    categorie: o.categorie as string,
  }));

  const basisIngesteld = Boolean(
    landgoed?.adres || (landgoed?.lat && landgoed?.lon),
  );

  return (
    <div className="flex flex-col">
      <div
        className="bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          Kaart
        </div>
      </div>

      <div className="p-7">
        {/* Basislocatie-banner */}
        <div
          className="card mb-5 flex items-center gap-3 p-4"
          style={{
            background: basisIngesteld ? "var(--primary-light)" : "var(--bg)",
          }}
        >
          {basisIngesteld ? (
            <>
              <div className="flex-1 text-[14px]">
                <span className="font-bold">{landgoed?.naam}</span>
                {landgoed?.adres ? `, ${landgoed.adres}` : ""}
                <span style={{ color: "var(--text-2)" }}>
                  {landgoed?.gemeente ? ` · Gemeente ${landgoed.gemeente}` : ""}
                  {landgoed?.provincie ? ` · ${landgoed.provincie}` : ""}
                </span>
              </div>
              <form action={wisBasis}>
                <input type="hidden" name="landgoed_id" value={id} />
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: "var(--red)" }}
                >
                  Wis locatie
                </button>
              </form>
            </>
          ) : (
            <div className="text-[13px]" style={{ color: "var(--text-2)" }}>
              Nog geen basislocatie bepaald. Kies hieronder{" "}
              <span className="font-semibold">Basis</span> en klik op de
              hoofdlocatie van het landgoed.
            </div>
          )}
        </div>

        <header className="mb-4">
          <h1 className="text-[22px] font-bold">Kaart</h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
            Bepaal eerst de basislocatie van het landgoed. Klik daarna desgewenst
            percelen aan (PDOK Kadaster). Gebouwen volgen later.
          </p>
        </header>

        <Kaart
          landgoedId={id}
          objecten={geplaatst}
          koppelbaar={koppelbaar}
          basisIngesteld={basisIngesteld}
          setBasisLocatie={setBasisLocatie}
          plaatsOpKaart={plaatsOpKaart}
          lookupPerceel={lookupPerceel}
          lookupGebouw={lookupGebouw}
          verwijderObject={verwijderObject}
        />
      </div>
    </div>
  );
}
