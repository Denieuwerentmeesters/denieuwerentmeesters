"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type {
  Map as LMap,
  LayerGroup,
  CircleMarker,
  TileLayer,
  LeafletMouseEvent,
} from "leaflet";
import SubmitKnop from "@/components/SubmitKnop";

type Marker = { id: string; naam: string; lat: number; lon: number };
type Basis = {
  adres: string;
  postcode: string;
  plaats: string;
  gemeente: string;
  provincie: string;
};

const PDOK_TILES =
  "https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png";
const KADASTER_WMS = "https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0";

const LEEG: Basis = {
  adres: "",
  postcode: "",
  plaats: "",
  gemeente: "",
  provincie: "",
};

// PDOK levert oppervlakte in m²; tonen in hectare (nl-notatie).
function haTekst(m2: unknown): string {
  const n = Number(m2);
  if (!Number.isFinite(n)) return "";
  return `${(n / 10000).toLocaleString("nl-NL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ha`;
}

// PDOK Locatieserver reverse: coordinaat -> adres/postcode/plaats/gemeente/provincie.
async function reverseGeocode(lat: number, lon: number): Promise<Basis> {
  const fl =
    "weergavenaam,straatnaam,huisnummer,postcode,woonplaatsnaam,gemeentenaam,provincienaam";
  const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/reverse?lat=${lat}&lon=${lon}&rows=1&type=adres&fl=${fl}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    const d = json?.response?.docs?.[0] ?? {};
    return {
      adres: d.weergavenaam ?? "",
      postcode: d.postcode ?? "",
      plaats: d.woonplaatsnaam ?? "",
      gemeente: d.gemeentenaam ?? "",
      provincie: d.provincienaam ?? "",
    };
  } catch {
    return LEEG;
  }
}

export default function Kaart({
  landgoedId,
  markers,
  basisIngesteld,
  setBasisLocatie,
  plaatsPerceel,
  lookupPerceel,
}: {
  landgoedId: string;
  markers: Marker[];
  basisIngesteld: boolean;
  setBasisLocatie: (fd: FormData) => Promise<void>;
  plaatsPerceel: (fd: FormData) => Promise<void>;
  lookupPerceel: (
    lat: number,
    lon: number,
  ) => Promise<{
    label: string;
    kenmerken: Record<string, unknown>;
    geom: unknown;
  } | null>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const laagRef = useRef<LayerGroup | null>(null);
  const tempRef = useRef<CircleMarker | null>(null);
  const kadRef = useRef<TileLayer | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const perceelLaagRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LRef = useRef<any>(null);
  const modeRef = useRef<"basis" | "perceel">("basis");

  const [mode, setMode] = useState<"basis" | "perceel">("basis");
  const [punt, setPunt] = useState<{ lat: number; lon: number } | null>(null);
  const [basis, setBasis] = useState<Basis>(LEEG);
  const [perceel, setPerceel] = useState<{
    label: string;
    kenmerken: Record<string, unknown>;
    geom: unknown;
  } | null>(null);
  const [bezig, setBezig] = useState(false);

  useEffect(() => {
    modeRef.current = mode;
    setPunt(null);
    setPerceel(null);
    if (tempRef.current) {
      tempRef.current.remove();
      tempRef.current = null;
    }
    if (perceelLaagRef.current) {
      perceelLaagRef.current.remove();
      perceelLaagRef.current = null;
    }
  }, [mode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current).setView([52.15, 5.4], 8);
      L.tileLayer(PDOK_TILES, {
        maxZoom: 19,
        attribution: "© PDOK BRT-Achtergrondkaart",
      }).addTo(map);
      // Perceelranden altijd zichtbaar (PDOK Kadastrale Kaart, alleen grenzen).
      kadRef.current = L.tileLayer.wms(KADASTER_WMS, {
        layers: "KadastraleGrens",
        styles: "",
        format: "image/png",
        transparent: true,
        version: "1.3.0",
        maxZoom: 19,
        attribution: "© Kadaster",
      });
      kadRef.current!.addTo(map);
      const laag = L.layerGroup().addTo(map);
      LRef.current = L;
      mapRef.current = map;
      laagRef.current = laag;

      markers.forEach((m) =>
        L.circleMarker([m.lat, m.lon], {
          radius: 7,
          color: "#1B3A28",
          fillColor: "#2A5C3F",
          fillOpacity: 0.9,
          weight: 2,
        })
          .bindPopup(m.naam)
          .addTo(laag),
      );
      if (markers.length) {
        map.fitBounds(
          markers.map((m) => [m.lat, m.lon] as [number, number]),
          { padding: [40, 40], maxZoom: 16 },
        );
      }

      map.on("click", async (e: LeafletMouseEvent) => {
        const lat = e.latlng.lat;
        const lon = e.latlng.lng;
        setPunt({ lat, lon });
        setBezig(true);
        if (tempRef.current) tempRef.current.remove();
        tempRef.current = L.circleMarker([lat, lon], {
          radius: 8,
          color: "#dc2626",
          fillColor: "#dc2626",
          fillOpacity: 0.6,
          weight: 2,
        }).addTo(map);

        if (modeRef.current === "basis") {
          setBasis(await reverseGeocode(lat, lon));
          setPerceel(null);
        } else {
          const r = await lookupPerceel(lat, lon);
          setPerceel(r);
          if (perceelLaagRef.current) {
            perceelLaagRef.current.remove();
            perceelLaagRef.current = null;
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const g = r?.geom as any;
          if (g?.coordinates) {
            const ring = (rng: number[][]) =>
              rng.map(([x, y]) => L.CRS.EPSG3857.unproject(L.point(x, y)));
            const latlngs =
              g.type === "MultiPolygon"
                ? g.coordinates.map((poly: number[][][]) => poly.map(ring))
                : g.coordinates.map(ring);
            perceelLaagRef.current = L.polygon(latlngs, {
              color: "#dc2626",
              weight: 2,
              fillColor: "#dc2626",
              fillOpacity: 0.12,
            }).addTo(map);
          }
        }
        setBezig(false);
      });
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

  useEffect(() => {
    const L = LRef.current;
    const laag = laagRef.current;
    if (!L || !laag) return;
    laag.clearLayers();
    markers.forEach((m: Marker) =>
      L.circleMarker([m.lat, m.lon], {
        radius: 7,
        color: "#1B3A28",
        fillColor: "#2A5C3F",
        fillOpacity: 0.9,
        weight: 2,
      })
        .bindPopup(m.naam)
        .addTo(laag),
    );
  }, [markers]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <button
          className={`btn btn-sm ${mode === "basis" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setMode("basis")}
        >
          Basis: landgoed-locatie
        </button>
        <button
          className={`btn btn-sm ${mode === "perceel" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setMode("perceel")}
        >
          Percelen aanklikken
        </button>
      </div>

      <p className="text-[12px]" style={{ color: "var(--text-3)" }}>
        {mode === "basis"
          ? basisIngesteld
            ? "Klik op de kaart om de landgoed-locatie te wijzigen."
            : "Klik op de hoofdlocatie van het landgoed; adres/gemeente/provincie wordt opgezocht."
          : "Klik op een perceel; de kadastrale gegevens worden opgehaald (PDOK Kadaster)."}
      </p>

      <div
        ref={containerRef}
        className="card overflow-hidden"
        style={{ height: 480, padding: 0 }}
      />

      {/* Basis-paneel */}
      {mode === "basis" && punt && (
        <form action={setBasisLocatie} className="card p-4">
          <input type="hidden" name="landgoed_id" value={landgoedId} />
          <input type="hidden" name="lat" value={punt.lat} />
          <input type="hidden" name="lon" value={punt.lon} />
          <input type="hidden" name="adres" value={basis.adres} />
          <input type="hidden" name="postcode" value={basis.postcode} />
          <input type="hidden" name="plaats" value={basis.plaats} />
          <input type="hidden" name="gemeente" value={basis.gemeente} />
          <input type="hidden" name="provincie" value={basis.provincie} />
          <div className="mb-3 text-[13px]" style={{ color: "var(--text-2)" }}>
            {bezig ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block animate-spin">🏰</span> Adres
                opzoeken…
              </span>
            ) : basis.adres ? (
              <>
                <span className="font-semibold" style={{ color: "var(--text)" }}>
                  {basis.adres}
                </span>
                {basis.postcode ? `, ${basis.postcode}` : ""}{" "}
                {basis.plaats} · Gemeente {basis.gemeente} · {basis.provincie}
              </>
            ) : (
              "Geen adres gevonden op dit punt."
            )}
          </div>
          <SubmitKnop className="btn btn-primary" pendingTekst="Opslaan…">
            Zet als landgoed-locatie
          </SubmitKnop>
        </form>
      )}

      {/* Perceel-paneel */}
      {mode === "perceel" && punt && (
        <form action={plaatsPerceel} className="card p-4">
          <input type="hidden" name="landgoed_id" value={landgoedId} />
          <input type="hidden" name="lat" value={punt.lat} />
          <input type="hidden" name="lon" value={punt.lon} />
          <input
            type="hidden"
            name="kenmerken"
            value={JSON.stringify({
              ...(perceel?.kenmerken ?? {}),
              geom_3857: perceel?.geom ?? null,
            })}
          />
          <div className="mb-3 text-[13px]" style={{ color: "var(--text-2)" }}>
            {bezig ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block animate-spin">🏰</span> Perceel
                opzoeken…
              </span>
            ) : perceel ? (
              <span>
                <span className="font-semibold" style={{ color: "var(--text)" }}>
                  {perceel.label}
                </span>
                {perceel.kenmerken.oppervlakte_m2
                  ? ` · ${haTekst(perceel.kenmerken.oppervlakte_m2)}`
                  : ""}
              </span>
            ) : (
              "Geen perceel gevonden op dit punt."
            )}
          </div>
          {perceel && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1">
                <label className="label-up mb-1 block">Naam</label>
                <input
                  className="input"
                  name="naam"
                  defaultValue={perceel.label}
                  required
                />
              </div>
              <SubmitKnop className="btn btn-primary" pendingTekst="Plaatsen…">
                Plaats perceel
              </SubmitKnop>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
