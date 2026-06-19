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

function merc3857(lon: number, lat: number): [number, number] {
  const x = (lon * 20037508.342789244) / 180;
  const y =
    (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) *
    (20037508.342789244 / 180);
  return [x, y];
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

// Een geplaatst object/perceel verwijderen (incl. koppelingen ernaartoe).
export async function verwijderObject(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const id = String(fd.get("id"));
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("verband")
    .delete()
    .or(`bron_id.eq.${id},doel_id.eq.${id}`);
  await supabase.from("stamobject").delete().eq("id", id);
  revalidatePath(`/landgoed/${landgoed_id}/kaart`);
}

// Basislocatie wissen.
export async function wisBasis(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const supabase = await createClient();
  await supabase
    .from("landgoed")
    .update({
      adres: null,
      postcode: null,
      plaats: null,
      gemeente: null,
      provincie: null,
      lat: null,
      lon: null,
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

// Gebouw opzoeken via PDOK BAG WMS GetFeatureInfo (verblijfsobject + pand).
export async function lookupGebouw(
  lat: number,
  lon: number,
): Promise<{
  label: string;
  kenmerken: Record<string, unknown>;
  geom: unknown;
} | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const [x, y] = merc3857(lon, lat);
  const d = 25;
  const base = "https://service.pdok.nl/lv/bag/wms/v2_0";
  const common =
    `&CRS=EPSG:3857&BBOX=${x - d},${y - d},${x + d},${y + d}` +
    "&WIDTH=101&HEIGHT=101&I=50&J=50&INFO_FORMAT=application/json&FEATURE_COUNT=1";
  const url = (layer: string) =>
    `${base}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=${layer}&QUERY_LAYERS=${layer}${common}`;
  try {
    const [voR, pandR] = await Promise.all([
      fetch(url("verblijfsobject")).then((r) => r.json()),
      fetch(url("pand")).then((r) => r.json()),
    ]);
    const vp = voR?.features?.[0]?.properties ?? {};
    const pp = pandR?.features?.[0]?.properties ?? {};
    const geom = pandR?.features?.[0]?.geometry ?? null; // pand-footprint (Polygon, 3857)
    if (!vp.openbare_ruimte && !pp.identificatie) return null;

    const huis = `${vp.huisnummer ?? ""}${vp.huisletter ?? ""}${vp.toevoeging ? `-${vp.toevoeging}` : ""}`;
    const adres = [vp.openbare_ruimte, huis].filter(Boolean).join(" ").trim();
    const label = adres || "Gebouw";
    return {
      label,
      geom,
      kenmerken: {
        adres: adres || null,
        postcode: vp.postcode ?? null,
        woonplaats: vp.woonplaats ?? null,
        oppervlakte_m2: vp.oppervlakte ?? pp.oppervlakte_max ?? null,
        pandstatus: vp.pandstatus ?? pp.status ?? null,
        bouwjaar: vp.bouwjaar ?? pp.bouwjaar ?? null,
      },
    };
  } catch {
    return null;
  }
}

// Plaatsen vanuit de kaart: nieuw object OF koppelen aan een bestaand
// stamgegeven (dat wordt dan verrijkt met de PDOK-data). categorie =
// 'pachtperceel' of 'gebouw'.
export async function plaatsOpKaart(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const koppel_id = String(fd.get("koppel_id") ?? "").trim();
  const categorie = String(fd.get("categorie") ?? "overig");
  const naam = String(fd.get("naam") ?? "").trim();
  const gebruik = String(fd.get("gebruik") ?? "").trim();
  const lat = Number(fd.get("lat"));
  const lon = Number(fd.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

  let extra: Record<string, unknown> = {};
  try {
    extra = JSON.parse(String(fd.get("kenmerken") ?? "{}"));
  } catch {
    extra = {};
  }
  const geo = { ...extra, lat, lon, ...(gebruik ? { gebruik } : {}) };

  const supabase = await createClient();
  if (koppel_id) {
    // Bestaand stamgegeven verrijken met de PDOK-data.
    const { data: best } = await supabase
      .from("stamobject")
      .select("kenmerken")
      .eq("id", koppel_id)
      .maybeSingle();
    const merged = { ...((best?.kenmerken as object) ?? {}), ...geo };
    await supabase
      .from("stamobject")
      .update({ kenmerken: merged, geometrie_type: "vlak", geaccordeerd: true })
      .eq("id", koppel_id);
  } else {
    if (!naam) return;
    await supabase.from("stamobject").insert({
      landgoed_id,
      naam,
      categorie,
      geometrie_type: "vlak",
      herkomst: "handmatig",
      geaccordeerd: true,
      kenmerken: geo,
    });
  }
  revalidatePath(`/landgoed/${landgoed_id}/kaart`);
}
