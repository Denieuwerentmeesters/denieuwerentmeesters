import { createClient } from "@/lib/supabase/server";
import Kaart from "@/components/Kaart";
import { plaatsObject } from "./acties";

export default async function KaartPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

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
        <header className="mb-5">
          <h1 className="text-[22px] font-bold">Kaart</h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
            Klik op de kaart om een object te plaatsen. Adres, gemeente en
            provincie worden automatisch opgezocht (PDOK). De percelen-laag komt
            hier later bovenop.
          </p>
        </header>

        <Kaart landgoedId={id} markers={markers} plaatsObject={plaatsObject} />
      </div>
    </div>
  );
}
