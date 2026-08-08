"use client";

// De contractenkaart (wens Steven): waar gelden de contracten, in kleur per
// soort (pachtvorm, of het contracttype bij huur/erfpacht/beheer), en met
// de aflooptermijn als randkleur — oranje binnen de verlengtermijn, rood
// als verlopen. Zelfde kaarttaal en opzet als de kijk-kaart.
import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Map as LMap } from "leaflet";
import {
  PDOK_TILES,
  KADASTER_WMS,
  geomNaarLatlngs,
  maakKadastraleLaag,
} from "@/components/kaartDelen";
import { afloopTekst } from "@/lib/contracten/afloop";

export type ContractOpKaart = {
  id: string;
  titel: string;
  contractnummer: string | null;
  partij: string | null;
  soortKey: string;
  soortLabel: string;
  status: string | null;
  einddatum: string | null;
  bedrag: number | null;
  afloop: { dagen: number; oordeel: "verlopen" | "aandacht" | "rustig" } | null;
  vormen: { geom: unknown; label: string | null }[];
  punten: { lat: number; lon: number; label: string | null }[];
};

// Kleur per contractsoort — bewust andere tinten dan de gebruikskleuren
// van de beheerkaart, zodat de twee kaarten niet door elkaar lopen.
const SOORT_KLEUR: Record<string, string> = {
  reguliere_pacht: "#7c3aed",
  geliberaliseerde_pacht: "#0284c7",
  teeltpacht: "#d97706",
  natuurpacht: "#16a34a",
  overig: "#64748b",
  pacht: "#6d28d9",
  huur: "#db2777",
  erfpacht: "#0f766e",
  beheer: "#a16207",
};
const RAND_AANDACHT = "#f59e0b";
const RAND_VERLOPEN = "#dc2626";

function soortKleur(key: string): string {
  return SOORT_KLEUR[key] ?? "#64748b";
}

function euro(n: number | null) {
  if (n === null || n === undefined) return null;
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function ContractenKaart({
  landgoedId,
  contracten,
  bezit,
}: {
  landgoedId: string;
  contracten: ContractOpKaart[];
  // Alle kadastrale percelen van het landgoed — als aanvinkbare onderlaag,
  // zodat je ziet welke percelen wél en niet onder een contract vallen.
  bezit: { id: string; aanduiding: string; geom: unknown }[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LRef = useRef<any>(null);
  // Getekende lagen per contract, met hun basisstijl — voor de spotlight.
  const lagenRef = useRef<
    Map<
      string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { laag: any; basis: { color: string; weight: number; fillOpacity: number } }[]
    >
  >(new Map());
  const selectieRef = useRef<string | null>(null);
  // De kadastrale onderlaag (gedeelde bouwsteen met de beheerkaart).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kadLaagRef = useRef<any>(null);
  const werkLabelsBijRef = useRef<(() => void) | null>(null);

  const [selectie, setSelectie] = useState<string | null>(null);
  const [toonKadastraal, setToonKadastraal] = useState(false);

  const opKaart = contracten.filter((c) => c.vormen.length || c.punten.length);
  const nietOpKaart = contracten.filter(
    (c) => !c.vormen.length && !c.punten.length,
  );
  // Legenda: alleen soorten die hier echt voorkomen.
  const soorten = [...new Map(opKaart.map((c) => [c.soortKey, c.soortLabel]))];

  function randVoor(c: ContractOpKaart): { color: string; weight: number } {
    if (c.afloop?.oordeel === "verlopen")
      return { color: RAND_VERLOPEN, weight: 3.5 };
    if (c.afloop?.oordeel === "aandacht")
      return { color: RAND_AANDACHT, weight: 3.5 };
    return { color: soortKleur(c.soortKey), weight: 2 };
  }

  // Spotlight: één contract tegelijk — de rest dimt, de kaart zoomt erheen.
  function pasStijlenToe(sel: string | null) {
    for (const [id, lagen] of lagenRef.current) {
      for (const { laag, basis } of lagen) {
        if (!sel) laag.setStyle({ ...basis, opacity: 1 });
        else if (id === sel)
          laag.setStyle({ ...basis, weight: basis.weight + 1.5, fillOpacity: 0.5, opacity: 1 });
        else laag.setStyle({ ...basis, opacity: 0.25, fillOpacity: 0.08 });
      }
    }
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (sel) {
      const lagen = lagenRef.current.get(sel) ?? [];
      const bounds = L.latLngBounds([]);
      for (const { laag } of lagen) bounds.extend(laag.getBounds());
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.3));
    }
  }

  function selecteer(id: string) {
    const nieuw = selectieRef.current === id ? null : id;
    selectieRef.current = nieuw;
    setSelectie(nieuw);
    pasStijlenToe(nieuw);
    if (nieuw) {
      setTimeout(() => {
        document
          .getElementById(`contractkaart-rij-${nieuw}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 0);
    }
  }

  // Kaart opbouwen (eenmalig).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current).setView([52.15, 5.4], 8);
      const achtergrond = L.tileLayer(PDOK_TILES("grijs"), {
        maxZoom: 19,
        attribution: "© PDOK BRT-Achtergrondkaart",
      }).addTo(map);
      achtergrond.getContainer()?.classList.add("ondergrond-grijs");
      L.tileLayer
        .wms(KADASTER_WMS, {
          layers: "KadastraleGrens",
          styles: "",
          format: "image/png",
          transparent: true,
          version: "1.3.0",
          maxZoom: 19,
          attribution: "© Kadaster",
        })
        .addTo(map);
      LRef.current = L;
      mapRef.current = map;

      const bounds = L.latLngBounds([]);
      lagenRef.current = new Map();
      for (const c of opKaart) {
        const kleur = soortKleur(c.soortKey);
        const rand = randVoor(c);
        const basis = { color: rand.color, weight: rand.weight, fillOpacity: 0.25 };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lagen: { laag: any; basis: typeof basis }[] = [];
        const tooltip = [
          c.titel,
          c.soortLabel,
          c.einddatum
            ? `loopt af ${c.einddatum}${c.afloop ? ` (${afloopTekst(c.afloop.dagen)})` : ""}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ");
        for (const vorm of c.vormen) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const latlngs = geomNaarLatlngs(L, vorm.geom) as any;
          if (!latlngs) continue;
          const poly = L.polygon(latlngs, { ...basis, fillColor: kleur });
          poly.bindTooltip(
            vorm.label ? `${tooltip} · ${vorm.label}` : tooltip,
            { sticky: true },
          );
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          poly.on("click", (e: any) => {
            if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
            selecteer(c.id);
          });
          poly.addTo(map);
          bounds.extend(poly.getBounds());
          lagen.push({ laag: poly, basis });
        }
        for (const punt of c.punten) {
          const cirkel = L.circleMarker([punt.lat, punt.lon], {
            radius: 9,
            ...basis,
            fillColor: kleur,
            fillOpacity: 0.7,
          });
          cirkel.bindTooltip(
            punt.label ? `${tooltip} · ${punt.label}` : tooltip,
            { sticky: true },
          );
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cirkel.on("click", (e: any) => {
            if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
            selecteer(c.id);
          });
          cirkel.addTo(map);
          bounds.extend([punt.lat, punt.lon]);
          lagen.push({ laag: cirkel, basis });
        }
        if (lagen.length) lagenRef.current.set(c.id, lagen);
      }
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.15));

      // De kadastrale onderlaag klaarzetten (aan/uit doet het effect
      // hieronder); labels schalen mee met het zoomniveau.
      const kad = maakKadastraleLaag(L, bezit);
      kadLaagRef.current = kad.groep;
      werkLabelsBijRef.current = () => kad.werkLabelsBij(map);
      map.on("zoomend", () => werkLabelsBijRef.current?.());

      // Klik op de lege kaart: spotlight uit.
      map.on("click", () => {
        if (selectieRef.current) selecteer(selectieRef.current);
      });
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kadastrale onderlaag aan/uit; de contractvlakken blijven bovenop.
  useEffect(() => {
    const map = mapRef.current;
    const laag = kadLaagRef.current;
    if (!map || !laag) return;
    if (toonKadastraal) {
      laag.addTo(map);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      laag.eachLayer((l: any) => l.bringToBack?.());
      werkLabelsBijRef.current?.();
    } else if (map.hasLayer(laag)) {
      map.removeLayer(laag);
    }
  }, [toonKadastraal]);

  return (
    <div className="flex flex-col gap-3">
      {/* De kadastrale onderlaag: zien welke percelen wél en niet onder een
          contract vallen. */}
      <label className="flex cursor-pointer items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={toonKadastraal}
          onChange={(e) => setToonKadastraal(e.target.checked)}
        />
        Kadastrale percelen eronder tonen (alle perceelnummers)
      </label>

      {/* Legenda: soorten + wat de randkleur betekent. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px]">
        {soorten.map(([key, label]) => (
          <span key={key} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ background: soortKleur(key) }}
            />
            {label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5" style={{ color: "var(--text-2)" }}>
          <span
            className="inline-block h-3 w-3 rounded-sm border-2 bg-transparent"
            style={{ borderColor: RAND_AANDACHT }}
          />
          binnen verlengtermijn
        </span>
        <span className="inline-flex items-center gap-1.5" style={{ color: "var(--text-2)" }}>
          <span
            className="inline-block h-3 w-3 rounded-sm border-2 bg-transparent"
            style={{ borderColor: RAND_VERLOPEN }}
          />
          verlopen
        </span>
      </div>

      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-4">
        <div className="flex flex-col gap-2 lg:order-2 lg:sticky lg:top-4">
          <div
            ref={containerRef}
            className="card h-[480px] overflow-hidden lg:h-[calc(100vh-200px)]"
            style={{ padding: 0 }}
          />
          <p className="text-[12px]" style={{ color: "var(--text-2)" }}>
            Klik een vlak of rij aan om één contract uit te lichten; nogmaals
            klikken (of op de kaart ernaast) zet alles weer aan. Vulkleur =
            contractsoort, randkleur = aflooptermijn.
          </p>
        </div>

        <div className="flex flex-col gap-3 lg:order-1">
          <div className="card p-4">
            <div
              className="mb-2 text-[12px] font-semibold uppercase tracking-wide"
              style={{ color: "var(--text-2)" }}
            >
              Contracten op de kaart ({opKaart.length})
            </div>
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {opKaart.length === 0 && (
                <p className="py-2 text-[13px]" style={{ color: "var(--text-2)" }}>
                  Nog geen contracten met een gekoppeld perceel, gebouw of
                  eenheid.
                </p>
              )}
              {opKaart.map((c) => (
                <div
                  key={c.id}
                  id={`contractkaart-rij-${c.id}`}
                  className="flex items-center gap-3 py-2.5"
                  style={{
                    background:
                      selectie === c.id ? "var(--primary-light)" : undefined,
                  }}
                >
                  <span
                    className="mt-0.5 inline-block h-3 w-3 shrink-0 rounded-sm border-2"
                    style={{
                      background: soortKleur(c.soortKey),
                      borderColor: randVoor(c).color,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => selecteer(c.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="text-[14px] font-semibold">{c.titel}</div>
                    <div className="text-[12px]" style={{ color: "var(--text-2)" }}>
                      {[
                        c.soortLabel,
                        c.partij,
                        euro(c.bedrag) ? `${euro(c.bedrag)}/jaar` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </button>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {c.afloop?.oordeel === "verlopen" && (
                      <span className="tag tag-red">verlopen</span>
                    )}
                    {c.afloop?.oordeel === "aandacht" && (
                      <span className="tag tag-amber">
                        {afloopTekst(c.afloop.dagen)}
                      </span>
                    )}
                    {c.afloop?.oordeel === "rustig" && (
                      <span className="text-[12px]" style={{ color: "var(--text-2)" }}>
                        {afloopTekst(c.afloop.dagen)}
                      </span>
                    )}
                    {c.einddatum && (
                      <span className="text-[11.5px]" style={{ color: "var(--text-3)" }}>
                        {c.einddatum}
                      </span>
                    )}
                  </div>
                  <Link
                    href={`/landgoed/${landgoedId}/contracten/${c.id}`}
                    className="btn btn-ghost btn-sm shrink-0"
                  >
                    Dossier
                  </Link>
                </div>
              ))}
            </div>
          </div>

          {nietOpKaart.length > 0 && (
            <div className="card p-4">
              <div
                className="mb-2 text-[12px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--text-2)" }}
              >
                Nog niet op de kaart ({nietOpKaart.length})
              </div>
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {nietOpKaart.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold">{c.titel}</div>
                      <div className="text-[12px]" style={{ color: "var(--text-2)" }}>
                        {c.soortLabel} — koppel een perceel, gebouw of eenheid
                        in het dossier, dan verschijnt het hier.
                      </div>
                    </div>
                    <Link
                      href={`/landgoed/${landgoedId}/contracten/${c.id}`}
                      className="btn btn-ghost btn-sm shrink-0"
                    >
                      Dossier
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
