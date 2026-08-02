import Link from "next/link";
import KaartWeergave from "@/components/KaartWeergave";
import { laadKaartData } from "./data";

// De kijk-kaart (menu-item "Kaart"): het landgoed bekijken en verkennen.
// Invoeren en wijzigen gebeurt op /kaart/invoer ("Pas de kaart aan").
export default async function KaartPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const {
    landgoed,
    totaalHa,
    aantalPercelen,
    aantalGebouwen,
    geplaatst,
    bezit,
  } = await laadKaartData(id);

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
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-bold">
              Kaart{landgoed?.naam ? ` · ${landgoed.naam}` : ""}
            </h1>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
              {totaalHa} ha · {aantalPercelen} percelen · {aantalGebouwen}{" "}
              gebouwen
            </p>
          </div>
          <Link href={`/landgoed/${id}/kaart/invoer`} className="btn btn-primary btn-sm">
            Pas de kaart aan
          </Link>
        </header>

        <KaartWeergave
          landgoedId={id}
          objecten={geplaatst}
          bezit={bezit}
          lat={landgoed?.lat ?? null}
          lon={landgoed?.lon ?? null}
        />
      </div>
    </div>
  );
}
