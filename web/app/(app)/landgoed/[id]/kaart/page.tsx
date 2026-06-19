import { createClient } from "@/lib/supabase/server";
import Kaart from "@/components/Kaart";
import { setBasisLocatie, plaatsPerceel, lookupPerceel } from "./acties";

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
    .select("id, naam, kenmerken")
    .eq("landgoed_id", id)
    .eq("geaccordeerd", true);

  const markers = (data ?? [])
    .map((o) => {
      const k = (o.kenmerken ?? {}) as { lat?: number; lon?: number };
      return { id: o.id, naam: o.naam, lat: Number(k.lat), lon: Number(k.lon) };
    })
    .filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lon));

  const basisIngesteld = Boolean(landgoed?.adres || (landgoed?.lat && landgoed?.lon));

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
          className="card mb-5 p-4"
          style={{
            background: basisIngesteld ? "var(--primary-light)" : "var(--bg)",
          }}
        >
          {basisIngesteld ? (
            <div className="text-[14px]">
              <span className="font-bold">{landgoed?.naam}</span>
              {landgoed?.adres ? `, ${landgoed.adres}` : ""}
              <span style={{ color: "var(--text-2)" }}>
                {landgoed?.gemeente ? ` · Gemeente ${landgoed.gemeente}` : ""}
                {landgoed?.provincie ? ` · ${landgoed.provincie}` : ""}
              </span>
            </div>
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
          markers={markers}
          basisIngesteld={basisIngesteld}
          setBasisLocatie={setBasisLocatie}
          plaatsPerceel={plaatsPerceel}
          lookupPerceel={lookupPerceel}
        />
      </div>
    </div>
  );
}
