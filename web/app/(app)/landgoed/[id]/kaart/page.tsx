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
  registreerBezit,
  verwijderBezit,
  deelPercelenIn,
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
    .select("id, naam, categorie, kenmerken, herkomst, aangemaakt_op")
    .eq("landgoed_id", id)
    .eq("geaccordeerd", true)
    .order("aangemaakt_op", { ascending: false });

  // Kort herkomst-label ("AI · 12 jul" / "handmatig · 30 jul") zodat altijd
  // zichtbaar is waar een object vandaan komt en wanneer het is ontstaan.
  const herkomstLabel = (herkomst: unknown, aangemaakt: unknown): string => {
    const d = aangemaakt ? new Date(String(aangemaakt)) : null;
    const datum =
      d && Number.isFinite(d.getTime())
        ? d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })
        : null;
    const bron = herkomst === "ai" ? "AI" : "handmatig";
    return datum ? `${bron} · ${datum}` : bron;
  };

  // Kadastrale registratie (stap 1): per beheerperceel de gekoppelde percelen,
  // met geometrie. De weergave leest hieruit; de kenmerken-json is terugval.
  const { data: kadData } = await supabase
    .from("beheerperceel_kadastraal")
    .select("stamobject_id, dekking, kadastraal_perceel(kadastrale_aanduiding, oppervlakte_m2, geom_3857)")
    .eq("landgoed_id", id);
  // Al het bezit (ook nog niet ingedeeld) + welke percelen al ingedeeld zijn.
  const [{ data: bezitData }, { data: koppelingData }] = await Promise.all([
    supabase
      .from("kadastraal_perceel")
      .select("id, kadastrale_aanduiding, oppervlakte_m2, geom_3857")
      .eq("landgoed_id", id)
      .order("kadastrale_aanduiding"),
    supabase
      .from("beheerperceel_kadastraal")
      .select("kadastraal_perceel_id")
      .eq("landgoed_id", id),
  ]);
  const ingedeeldIds = new Set((koppelingData ?? []).map((k) => k.kadastraal_perceel_id));
  const bezit = (bezitData ?? []).map((p) => ({
    id: p.id as string,
    aanduiding: p.kadastrale_aanduiding as string,
    oppervlakteHa: haTekst(p.oppervlakte_m2),
    geom: p.geom_3857 as unknown,
    ingedeeld: ingedeeldIds.has(p.id),
  }));

  const kadVan = new Map<string, { aanduiding: string; oppervlakteM2: number | null; geom: unknown; dekking: string }[]>();
  for (const rij of (kadData ?? []) as unknown as {
    stamobject_id: string;
    dekking: string;
    kadastraal_perceel: { kadastrale_aanduiding: string; oppervlakte_m2: number | null; geom_3857: unknown } | null;
  }[]) {
    if (!rij.kadastraal_perceel) continue;
    const lijst = kadVan.get(rij.stamobject_id) ?? [];
    lijst.push({
      aanduiding: rij.kadastraal_perceel.kadastrale_aanduiding,
      oppervlakteM2: rij.kadastraal_perceel.oppervlakte_m2 != null ? Number(rij.kadastraal_perceel.oppervlakte_m2) : null,
      geom: rij.kadastraal_perceel.geom_3857 ?? null,
      dekking: rij.dekking,
    });
    kadVan.set(rij.stamobject_id, lijst);
  }

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
    // Registratie is leidend: som-oppervlakte, aanduidingen en álle vormen.
    const kad = kadVan.get(o.id) ?? [];
    const kadM2 = kad.reduce((som, p) => som + (p.oppervlakteM2 ?? 0), 0);
    const kadGeoms = kad.map((p) => p.geom).filter((g) => g != null);
    const kadastraal = kad.length
      ? `kadastraal: ${kad
          .map((p) => p.aanduiding + (p.dekking === "gedeeltelijk" ? " (deels)" : ""))
          .join(", ")}`
      : null;
    return {
      id: o.id,
      naam: o.naam,
      categorie: o.categorie as string,
      lat: Number(k.lat),
      lon: Number(k.lon),
      gebruik: k.gebruik ?? null,
      oppervlakteHa: kadM2 > 0 ? haTekst(kadM2) : haTekst(k.oppervlakte_m2),
      oppervlakteM2: k.oppervlakte_m2 != null ? String(k.oppervlakte_m2) : null,
      pandstatus: k.pandstatus != null ? String(k.pandstatus) : null,
      bouwjaar: k.bouwjaar != null ? String(k.bouwjaar) : null,
      adres: k.adres != null ? String(k.adres) : null,
      geom: k.geom_3857 ?? null,
      geoms: kadGeoms.length ? kadGeoms : k.geom_3857 != null ? [k.geom_3857] : [],
      kadastraal,
      herkomstLabel: herkomstLabel(o.herkomst, o.aangemaakt_op),
    };
  });

  const geplaatst = objecten.filter(
    (m) =>
      (Number.isFinite(m.lat) && Number.isFinite(m.lon)) || m.geoms.length > 0,
  );

  // Alle stamgegevens (ook zonder geo, bv. AI-objecten) voor de koppel-dropdown.
  const koppelbaar = (data ?? []).map((o) => ({
    id: o.id,
    naam: o.naam,
    categorie: o.categorie as string,
  }));

  // Totalen: som van de gronden (percelen) + aantallen.
  const PERCEEL_CATS = new Set(["pachtperceel"]);
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
          bezit={bezit}
          registreerBezit={registreerBezit}
          verwijderBezit={verwijderBezit}
          deelPercelenIn={deelPercelenIn}
        />
      </div>
    </div>
  );
}
