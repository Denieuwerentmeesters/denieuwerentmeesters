"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type {
  Map as LMap,
  CircleMarker,
  TileLayer,
  LeafletMouseEvent,
} from "leaflet";
import SubmitKnop from "@/components/SubmitKnop";

type PlaatsObject = {
  id: string;
  naam: string;
  categorie: string;
  gebruik: string | null;
  oppervlakte: string | null;
  lat: number;
  lon: number;
};
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

const GEBRUIK = [
  "Wonen",
  "Bedrijf",
  "Natuur",
  "Agrarisch",
  "Recreatie",
  "Maatschappelijk",
];

function haTekst(m2: unknown): string {
  const n = Number(m2);
  if (!Number.isFinite(n)) return "";
  return `${(n / 10000).toLocaleString("nl-NL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ha`;
}

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

// Tekent de rand van een perceel (geom in EPSG:3857) op de kaart.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tekenPerceelRand(L: any, map: LMap, ref: { current: any }, geom: unknown) {
  if (ref.current) {
    ref.current.remove();
    ref.current = null;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = geom as any;
  if (!g?.coordinates) return;
  const ring = (rng: number[][]) =>
    rng.map(([x, y]) => L.CRS.EPSG3857.unproject(L.point(x, y)));
  const latlngs =
    g.type === "MultiPolygon"
      ? g.coordinates.map((poly: number[][][]) => poly.map(ring))
      : g.coordinates.map(ring);
  ref.current = L.polygon(latlngs, {
    color: "#dc2626",
    weight: 2,
    fillColor: "#dc2626",
    fillOpacity: 0.12,
  }).addTo(map);
}

export default function Kaart({
  landgoedId,
  objecten,
  basisIngesteld,
  setBasisLocatie,
  plaatsPerceel,
  lookupPerceel,
  verwijderObject,
}: {
  landgoedId: string;
  objecten: PlaatsObject[];
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
  verwijderObject: (fd: FormData) => Promise<void>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
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
  const [geselecteerd, setGeselecteerd] = useState<string | null>(null);

  function wisHighlights() {
    if (tempRef.current) {
      tempRef.current.remove();
      tempRef.current = null;
    }
    if (perceelLaagRef.current) {
      perceelLaagRef.current.remove();
      perceelLaagRef.current = null;
    }
  }

  useEffect(() => {
    modeRef.current = mode;
    setPunt(null);
    setPerceel(null);
    setGeselecteerd(null);
    wisHighlights();
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
      LRef.current = L;
      mapRef.current = map;

      map.on("click", async (e: LeafletMouseEvent) => {
        const lat = e.latlng.lat;
        const lon = e.latlng.lng;
        setGeselecteerd(null);
        setPunt({ lat, lon });
        setBezig(true);
        wisHighlights();
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
          tekenPerceelRand(L, map, perceelLaagRef, r?.geom);
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

  // Een geplaatst object selecteren: inzoomen + tonen (perceel = randen).
  async function selecteer(o: PlaatsObject) {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || !Number.isFinite(o.lat) || !Number.isFinite(o.lon)) return;
    setGeselecteerd(o.id);
    setPunt(null);
    setPerceel(null);
    wisHighlights();
    map.setView([o.lat, o.lon], 16);
    if (o.categorie === "pachtperceel") {
      const r = await lookupPerceel(o.lat, o.lon);
      tekenPerceelRand(L, map, perceelLaagRef, r?.geom);
    } else {
      tempRef.current = L.circleMarker([o.lat, o.lon], {
        radius: 8,
        color: "#1B3A28",
        fillColor: "#2A5C3F",
        fillOpacity: 0.9,
        weight: 2,
      }).addTo(map);
    }
  }

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
          : "Klik op een perceel; de randen en oppervlakte worden opgehaald (PDOK Kadaster)."}
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
                {basis.postcode ? `, ${basis.postcode}` : ""} {basis.plaats} ·
                Gemeente {basis.gemeente} · {basis.provincie}
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
              <div className="min-w-[200px] flex-1">
                <label className="label-up mb-1 block">Naam</label>
                <input
                  className="input"
                  name="naam"
                  defaultValue={perceel.label}
                  required
                />
              </div>
              <div>
                <label className="label-up mb-1 block">Gebruik</label>
                <select className="input" name="gebruik" defaultValue="">
                  <option value="">— kies —</option>
                  {GEBRUIK.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
              <SubmitKnop className="btn btn-primary" pendingTekst="Plaatsen…">
                Plaats perceel
              </SubmitKnop>
            </div>
          )}
        </form>
      )}

      {/* Geplaatste objecten */}
      {objecten.length > 0 && (
        <div className="card p-4">
          <div className="mb-2 text-[13px] font-semibold">
            Geplaatste objecten ({objecten.length})
          </div>
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {objecten.map((o) => (
              <div
                key={o.id}
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
                    {o.categorie}
                    {o.gebruik ? ` · ${o.gebruik}` : ""}
                    {o.oppervlakte ? ` · ${o.oppervlakte}` : ""}
                  </div>
                </button>
                <form action={verwijderObject}>
                  <input type="hidden" name="landgoed_id" value={landgoedId} />
                  <input type="hidden" name="id" value={o.id} />
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: "var(--red)" }}
                  >
                    Verwijder
                  </button>
                </form>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
