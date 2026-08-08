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
        className="flex items-center justify-between gap-3 bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          Kaart
        </div>
        {/* Eén kaartafdeling, twee standen: beheer (kleur = gebruik) en
            contracten (kleur = soort, rand = aflooptermijn). */}
        <div className="flex gap-2">
          <span className="btn btn-primary btn-sm">Beheer</span>
          <Link
            href={`/landgoed/${id}/contracten/kaart`}
            className="btn btn-ghost btn-sm"
          >
            Contracten
          </Link>
        </div>
      </div>

      <div className="p-7">
        {/* Basislocatie-banner — zelfde kop als de invoerpagina. */}
        {(landgoed?.adres || landgoed?.naam) && (
          <div
            className="card mb-5 flex items-center gap-3 p-4"
            style={{ background: "var(--primary-light)" }}
          >
            <div className="flex-1 text-[14px]">
              <span className="font-bold">{landgoed?.naam}</span>
              {landgoed?.adres ? `, ${landgoed.adres}` : ""}
              <span style={{ color: "var(--text-2)" }}>
                {landgoed?.gemeente ? ` · Gemeente ${landgoed.gemeente}` : ""}
                {landgoed?.provincie ? ` · ${landgoed.provincie}` : ""}
              </span>
            </div>
            <Link
              href={`/landgoed/${id}/kaart/invoer`}
              className="btn btn-primary btn-sm"
            >
              Pas de kaart aan
            </Link>
          </div>
        )}

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
              beheerpercelen
            </div>
          </div>
          <div>
            <div className="text-[22px] font-bold">{aantalGebouwen}</div>
            <div className="text-[12px]" style={{ color: "var(--text-2)" }}>
              gebouwen
            </div>
          </div>
        </div>

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
