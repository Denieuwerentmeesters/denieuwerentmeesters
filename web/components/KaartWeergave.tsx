"use client";

// De kijk-kaart (menu-item "Kaart"): dezelfde kaarttaal als de invoerpagina,
// maar zonder invoer. Kijken, filteren op gebruikssoort, de kadastrale
// weergave en doorklikken naar de invoerpagina — meer niet.
import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Map as LMap, TileLayer } from "leaflet";
import {
  type KaartObject,
  objectDetails,
  PDOK_TILES,
  KADASTER_WMS,
  BAG_WMS,
  NATURA2000_WMS,
  NNN_WMS,
  GEBRUIK_KLEUR,
  KLEUR_GEEN_GEBRUIK,
  kleurVoorGebruik,
  KAARTGROEP_LABELS,
  type KaartGroepLabel,
  kaartGroep,
  geomNaarLatlngs,
} from "@/components/kaartDelen";

type BezitVlak = { id: string; aanduiding: string; geom: unknown };

// Sentinel voor de filter-chip "nog geen gebruik".
const GEEN_GEBRUIK = "__geen__";

export default function KaartWeergave({
  landgoedId,
  objecten,
  bezit,
  lat,
  lon,
}: {
  landgoedId: string;
  objecten: KaartObject[];
  bezit: BezitVlak[];
  lat: number | null;
  lon: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overzichtRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kadastraalLaagRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const boundsRef = useRef<any>(null);
  const achtergrondRef = useRef<TileLayer | null>(null);
  const natRef = useRef<TileLayer | null>(null);
  const nnnRef = useRef<TileLayer | null>(null);
  // Alle getekende vlakken per object, met basisstijl + gebruik — voor de
  // spotlight (klik) en het gebruiksfilter.
  const vlakkenRef = useRef<
    Map<
      string,
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        poly: any;
        basis: { weight: number; fillOpacity: number };
        gebruik: string | null;
      }[]
    >
  >(new Map());
  const geselecteerdRef = useRef<string | null>(null);
  const filterRef = useRef<string | null>(null);

  const [grijzeKaart, setGrijzeKaart] = useState(true);
  const [toonNatura, setToonNatura] = useState(false);
  const [toonNnn, setToonNnn] = useState(false);
  const [kadastraal, setKadastraal] = useState(false);
  const [filterGebruik, setFilterGebruik] = useState<string | null>(null);
  const [geselecteerd, setGeselecteerd] = useState<string | null>(null);

  // Eén stijl-pass over alle vlakken: selectie wint van filter, filter wint
  // van de basisweergave. Alles wat niet meedoet vervaagt.
  function pasStijlenToe(sel: string | null, filter: string | null) {
    for (const [oid, vlakken] of vlakkenRef.current) {
      for (const { poly, basis, gebruik } of vlakken) {
        const vol = sel
          ? oid === sel
          : filter
            ? (gebruik ?? GEEN_GEBRUIK) === filter
            : null;
        if (vol === null) poly.setStyle({ opacity: 1, ...basis });
        else if (vol) poly.setStyle({ opacity: 1, weight: 4, fillOpacity: 0.55 });
        else poly.setStyle({ opacity: 0.25, weight: 1.5, fillOpacity: 0.05 });
      }
    }
  }

  useEffect(() => {
    geselecteerdRef.current = geselecteerd;
    filterRef.current = filterGebruik;
    pasStijlenToe(geselecteerd, filterGebruik);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geselecteerd, filterGebruik]);

  // Kaart opbouwen (eenmalig): lagen + alle vlakken.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current).setView([52.15, 5.4], 8);
      achtergrondRef.current = L.tileLayer(PDOK_TILES("grijs"), {
        maxZoom: 19,
        attribution: "© PDOK BRT-Achtergrondkaart",
      }).addTo(map);
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
      L.tileLayer
        .wms(BAG_WMS, {
          layers: "pand",
          styles: "",
          format: "image/png",
          transparent: true,
          version: "1.3.0",
          maxZoom: 19,
          attribution: "© BAG",
        })
        .addTo(map);
      natRef.current = L.tileLayer.wms(NATURA2000_WMS, {
        layers: "natura2000",
        styles: "",
        format: "image/png",
        transparent: true,
        version: "1.3.0",
        opacity: 0.5,
        maxZoom: 19,
        attribution: "© Natura 2000 / RVO (PDOK)",
      });
      nnnRef.current = L.tileLayer.wms(NNN_WMS, {
        layers: "PS.ProtectedSite",
        styles: "",
        format: "image/png",
        transparent: true,
        version: "1.3.0",
        opacity: 0.8,
        maxZoom: 19,
        attribution: "© Natuurnetwerk Nederland / Provincies (PDOK)",
      });
      LRef.current = L;
      mapRef.current = map;

      // ── De gekleurde beheer-laag ──
      const groep = L.layerGroup();
      const bounds = L.latLngBounds([]);
      vlakkenRef.current = new Map();
      for (const o of objecten) {
        const vormen = o.geoms?.length ? o.geoms : o.geom ? [o.geom] : [];
        const kleur = kleurVoorGebruik(o.gebruik);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const eenheid: any[] = [];
        const isPerceel = o.categorie === "pachtperceel";
        const basis = isPerceel
          ? { weight: 2.5, fillOpacity: 0.25 }
          : { weight: 2, fillOpacity: 0.45 };
        vormen.forEach((vorm, vi) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const latlngs = geomNaarLatlngs(L, vorm) as any;
          if (!latlngs) return;
          const poly = L.polygon(latlngs, {
            color: kleur,
            fillColor: kleur,
            ...basis,
          });
          const aanduiding = isPerceel ? o.geomAanduidingen?.[vi] : null;
          poly.bindTooltip(
            aanduiding
              ? `${aanduiding} · behoort bij beheerperceel: ${o.naam}${o.gebruik ? ` (${o.gebruik})` : ""}`
              : `${o.naam}${o.gebruik ? ` · ${o.gebruik}` : ""}`,
            { sticky: true },
          );
          poly.on("mouseover", () => {
            if (geselecteerdRef.current || filterRef.current) return;
            for (const p of eenheid) p.setStyle({ weight: 4, fillOpacity: 0.45 });
          });
          poly.on("mouseout", () => {
            if (geselecteerdRef.current || filterRef.current) return;
            for (const p of eenheid) p.setStyle({ opacity: 1, ...basis });
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          poly.on("click", (e: any) => {
            if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
            toonInLijst(o.id);
          });
          eenheid.push(poly);
          poly.addTo(groep);
          bounds.extend(poly.getBounds());
        });
        if (eenheid.length) {
          vlakkenRef.current.set(
            o.id,
            eenheid.map((p) => ({ poly: p, basis, gebruik: o.gebruik })),
          );
        }
      }
      groep.addTo(map);
      overzichtRef.current = groep;

      // ── De kadastrale laag: alle percelen strak omlijnd, met nummer ──
      const kadGroep = L.layerGroup();
      for (const p of bezit) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const latlngs = geomNaarLatlngs(L, p.geom) as any;
        if (!latlngs) continue;
        const poly = L.polygon(latlngs, {
          color: "#374151",
          weight: 1.5,
          fillColor: "#374151",
          fillOpacity: 0.03,
        });
        poly.bindTooltip(p.aanduiding, {
          permanent: true,
          direction: "center",
          className: "kadastraal-label",
        });
        poly.addTo(kadGroep);
      }
      kadastraalLaagRef.current = kadGroep;

      if (bounds.isValid()) {
        boundsRef.current = bounds;
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      } else if (lat != null && lon != null) {
        map.setView([lat, lon], 14);
      }

      map.on("click", () => setGeselecteerd(null));
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Laag-toggles.
  useEffect(() => {
    achtergrondRef.current?.setUrl(PDOK_TILES(grijzeKaart ? "grijs" : "standaard"));
  }, [grijzeKaart]);
  useEffect(() => {
    const map = mapRef.current;
    const laag = natRef.current;
    if (!map || !laag) return;
    if (toonNatura) laag.addTo(map);
    else laag.remove();
  }, [toonNatura]);
  useEffect(() => {
    const map = mapRef.current;
    const laag = nnnRef.current;
    if (!map || !laag) return;
    if (toonNnn) laag.addTo(map);
    else laag.remove();
  }, [toonNnn]);

  // Kadastrale weergave: de gekleurde beheer-laag maakt plaats voor de
  // clean kadasterkaart met perceelnummers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !overzichtRef.current || !kadastraalLaagRef.current) return;
    if (kadastraal) {
      overzichtRef.current.remove();
      kadastraalLaagRef.current.addTo(map);
    } else {
      kadastraalLaagRef.current.remove();
      overzichtRef.current.addTo(map);
    }
  }, [kadastraal]);

  // Kaart → lijst: klik op een vlak, de lijst springt naar de rij.
  function toonInLijst(id: string) {
    setFilterGebruik(null);
    if (geselecteerdRef.current === id) {
      setGeselecteerd(null);
      return;
    }
    setGeselecteerd(id);
    document
      .getElementById(`weergave-rij-${id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // Lijst → kaart: klik op een rij, de kaart zoomt en licht op.
  function selecteer(o: KaartObject) {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    setFilterGebruik(null);
    if (geselecteerd === o.id) {
      setGeselecteerd(null);
      return;
    }
    setGeselecteerd(o.id);
    const vlakken = vlakkenRef.current.get(o.id);
    if (vlakken?.length) {
      const bounds = L.latLngBounds([]);
      for (const { poly } of vlakken) bounds.extend(poly.getBounds());
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 17 });
    } else if (Number.isFinite(o.lat) && Number.isFinite(o.lon)) {
      map.setView([o.lat, o.lon], 16);
    }
  }

  function kiesFilter(gebruik: string) {
    setGeselecteerd(null);
    setFilterGebruik((huidig) => (huidig === gebruik ? null : gebruik));
  }

  // Lijst-groepen (zelfde kopjes en volgorde als de invoerpagina).
  const groepenMap = new Map<KaartGroepLabel, KaartObject[]>(
    KAARTGROEP_LABELS.map((l) => [l, []]),
  );
  for (const o of objecten) groepenMap.get(kaartGroep(o))!.push(o);

  return (
    <div className="flex flex-col gap-3">
      {/* Filter op gebruikssoort + kaartlagen */}
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <span style={{ color: "var(--text-2)" }}>Licht op:</span>
        {Object.entries(GEBRUIK_KLEUR).map(([naam, kleur]) => (
          <button
            key={naam}
            type="button"
            onClick={() => kiesFilter(naam)}
            className="flex items-center gap-1.5 rounded-full border px-2.5 py-1"
            style={{
              borderColor: filterGebruik === naam ? kleur : "var(--border)",
              background: filterGebruik === naam ? `${kleur}22` : undefined,
              fontWeight: filterGebruik === naam ? 600 : 400,
            }}
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: kleur }}
            />
            {naam}
          </button>
        ))}
        <button
          type="button"
          onClick={() => kiesFilter(GEEN_GEBRUIK)}
          className="flex items-center gap-1.5 rounded-full border px-2.5 py-1"
          style={{
            borderColor:
              filterGebruik === GEEN_GEBRUIK ? KLEUR_GEEN_GEBRUIK : "var(--border)",
            background:
              filterGebruik === GEEN_GEBRUIK ? `${KLEUR_GEEN_GEBRUIK}22` : undefined,
            fontWeight: filterGebruik === GEEN_GEBRUIK ? 600 : 400,
          }}
        >
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: KLEUR_GEEN_GEBRUIK }}
          />
          nog geen gebruik
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[12.5px]" style={{ color: "var(--text-2)" }}>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={kadastraal}
            onChange={(e) => setKadastraal(e.target.checked)}
          />
          Kadastrale weergave (alle perceelnummers)
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={grijzeKaart}
            onChange={(e) => setGrijzeKaart(e.target.checked)}
          />
          Grijze ondergrond
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={toonNatura}
            onChange={(e) => setToonNatura(e.target.checked)}
          />
          Natura 2000 tonen
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={toonNnn}
            onChange={(e) => setToonNnn(e.target.checked)}
          />
          NNN tonen
        </label>
      </div>

      {/* Lijsten links, kaart rechts (sticky) — zelfde opzet als de invoer. */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-4">
        <div className="flex flex-col gap-2 lg:order-2 lg:sticky lg:top-4">
          <div
            ref={containerRef}
            className="card h-[480px] overflow-hidden lg:h-[calc(100vh-200px)]"
            style={{ padding: 0 }}
          />
          <p className="text-[12px]" style={{ color: "var(--text-2)" }}>
            Klik op een vlak of een rij om het beheerperceel op te laten lichten
            — nogmaals klikken heft op. Kleur = gebruik.
          </p>
        </div>

        <div className="flex flex-col gap-3 lg:order-1">
          {KAARTGROEP_LABELS.map((label) => {
            const lijst = groepenMap.get(label)!;
            if (lijst.length === 0) return null;
            return (
              <div key={label} className="card p-4">
                <div
                  className="mb-2 text-[12px] font-semibold uppercase tracking-wide"
                  style={{ color: "var(--text-2)" }}
                >
                  {label} ({lijst.length})
                </div>
                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {lijst.map((o) => (
                    <div
                      key={o.id}
                      id={`weergave-rij-${o.id}`}
                      className="flex items-center gap-3 py-2.5"
                      style={{
                        background:
                          geselecteerd === o.id ? "var(--primary-light)" : undefined,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => selecteer(o)}
                        className="flex-1 text-left"
                      >
                        <div className="text-[14px] font-semibold">{o.naam}</div>
                        <div className="text-[12px]" style={{ color: "var(--text-2)" }}>
                          {objectDetails(o)}
                        </div>
                      </button>
                      <Link
                        href={`/landgoed/${landgoedId}/object/${o.id}`}
                        className="btn btn-ghost btn-sm"
                      >
                        Details
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
