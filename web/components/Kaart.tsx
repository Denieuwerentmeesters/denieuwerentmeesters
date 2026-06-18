"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type {
  Map as LMap,
  LayerGroup,
  CircleMarker,
  LeafletMouseEvent,
} from "leaflet";
import SubmitKnop from "@/components/SubmitKnop";

type Marker = { id: string; naam: string; lat: number; lon: number };

// PDOK BRT-Achtergrondkaart (gratis, geen key). EPSG:3857 = standaard voor Leaflet.
const PDOK_TILES =
  "https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png";

// PDOK Locatieserver reverse-geocoder (gratis, geen GIS): coördinaat -> adres.
async function reverseGeocode(lat: number, lon: number) {
  const fl =
    "weergavenaam,straatnaam,huisnummer,postcode,woonplaatsnaam,gemeentenaam,provincienaam";
  const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/reverse?lat=${lat}&lon=${lon}&rows=1&type=adres&fl=${fl}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    const doc = json?.response?.docs?.[0];
    return {
      adres: doc?.weergavenaam ?? "",
      gemeente: doc?.gemeentenaam ?? "",
      provincie: doc?.provincienaam ?? "",
    };
  } catch {
    return { adres: "", gemeente: "", provincie: "" };
  }
}

const CATEGORIEEN = [
  ["gebouw", "Gebouw"],
  ["woning", "Woning"],
  ["opstal", "Opstal"],
  ["brug", "Brug"],
  ["hek", "Hek"],
  ["vijver_sloot", "Vijver/sloot"],
  ["overig", "Overig"],
];

export default function Kaart({
  landgoedId,
  markers,
  plaatsObject,
}: {
  landgoedId: string;
  markers: Marker[];
  plaatsObject: (fd: FormData) => Promise<void>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const laagRef = useRef<LayerGroup | null>(null);
  const tempRef = useRef<CircleMarker | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LRef = useRef<any>(null);

  const [punt, setPunt] = useState<{ lat: number; lon: number } | null>(null);
  const [adres, setAdres] = useState({ adres: "", gemeente: "", provincie: "" });
  const [bezig, setBezig] = useState(false);

  // Init kaart (eenmalig, leaflet dynamisch geladen i.v.m. SSR).
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
      const laag = L.layerGroup().addTo(map);
      LRef.current = L;
      mapRef.current = map;
      laagRef.current = laag;

      // Bestaande objecten tekenen + inzoomen.
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
        map.fitBounds(markers.map((m) => [m.lat, m.lon]), {
          padding: [40, 40],
          maxZoom: 16,
        });
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
        setAdres(await reverseGeocode(lat, lon));
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

  // Markers bijwerken als de lijst verandert (na plaatsen).
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
      <div
        ref={containerRef}
        className="card overflow-hidden"
        style={{ height: 480, padding: 0 }}
      />

      {punt && (
        <form action={plaatsObject} className="card p-4">
          <input type="hidden" name="landgoed_id" value={landgoedId} />
          <input type="hidden" name="lat" value={punt.lat} />
          <input type="hidden" name="lon" value={punt.lon} />
          <input type="hidden" name="adres" value={adres.adres} />
          <input type="hidden" name="gemeente" value={adres.gemeente} />
          <input type="hidden" name="provincie" value={adres.provincie} />

          <div className="mb-3 text-[13px]" style={{ color: "var(--text-2)" }}>
            {bezig ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block animate-spin">🏰</span> Adres
                opzoeken…
              </span>
            ) : adres.adres ? (
              <>
                <span className="font-semibold" style={{ color: "var(--text)" }}>
                  {adres.adres}
                </span>{" "}
                · {adres.gemeente} · {adres.provincie}
              </>
            ) : (
              "Geen adres gevonden op dit punt — je kunt het object toch plaatsen."
            )}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <label className="label-up mb-1 block">Naam</label>
              <input
                className="input"
                name="naam"
                placeholder="bv. Koetshuis"
                required
              />
            </div>
            <div>
              <label className="label-up mb-1 block">Categorie</label>
              <select className="input" name="categorie" defaultValue="gebouw">
                {CATEGORIEEN.map(([w, l]) => (
                  <option key={w} value={w}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <SubmitKnop className="btn btn-primary" pendingTekst="Plaatsen…">
              Plaats hier
            </SubmitKnop>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setPunt(null);
                if (tempRef.current) {
                  tempRef.current.remove();
                  tempRef.current = null;
                }
              }}
            >
              Annuleer
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
