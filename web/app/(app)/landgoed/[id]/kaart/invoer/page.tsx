import Kaart from "@/components/Kaart";
import { laadKaartData } from "../data";
import {
  setBasisLocatie,
  plaatsOpKaart,
  lookupPerceel,
  lookupGebouw,
  verwijderObject,
  wisBasis,
  controleerGebiedsligging,
  registreerBezit,
  verwijderBezit,
  deelPercelenIn,
  wijzigBeheerperceel,
  koppelGebouwAanPerceel,
  splitsPerceel,
  wisSplitsing,
  ontkoppelPerceel,
  zoekPercelenBinnenOmtrek,
  registreerBezitBinnenOmtrek,
} from "../acties";

// De invoerpagina: stamgegevens invoeren en wijzigen via de kaart.
// De kijk-variant (zonder invoer) staat op /kaart; de data komt voor beide
// uit dezelfde laadKaartData().
export default async function KaartInvoerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const {
    landgoed,
    basisIngesteld,
    totaalHa,
    aantalPercelen,
    aantalGebouwen,
    geplaatst,
    koppelbaar,
    bezit,
    gebiedsligging,
  } = await laadKaartData(id);

  return (
    <div className="flex flex-col">
      <div
        className="bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          Stamgegevens invoeren / wijzigen
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
          <h1 className="text-[22px] font-bold">Stamgegevens invoeren / wijzigen</h1>
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
          bezit={bezit}
          registreerBezit={registreerBezit}
          verwijderBezit={verwijderBezit}
          deelPercelenIn={deelPercelenIn}
          wijzigBeheerperceel={wijzigBeheerperceel}
          koppelGebouwAanPerceel={koppelGebouwAanPerceel}
          splitsPerceel={splitsPerceel}
          wisSplitsing={wisSplitsing}
          ontkoppelPerceel={ontkoppelPerceel}
          zoekPercelenBinnenOmtrek={zoekPercelenBinnenOmtrek}
          registreerBezitBinnenOmtrek={registreerBezitBinnenOmtrek}
          gebiedsligging={gebiedsligging}
        />
      </div>
    </div>
  );
}
