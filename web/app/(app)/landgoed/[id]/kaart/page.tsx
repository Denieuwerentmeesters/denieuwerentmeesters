import { createClient } from "@/lib/supabase/server";
import Kaart from "@/components/Kaart";
import {
  setBasisLocatie,
  plaatsOpKaart,
  lookupPerceel,
  lookupGebouw,
  verwijderObject,
  wisBasis,
  controleerGebiedsligging,
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
      geom_3857?: unknown;
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
      geom: k.geom_3857 ?? null,
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

  // Totalen: som van de gronden (percelen) + aantallen.
  const PERCEEL_CATS = new Set(["pachtperceel", "perceel"]);
  const GEBOUW_CATS = new Set(["gebouw", "woning", "opstal"]);
  let perceelM2 = 0;
  let aantalPercelen = 0;
  let aantalGebouwen = 0;
  for (const o of data ?? []) {
    const k = (o.kenmerken ?? {}) as { oppervlakte_m2?: unknown };
    if (PERCEEL_CATS.has(o.categorie)) {
      aantalPercelen++;
      const m2 = Number(k.oppervlakte_m2);
      if (Number.isFinite(m2)) perceelM2 += m2;
    } else if (GEBOUW_CATS.has(o.categorie)) {
      aantalGebouwen++;
    }
  }
  const totaalHa = (perceelM2 / 10000).toLocaleString("nl-NL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

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

        {/* Landgoed-totaal */}
        <div className="card mb-5 flex flex-wrap gap-8 p-4">
          <div>
            <div className="text-[22px] font-bold">{totaalHa} ha</div>
            <div className="text-[12px]" style={{ color: "var(--text-2)" }}>
              grond (som percelen)
            </div>
          </div>
          <div>
            <div className="text-[22px] font-bold">{aantalPercelen}</div>
            <div className="text-[12px]" style={{ color: "var(--text-2)" }}>
              percelen
            </div>
          </div>
          <div>
            <div className="text-[22px] font-bold">{aantalGebouwen}</div>
            <div className="text-[12px]" style={{ color: "var(--text-2)" }}>
              gebouwen
            </div>
          </div>
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
          lat={landgoed?.lat ?? null}
          lon={landgoed?.lon ?? null}
          setBasisLocatie={setBasisLocatie}
          plaatsOpKaart={plaatsOpKaart}
          lookupPerceel={lookupPerceel}
          lookupGebouw={lookupGebouw}
          verwijderObject={verwijderObject}
          controleerGebiedsligging={controleerGebiedsligging}
        />
      </div>
    </div>
  );
}
