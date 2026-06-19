"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

function str(fd: FormData, k: string) {
  const v = String(fd.get(k) ?? "").trim();
  return v || null;
}
function num(fd: FormData, k: string) {
  const n = Number(fd.get(k));
  return Number.isFinite(n) ? n : null;
}

// Basis: de hoofdlocatie van het landgoed (adres/gemeente/provincie/coordinaat).
export async function setBasisLocatie(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const supabase = await createClient();
  await supabase
    .from("landgoed")
    .update({
      adres: str(fd, "adres"),
      postcode: str(fd, "postcode"),
      plaats: str(fd, "plaats"),
      gemeente: str(fd, "gemeente"),
      provincie: str(fd, "provincie"),
      lat: num(fd, "lat"),
      lon: num(fd, "lon"),
    })
    .eq("id", landgoed_id);
  revalidatePath(`/landgoed/${landgoed_id}/kaart`);
}

// Perceel opzoeken via PDOK Kadastrale Kaart WMS GetFeatureInfo. Server-side
// (geen CORS). Bouwt een kleine bbox in EPSG:3857 rond het klikpunt.
export async function lookupPerceel(
  lat: number,
  lon: number,
): Promise<{
  label: string;
  kenmerken: Record<string, unknown>;
  geom: unknown;
} | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const x = (lon * 20037508.342789244) / 180;
  const y =
    (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) *
    (20037508.342789244 / 180);
  const d = 150;
  const bbox = `${x - d},${y - d},${x + d},${y + d}`;
  const url =
    "https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo" +
    `&LAYERS=Perceel&QUERY_LAYERS=Perceel&CRS=EPSG:3857&BBOX=${bbox}` +
    "&WIDTH=256&HEIGHT=256&I=128&J=128&INFO_FORMAT=application/json&FEATURE_COUNT=1";
  try {
    const res = await fetch(url);
    const gj = await res.json();
    const f = gj?.features?.[0];
    if (!f) return null;
    const pr = f.properties ?? {};
    const gem = pr.kadastraleGemeenteWaarde ?? "";
    const label =
      [gem, pr.sectie, pr.perceelnummer].filter(Boolean).join(" ") ||
      pr.identificatieLokaalID ||
      "Perceel";
    return {
      label,
      geom: f.geometry ?? null, // Polygon in EPSG:3857
      kenmerken: {
        kadastrale_aanduiding: label,
        kadastrale_gemeente: gem,
        sectie: pr.sectie ?? null,
        perceelnummer: pr.perceelnummer ?? null,
        oppervlakte_m2: pr.kadastraleGrootteWaarde ?? null,
        identificatie: pr.identificatieLokaalID ?? null,
      },
    };
  } catch {
    return null;
  }
}

// Specifiek: een perceel (uit PDOK Kadastrale Kaart) als stamobject vastleggen.
export async function plaatsPerceel(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const naam = String(fd.get("naam") ?? "").trim();
  const lat = Number(fd.get("lat"));
  const lon = Number(fd.get("lon"));
  if (!naam || !Number.isFinite(lat) || !Number.isFinite(lon)) return;

  let extra: Record<string, unknown> = {};
  try {
    extra = JSON.parse(String(fd.get("kenmerken") ?? "{}"));
  } catch {
    extra = {};
  }

  const supabase = await createClient();
  await supabase.from("stamobject").insert({
    landgoed_id,
    naam,
    categorie: "pachtperceel",
    geometrie_type: "vlak",
    herkomst: "handmatig",
    geaccordeerd: true,
    kenmerken: { ...extra, lat, lon },
  });
  revalidatePath(`/landgoed/${landgoed_id}/kaart`);
}
