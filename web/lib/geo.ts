// Pure geometrie-helpers (EPSG:3857) — gedeeld door de kaart-UI, server
// actions en tests. Geen Leaflet en geen Supabase: alles hier is kaal
// rekenwerk op GeoJSON-structuren zoals ze in kadastraal_perceel.geom_3857
// staan ({type: "Polygon"|"MultiPolygon", coordinates: ...} in meters).
import polygonSplitter from "polygon-splitter";

export type Geom3857 = {
  type: "Polygon" | "MultiPolygon";
  coordinates: unknown;
};

const K = 20037508.342789244 / 180;

// WGS84 → WebMercator (EPSG:3857).
export function merc3857(lon: number, lat: number): [number, number] {
  const x = lon * K;
  const y =
    (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) * K;
  return [x, y];
}

// WebMercator → WGS84.
export function invMerc3857(x: number, y: number): [number, number] {
  const lon = x / K;
  const lat =
    (Math.atan(Math.exp((y * (Math.PI / 180)) / K)) * 360) / Math.PI - 90;
  return [lon, lat];
}

// Vlakke (shoelace-)oppervlakte van een Polygon/MultiPolygon in 3857-eenheden.
// Door de Mercator-vertekening is dit GEEN echte m² — maar voor de verhouding
// tussen delen van hetzelfde perceel is het exact goed genoeg: de vertekening
// is voor alle delen gelijk en valt in de verhouding weg.
export function oppervlakte3857(geom: unknown): number {
  const g = geom as Geom3857 | null;
  if (!g?.coordinates) return 0;
  const ringOpp = (ring: number[][]): number => {
    let s = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    return Math.abs(s / 2);
  };
  // Buitenring minus gaten; op de draairichting van ringen vertrouwen we
  // bewust niet (brondata volgt de GeoJSON-conventie niet altijd).
  const polyOpp = (rings: number[][][]): number => {
    if (!rings.length) return 0;
    let s = ringOpp(rings[0]);
    for (let i = 1; i < rings.length; i++) s -= ringOpp(rings[i]);
    return Math.max(0, s);
  };
  return g.type === "MultiPolygon"
    ? (g.coordinates as number[][][][]).reduce((som, p) => som + polyOpp(p), 0)
    : polyOpp(g.coordinates as number[][][]);
}

// Splitst een Polygon (3857) langs een getekende lijn. Geeft de losse delen
// als zelfstandige Polygon-geometrieën terug; komt er maar één deel terug,
// dan sneed de lijn het perceel niet door. MultiPolygon-percelen (meerdere
// losse vlakken) ondersteunen we bewust nog niet.
export function splitsPolygoon3857(
  geom: unknown,
  lijn: [number, number][],
): Geom3857[] {
  const g = geom as Geom3857 | null;
  if (!g?.coordinates || g.type !== "Polygon" || lijn.length < 2) return [];
  const res = polygonSplitter(
    { type: "Polygon", coordinates: g.coordinates },
    { type: "LineString", coordinates: lijn },
  ) as { geometry?: { type: string; coordinates: number[][][][] } } | null;
  const mp = res?.geometry;
  if (!mp || mp.type !== "MultiPolygon") return [];
  return mp.coordinates.map((poly) => ({
    type: "Polygon" as const,
    coordinates: poly,
  }));
}
