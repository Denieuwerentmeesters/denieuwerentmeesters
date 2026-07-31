"use client";

import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type {
  Map as LMap,
  CircleMarker,
  TileLayer,
  LeafletMouseEvent,
} from "leaflet";
import SubmitKnop from "@/components/SubmitKnop";
import { VerwijderKnop } from "@/components/VerwijderKnop";

type PlaatsObject = {
  id: string;
  naam: string;
  categorie: string;
  gebruik: string | null;
  oppervlakteHa: string | null;
  oppervlakteM2: string | null;
  pandstatus: string | null;
  bouwjaar: string | null;
  adres: string | null;
  lat: number;
  lon: number;
  geom: unknown;
  // Uit de kadastrale registratie (stap 1): álle gekoppelde perceel-vormen
  // en een leesbaar label ("kadastraal: Baarn C 1562, C 1129").
  geoms?: unknown[];
  kadastraal?: string | null;
};

function objectDetails(o: PlaatsObject): string {
  const isGebouw = GEBOUW_CATS.has(o.categorie);
  const delen = isGebouw
    ? [
        o.adres,
        o.oppervlakteM2 ? `${o.oppervlakteM2} m²` : null,
        o.pandstatus,
        o.bouwjaar ? `bouwjaar ${o.bouwjaar}` : null,
      ]
    : [o.gebruik, o.oppervlakteHa, o.kadastraal];
  return [o.categorie, ...delen].filter(Boolean).join(" · ");
}
type Basis = {
  adres: string;
  postcode: string;
  plaats: string;
  gemeente: string;
  provincie: string;
};
type LookupResult = {
  label: string;
  kenmerken: Record<string, unknown>;
  geom: unknown;
};
type Resultaat = LookupResult & { soort: "perceel" | "gebouw" };
type Mode = "basis" | "perceel" | "gebouw";

const PDOK_TILES =
  "https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png";
const KADASTER_WMS = "https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0";
const BAG_WMS = "https://service.pdok.nl/lv/bag/wms/v2_0";
const NATURA2000_WMS = "https://service.pdok.nl/rvo/natura2000/wms/v1_0";
const NNN_WMS =
  "https://service.pdok.nl/provincies/natuurnetwerk-nederland/wms/v1_0";

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

const GEBOUW_CATS = new Set(["gebouw", "woning", "opstal"]);
const PERCEEL_CATS = new Set(["pachtperceel"]);

const KAARTGROEP_LABELS = [
  "Gebouwen",
  "Agrarisch",
  "Natuur",
  "Recreatie",
  "Werken",
  "Infrastructuur",
  "Water & Klimaat",
  "Overig",
] as const;

type KaartGroepLabel = (typeof KAARTGROEP_LABELS)[number];

// Bepaalt de groep op basis van categorie + gebruik.
// Percelen erven hun groep van het gebruik-veld; vaste objectcategorieën
// (gebouwen, infrastructuur, enz.) worden direct ingedeeld.
function kaartGroep(o: PlaatsObject): KaartGroepLabel {
  const cat = o.categorie;
  const gebruik = (o.gebruik ?? "").toLowerCase();

  // Vaste objectcategorieën
  if (["gebouw", "woning", "opstal"].includes(cat)) return "Gebouwen";
  if (["natuur", "natuurbeheertype", "onderhoudszone"].includes(cat)) return "Natuur";
  if (["tuin", "wandelroute", "bomenlaan", "risicoplek"].includes(cat)) return "Recreatie";
  if (["bedrijf", "werken"].includes(cat)) return "Werken";
  if (["infrastructuur", "weg_pad", "brug", "hek", "kabel_leiding"].includes(cat)) return "Infrastructuur";
  if (["water", "waterloop", "vijver_sloot"].includes(cat)) return "Water & Klimaat";

  // Percelen: indeling via gebruik-veld
  if (cat === "pachtperceel") {
    if (gebruik === "wonen") return "Gebouwen";
    if (gebruik === "agrarisch") return "Agrarisch";
    if (gebruik === "natuur") return "Natuur";
    if (gebruik === "recreatie") return "Recreatie";
    if (gebruik === "bedrijf") return "Werken";
    if (gebruik === "maatschappelijk") return "Werken";
    return "Agrarisch"; // standaard voor percelen zonder gebruik
  }

  return "Overig";
}

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

// Zet een geom (EPSG:3857) om naar Leaflet-latlngs, of null als ongeldig.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function geomNaarLatlngs(L: any, geom: unknown): unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = geom as any;
  if (!g?.coordinates) return null;
  const ring = (rng: number[][]) =>
    rng.map(([x, y]) => L.CRS.EPSG3857.unproject(L.point(x, y)));
  return g.type === "MultiPolygon"
    ? g.coordinates.map((poly: number[][][]) => poly.map(ring))
    : g.coordinates.map(ring);
}

// Tekent de rand van een vlak (geom in EPSG:3857) op de kaart.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tekenRand(L: any, map: LMap, ref: { current: any }, geom: unknown) {
  if (ref.current) {
    ref.current.remove();
    ref.current = null;
  }
  const latlngs = geomNaarLatlngs(L, geom);
  if (!latlngs) return;
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
  koppelbaar,
  basisIngesteld,
  lat,
  lon,
  setBasisLocatie,
  plaatsOpKaart,
  lookupPerceel,
  lookupGebouw,
  verwijderObject,
  controleerGebiedsligging,
}: {
  landgoedId: string;
  objecten: PlaatsObject[];
  koppelbaar: { id: string; naam: string; categorie: string }[];
  basisIngesteld: boolean;
  lat: number | null;
  lon: number | null;
  setBasisLocatie: (fd: FormData) => Promise<void>;
  plaatsOpKaart: (fd: FormData) => Promise<void>;
  lookupPerceel: (lat: number, lon: number) => Promise<LookupResult | null>;
  lookupGebouw: (lat: number, lon: number) => Promise<LookupResult | null>;
  verwijderObject: (fd: FormData) => Promise<void>;
  controleerGebiedsligging: (fd: FormData) => Promise<void>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const tempRef = useRef<CircleMarker | null>(null);
  const kadRef = useRef<TileLayer | null>(null);
  const bagRef = useRef<TileLayer | null>(null);
  const natRef = useRef<TileLayer | null>(null);
  const nnnRef = useRef<TileLayer | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const randRef = useRef<any>(null);
  // Overzichtslaag: alle aangevinkte percelen/gebouwen, altijd zichtbaar.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overzichtRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const boundsRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LRef = useRef<any>(null);
  const modeRef = useRef<Mode>("basis");

  const [mode, setMode] = useState<Mode>("basis");
  const [toonNatura, setToonNatura] = useState(false);
  const [toonNnn, setToonNnn] = useState(false);
  const [punt, setPunt] = useState<{ lat: number; lon: number } | null>(null);
  const [basis, setBasis] = useState<Basis>(LEEG);
  const [resultaat, setResultaat] = useState<Resultaat | null>(null);
  const [bezig, setBezig] = useState(false);
  const [geselecteerd, setGeselecteerd] = useState<string | null>(null);
  const [koppelId, setKoppelId] = useState("");

  function wisHighlights() {
    if (tempRef.current) {
      tempRef.current.remove();
      tempRef.current = null;
    }
    if (randRef.current) {
      randRef.current.remove();
      randRef.current = null;
    }
  }

  // Tekent alle aangevinkte percelen (groen vlak) + gebouwen (groene stip).
  // Zo zie je in één oogopslag welke percelen al wél en nog niet zijn aangeklikt.
  // Onthoudt de gezamenlijke bounds zodat de kaart op het landgoed kan inzoomen.
  function tekenOverzicht() {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (overzichtRef.current) {
      overzichtRef.current.remove();
      overzichtRef.current = null;
    }
    boundsRef.current = null;
    const groep = L.layerGroup();
    const bounds = L.latLngBounds([]);
    for (const o of objecten) {
      if (PERCEEL_CATS.has(o.categorie)) {
        // Alle gekoppelde kadastrale vormen tekenen (één beheerperceel kan er
        // meerdere hebben); terugval op de losse kenmerken-vorm.
        const vormen = o.geoms?.length ? o.geoms : [o.geom];
        let getekend = false;
        for (const vorm of vormen) {
          const latlngs = geomNaarLatlngs(L, vorm);
          if (!latlngs) continue;
          const poly = L.polygon(latlngs, {
            color: "#1B3A28",
            weight: 2.5,
            fillColor: "#2A5C3F",
            fillOpacity: 0.4,
          });
          poly.addTo(groep);
          bounds.extend(poly.getBounds());
          getekend = true;
        }
        if (getekend) continue;
      }
      if (Number.isFinite(o.lat) && Number.isFinite(o.lon)) {
        L.circleMarker([o.lat, o.lon], {
          radius: 6,
          color: "#2A5C3F",
          fillColor: "#2A5C3F",
          fillOpacity: 0.7,
          weight: 1.5,
        }).addTo(groep);
        bounds.extend([o.lat, o.lon]);
      }
    }
    groep.addTo(map);
    overzichtRef.current = groep;
    if (bounds.isValid()) boundsRef.current = bounds;
  }

  function zoomNaarLandgoed() {
    const map = mapRef.current;
    if (map && boundsRef.current?.isValid()) {
      map.fitBounds(boundsRef.current, { padding: [40, 40], maxZoom: 16 });
    }
  }

  useEffect(() => {
    modeRef.current = mode;
    setPunt(null);
    setResultaat(null);
    setGeselecteerd(null);
    setKoppelId("");
    wisHighlights();
    // In basis-modus: toon het hele landgoed i.p.v. handmatig inzoomen.
    if (mode === "basis") zoomNaarLandgoed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // (Her)teken de overzichtslaag wanneer de objecten wijzigen (na toevoegen/verwijderen).
  useEffect(() => {
    tekenOverzicht();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objecten]);

  // Natura 2000-overlay aan/uit op basis van de toggle.
  useEffect(() => {
    const map = mapRef.current;
    const laag = natRef.current;
    if (!map || !laag) return;
    if (toonNatura) laag.addTo(map);
    else laag.remove();
  }, [toonNatura]);

  // NNN-overlay aan/uit op basis van de toggle.
  useEffect(() => {
    const map = mapRef.current;
    const laag = nnnRef.current;
    if (!map || !laag) return;
    if (toonNnn) laag.addTo(map);
    else laag.remove();
  }, [toonNnn]);

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
      // Perceelranden (Kadaster) + gebouwen (BAG) altijd zichtbaar.
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
      bagRef.current = L.tileLayer.wms(BAG_WMS, {
        layers: "pand",
        styles: "",
        format: "image/png",
        transparent: true,
        version: "1.3.0",
        maxZoom: 19,
        attribution: "© BAG",
      });
      bagRef.current!.addTo(map);
      // Natura 2000-overlay: standaard uit, via toggle aan/uit.
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
      // NNN-overlay: standaard uit, via toggle aan/uit.
      nnnRef.current = L.tileLayer.wms(NNN_WMS, {
        layers: "PS.ProtectedSite",
        styles: "",
        format: "image/png",
        transparent: true,
        version: "1.3.0",
        opacity: 0.45,
        maxZoom: 19,
        attribution: "© Natuurnetwerk Nederland / Provincies (PDOK)",
      });
      LRef.current = L;
      mapRef.current = map;

      // Toon bij laden alle aangevinkte percelen en zoom in op het landgoed.
      tekenOverzicht();
      zoomNaarLandgoed();

      map.on("click", async (e: LeafletMouseEvent) => {
        const lat = e.latlng.lat;
        const lon = e.latlng.lng;
        const m = modeRef.current;
        setGeselecteerd(null);
        setKoppelId("");
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

        if (m === "basis") {
          setBasis(await reverseGeocode(lat, lon));
          setResultaat(null);
        } else {
          const r =
            m === "perceel"
              ? await lookupPerceel(lat, lon)
              : await lookupGebouw(lat, lon);
          setResultaat(
            r ? { ...r, soort: m === "gebouw" ? "gebouw" : "perceel" } : null,
          );
          tekenRand(L, map, randRef, r?.geom);
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

  async function selecteer(o: PlaatsObject) {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || !Number.isFinite(o.lat) || !Number.isFinite(o.lon)) return;
    setGeselecteerd(o.id);
    setPunt(null);
    setResultaat(null);
    wisHighlights();
    map.setView([o.lat, o.lon], 16);
    if (o.categorie === "pachtperceel" || o.categorie === "gebouw") {
      const r =
        o.categorie === "gebouw"
          ? await lookupGebouw(o.lat, o.lon)
          : await lookupPerceel(o.lat, o.lon);
      tekenRand(L, map, randRef, r?.geom);
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

  const k = resultaat?.kenmerken ?? {};
  // Koppel-opties: alleen stamgegevens van dezelfde soort als de modus.
  const koppelOpties = koppelbaar.filter((o) =>
    mode === "gebouw"
      ? GEBOUW_CATS.has(o.categorie)
      : PERCEEL_CATS.has(o.categorie),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["basis", "Basis: landgoed-locatie"],
            ["perceel", "Percelen aanklikken"],
            ["gebouw", "Gebouwen aanklikken"],
          ] as [Mode, string][]
        ).map(([m, lbl]) => (
          <button
            key={m}
            className={`btn btn-sm ${mode === m ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setMode(m)}
          >
            {lbl}
          </button>
        ))}
      </div>

      {/* Kaartlagen + gebiedsligging */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-[12.5px]" style={{ color: "var(--text-2)" }}>
          <input
            type="checkbox"
            checked={toonNatura}
            onChange={(e) => setToonNatura(e.target.checked)}
          />
          Natura 2000 tonen
        </label>
        <label className="flex items-center gap-1.5 text-[12.5px]" style={{ color: "var(--text-2)" }}>
          <input
            type="checkbox"
            checked={toonNnn}
            onChange={(e) => setToonNnn(e.target.checked)}
          />
          NNN tonen
        </label>
        {lat != null && lon != null && (
          <form action={controleerGebiedsligging}>
            <input type="hidden" name="landgoed_id" value={landgoedId} />
            <input type="hidden" name="lat" value={lat} />
            <input type="hidden" name="lon" value={lon} />
            <SubmitKnop className="btn btn-ghost btn-sm" pendingTekst="Controleren…">
              Controleer gebiedsligging
            </SubmitKnop>
          </form>
        )}
      </div>

      <p className="text-[12px]" style={{ color: "var(--text-3)" }}>
        {mode === "basis"
          ? basisIngesteld
            ? "Klik op de kaart om de landgoed-locatie te wijzigen."
            : "Klik op de hoofdlocatie van het landgoed; adres/gemeente/provincie wordt opgezocht."
          : mode === "perceel"
            ? "Klik op een perceel; randen en oppervlakte worden opgehaald (PDOK Kadaster)."
            : "Klik op een gebouw; adres, oppervlakte, pandstatus en monumentstatus (RCE) worden opgehaald."}
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

      {/* Plaats-paneel (perceel of gebouw) */}
      {mode !== "basis" && punt && (
        <form action={plaatsOpKaart} className="card p-4">
          <input type="hidden" name="landgoed_id" value={landgoedId} />
          <input type="hidden" name="lat" value={punt.lat} />
          <input type="hidden" name="lon" value={punt.lon} />
          <input
            type="hidden"
            name="categorie"
            value={mode === "gebouw" ? "gebouw" : "pachtperceel"}
          />
          <input type="hidden" name="koppel_id" value={koppelId} />
          <input
            type="hidden"
            name="kenmerken"
            value={JSON.stringify({
              ...(resultaat?.kenmerken ?? {}),
              geom_3857: resultaat?.geom ?? null,
            })}
          />

          <div className="mb-3 text-[13px]" style={{ color: "var(--text-2)" }}>
            {bezig ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block animate-spin">🏰</span>{" "}
                {mode === "gebouw" ? "Gebouw" : "Perceel"} opzoeken…
              </span>
            ) : resultaat ? (
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-semibold" style={{ color: "var(--text)" }}>
                  {resultaat.label}
                </span>
                {mode === "gebouw" ? (
                  <>
                    {k.postcode ? ` · ${String(k.postcode)}` : ""}
                    {k.oppervlakte_m2 ? ` · ${String(k.oppervlakte_m2)} m²` : ""}
                    {k.pandstatus ? ` · ${String(k.pandstatus)}` : ""}
                    {k.bouwjaar ? ` · bouwjaar ${String(k.bouwjaar)}` : ""}
                    {k.is_rijksmonument && (
                      <span
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold"
                        style={{ background: "#fef3c7", color: "#92400e" }}
                      >
                        Rijksmonument
                        {k.rijksmonument_nummer
                          ? ` #${String(k.rijksmonument_nummer)}`
                          : ""}
                        {k.rijksmonument_categorie
                          ? ` · ${String(k.rijksmonument_categorie)}`
                          : ""}
                      </span>
                    )}
                  </>
                ) : k.oppervlakte_m2 ? (
                  ` · ${haTekst(k.oppervlakte_m2)}`
                ) : (
                  ""
                )}
              </span>
            ) : (
              `Geen ${mode === "gebouw" ? "gebouw" : "perceel"} gevonden op dit punt.`
            )}
          </div>

          {resultaat && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1">
                <label className="label-up mb-1 block">
                  Koppelen aan bestaand of nieuw
                </label>
                <select
                  className="input"
                  value={koppelId}
                  onChange={(e) => setKoppelId(e.target.value)}
                >
                  <option value="">— Nieuw object —</option>
                  {koppelOpties.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.naam}
                    </option>
                  ))}
                </select>
              </div>

              {koppelId === "" && (
                <div className="min-w-[180px] flex-1">
                  <label className="label-up mb-1 block">Naam</label>
                  <input
                    key={resultaat.label}
                    className="input"
                    name="naam"
                    defaultValue={resultaat.label}
                    required
                  />
                </div>
              )}

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

              <SubmitKnop className="btn btn-primary" pendingTekst="Opslaan…">
                {koppelId ? "Koppel & verrijk" : "Plaats"}
              </SubmitKnop>
            </div>
          )}
        </form>
      )}

      {/* Geplaatste objecten, gegroepeerd */}
      {objecten.length > 0 && (() => {
        const groepenMap = new Map<KaartGroepLabel, PlaatsObject[]>(
          KAARTGROEP_LABELS.map((l) => [l, []])
        );
        for (const o of objecten) groepenMap.get(kaartGroep(o))!.push(o);
        return (
          <div className="flex flex-col gap-3">
            <div className="text-[13px] font-semibold">
              Geplaatste objecten ({objecten.length})
            </div>
            {KAARTGROEP_LABELS.map((label) => {
              const lijst = groepenMap.get(label)!;
              if (lijst.length === 0) return null;
              return (
                <div key={label} className="card p-4">
                  <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-2)" }}>
                    {label} ({lijst.length})
                  </div>
                  <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                    {lijst.map((o) => (
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
                            {objectDetails(o)}
                          </div>
                        </button>
                        <Link
                          href={`/landgoed/${landgoedId}/object/${o.id}`}
                          className="btn btn-ghost btn-sm"
                        >
                          Details
                        </Link>
                        <form action={verwijderObject}>
                          <input type="hidden" name="landgoed_id" value={landgoedId} />
                          <input type="hidden" name="id" value={o.id} />
                          <VerwijderKnop vraag={`"${o.naam}"`}>Verwijder</VerwijderKnop>
                        </form>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
