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

// Kruist een getekende omtrek zichzelf? Bij een zelfkruisende ring geeft de
// even-odd-regel verrassende "binnen/buiten"-uitkomsten, dus zo'n omtrek
// weigeren we. Controle: elk paar niet-aangrenzende zijden (van de gesloten
// ring) mag elkaar niet snijden. O(n²), maar n is klein (handgeklikte punten).
export function isZelfkruisend(punten: [number, number][]): boolean {
  const n = punten.length;
  if (n < 4) return false;
  const ring = [...punten, punten[0]];
  const snijden = (
    a: [number, number],
    b: [number, number],
    c: [number, number],
    d: [number, number],
  ): boolean => {
    const kruis = (
      p: [number, number],
      q: [number, number],
      r: [number, number],
    ) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const d1 = kruis(a, b, c);
    const d2 = kruis(a, b, d);
    const d3 = kruis(c, d, a);
    const d4 = kruis(c, d, b);
    return d1 * d2 < 0 && d3 * d4 < 0;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      // De sluitende zijde (j = n-1) grenst aan zijde 0 — die overslaan.
      if (i === 0 && j === n - 1) continue;
      if (snijden(ring[i], ring[i + 1], ring[j], ring[j + 1])) return true;
    }
  }
  return false;
}

// Ligt een punt binnen een Polygon/MultiPolygon? Even-odd raycast; gaten
// tellen daardoor vanzelf als "buiten". Gebruikt door voordeur 1 (omtrek
// tekenen): valt het zwaartepunt van een PDOK-perceel binnen de omtrek?
export function puntInVlak3857(
  punt: [number, number],
  geom: unknown,
): boolean {
  const g = geom as Geom3857 | null;
  if (!g?.coordinates) return false;
  const polys =
    g.type === "MultiPolygon"
      ? (g.coordinates as number[][][][])
      : [g.coordinates as number[][][]];
  const [px, py] = punt;
  const inRing = (ring: number[][]): boolean => {
    let binnen = false;
    for (let i = 0, j = ring.length - 2; i < ring.length - 1; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (
        yi > py !== yj > py &&
        px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
      ) {
        binnen = !binnen;
      }
    }
    return binnen;
  };
  for (const rings of polys) {
    let binnen = false;
    for (const ring of rings) if (inRing(ring)) binnen = !binnen;
    if (binnen) return true;
  }
  return false;
}

// Een punt dat gegarandeerd bínnen het vlak ligt, voor kaartlabels. Het
// simpele middelpunt van de omtrek valt bij smalle of L-vormige percelen
// vaak búiten het vlak (en dus in de buurman). Aanpak: neem de horizontale
// lijn door het midden, bepaal waar die het vlak doorsnijdt, en kies het
// midden van de breedste doorsnede.
export function labelPunt3857(geom: unknown): [number, number] | null {
  const g = geom as Geom3857 | null;
  if (!g?.coordinates) return null;
  const polys =
    g.type === "MultiPolygon"
      ? (g.coordinates as number[][][][])
      : [g.coordinates as number[][][]];
  // Bij meerdere vlakken: label in het grootste.
  let beste: number[][][] | null = null;
  let besteOpp = -1;
  for (const p of polys) {
    const opp = oppervlakte3857({ type: "Polygon", coordinates: p });
    if (opp > besteOpp) {
      besteOpp = opp;
      beste = p;
    }
  }
  const ring = beste?.[0];
  if (!ring || ring.length < 4) return null;
  const ys = ring.map((c) => c[1]);
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const xs: number[] = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    if ((y1 <= cy && y2 > cy) || (y2 <= cy && y1 > cy)) {
      xs.push(x1 + ((cy - y1) / (y2 - y1)) * (x2 - x1));
    }
  }
  xs.sort((a, b) => a - b);
  let besteX: number | null = null;
  let besteBreedte = -1;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    const breedte = xs[i + 1] - xs[i];
    if (breedte > besteBreedte) {
      besteBreedte = breedte;
      besteX = (xs[i] + xs[i + 1]) / 2;
    }
  }
  return besteX == null ? null : [besteX, cy];
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
