"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { moet } from "@/lib/db";

function tekst(fd: FormData, k: string) {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
}
function getal(fd: FormData, k: string) {
  const v = tekst(fd, k);
  if (v === null) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// ── Projecties (gelijk aan kaart/acties.ts) ──
function merc3857(lon: number, lat: number): [number, number] {
  const k = 20037508.342789244 / 180;
  const x = lon * k;
  const y =
    (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) * k;
  return [x, y];
}
function invMerc3857(x: number, y: number): [number, number] {
  const k = 20037508.342789244 / 180;
  const lon = x / k;
  const lat = (Math.atan(Math.exp((y * (Math.PI / 180)) / k)) * 360) / Math.PI - 90;
  return [lon, lat];
}

// Grof zwaartepunt van een (Multi)Polygon: gemiddelde van alle ringpunten.
function centroid3857(geom: unknown): [number, number] | null {
  const acc: number[] = [0, 0];
  let n = 0;
  const eat = (c: unknown) => {
    if (
      Array.isArray(c) &&
      c.length >= 2 &&
      typeof c[0] === "number" &&
      typeof c[1] === "number"
    ) {
      acc[0] += c[0];
      acc[1] += c[1];
      n++;
    } else if (Array.isArray(c)) {
      for (const x of c) eat(x);
    }
  };
  const g = geom as { coordinates?: unknown };
  if (!g?.coordinates) return null;
  eat(g.coordinates);
  if (n === 0) return null;
  return [acc[0] / n, acc[1] / n];
}

// ── RCE Rijksmonumentenregister (open & gezaghebbend) ──
// WFS bbox-sweep rond de basislocatie levert alle kandidaat-monumenten in/rond
// het landgoed. Server-side (geen CORS). Geometrie komt in EPSG:3857 terug,
// gelijk aan de geom_3857-conventie van de kaart. Buurmonumenten kunnen ook
// meekomen -> daarom geaccordeerd=false: de eigenaar cureert.
const RCE_WFS = "https://services.rce.geovoorziening.nl/rce/wfs";
const RCE_LAAG = "NationalListedMonumentPolygons";
// Halve box-zijde in meter rond de basislocatie. ~700 m vangt ook grotere
// landgoederen; ruis wordt door de accordeer-stap weggefilterd.
const SWEEP_M = 700;

type RceMonument = {
  rijksmonument_nummer?: number | string;
  complex_nummer?: number | string;
  juridische_status?: string;
  aard_monument?: string;
  hoofdcategorie?: string;
  subcategorie?: string;
  rijksmonumenturl?: string;
};

export async function haalRijksmonumenten(landgoed_id: string) {
  const supabase = await createClient();

  const { data: lg } = await supabase
    .from("landgoed")
    .select("lat, lon")
    .eq("id", landgoed_id)
    .maybeSingle();
  if (lg?.lat == null || lg?.lon == null) {
    return { ok: false as const, reden: "geen-basislocatie", aantal: 0 };
  }

  const [cx, cy] = merc3857(lg.lon, lg.lat);
  const bbox = `${cx - SWEEP_M},${cy - SWEEP_M},${cx + SWEEP_M},${cy + SWEEP_M},urn:ogc:def:crs:EPSG::3857`;
  const url =
    `${RCE_WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
    `&TYPENAMES=${RCE_LAAG}&COUNT=200&BBOX=${bbox}&OUTPUTFORMAT=application/json`;

  let features: Array<{ properties?: RceMonument; geometry?: unknown }> = [];
  try {
    const res = await fetch(url);
    const gj = await res.json();
    features = Array.isArray(gj?.features) ? gj.features : [];
  } catch {
    return { ok: false as const, reden: "pdok-onbereikbaar", aantal: 0 };
  }

  // Bestaande monumenten van dit landgoed -> niet dubbel invoeren, accordering
  // (geaccordeerd=true) van de eigenaar behouden.
  const { data: bestaande } = await supabase
    .from("stamobject")
    .select("kenmerken")
    .eq("landgoed_id", landgoed_id)
    .eq("categorie", "rijksmonument");
  const reedsAanwezig = new Set(
    (bestaande ?? [])
      .map(
        (o) =>
          (o.kenmerken as { rijksmonument_nummer?: unknown })
            ?.rijksmonument_nummer,
      )
      .filter((v) => v != null)
      .map(String),
  );

  const rijen: Array<Record<string, unknown>> = [];
  for (const f of features) {
    const p = f.properties ?? {};
    const nr = p.rijksmonument_nummer;
    if (nr == null || reedsAanwezig.has(String(nr))) continue;
    reedsAanwezig.add(String(nr));

    let lat: number | null = null;
    let lon: number | null = null;
    const c = centroid3857(f.geometry);
    if (c) [lon, lat] = invMerc3857(c[0], c[1]);

    const naam =
      p.subcategorie || p.hoofdcategorie || `Rijksmonument ${nr}`;
    rijen.push({
      landgoed_id,
      naam: `Rijksmonument ${nr} · ${naam}`,
      categorie: "rijksmonument",
      geometrie_type: c ? "vlak" : "geen",
      herkomst: "ai",
      voorstel_reden:
        "Gevonden in het RCE Rijksmonumentenregister (WFS) binnen de omgeving van de basislocatie. Controleer of dit monument tot het landgoed hoort.",
      geaccordeerd: false,
      kenmerken: {
        rijksmonument_nummer: nr,
        complex_nummer: p.complex_nummer ?? null,
        juridische_status: p.juridische_status ?? null,
        aard_monument: p.aard_monument ?? null,
        hoofdcategorie: p.hoofdcategorie ?? null,
        subcategorie: p.subcategorie ?? null,
        url: p.rijksmonumenturl ?? null,
        lat,
        lon,
        geom_3857: f.geometry ?? null,
      },
    });
  }

  if (rijen.length > 0) {
    await moet(supabase.from("stamobject").insert(rijen), "monumenten opslaan");
  }
  await moet(
    supabase
      .from("landgoed")
      .update({ monumenten_gecontroleerd_op: new Date().toISOString() })
      .eq("id", landgoed_id),
    "controle-tijdstip bijwerken",
  );

  revalidatePath(`/landgoed/${landgoed_id}/profiel`);
  return { ok: true as const, aantal: rijen.length };
}

// Form-wrapper zodat de knop op de profielpagina een server-action kan posten.
export async function controleerRijksmonumenten(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  if (!landgoed_id) return;
  await haalRijksmonumenten(landgoed_id);
}

// Een voorgesteld monument accorderen of verwijderen (eigenaar cureert).
export async function accordeerMonument(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const id = String(fd.get("id"));
  if (!id) return;
  const supabase = await createClient();
  await moet(
    supabase.from("stamobject").update({ geaccordeerd: true }).eq("id", id),
    "monument accorderen",
  );
  revalidatePath(`/landgoed/${landgoed_id}/profiel`);
}

export async function verwijderMonument(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const id = String(fd.get("id"));
  if (!id) return;
  const supabase = await createClient();
  await moet(
    supabase.from("stamobject").delete().eq("id", id),
    "monument verwijderen",
  );
  revalidatePath(`/landgoed/${landgoed_id}/profiel`);
}

// ── Retroactieve monument-check voor bestaande gebouwen ──
// Loopt alle geaccordeerde gebouwen langs en controleert via RCE WFS of ze
// een rijksmonument zijn. Werkt ook voor gebouwen die vóór deze feature zijn
// geplaatst (toen is_rijksmonument nog niet werd opgeslagen).
export async function hercontroleMonumentenGebouwen(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const supabase = await createClient();

  const { data: gebouwen } = await supabase
    .from("stamobject")
    .select("id, kenmerken")
    .eq("landgoed_id", landgoed_id)
    .eq("geaccordeerd", true)
    .in("categorie", ["gebouw", "woning", "opstal"]);

  if (!gebouwen?.length) {
    revalidatePath(`/landgoed/${landgoed_id}/profiel`);
    return;
  }

  for (const g of gebouwen) {
    const k = (g.kenmerken ?? {}) as Record<string, unknown>;
    const lat = Number(k.lat);
    const lon = Number(k.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    // RCE-check: kleine bbox (30 m) rond het gebouw-punt.
    const [x, y] = merc3857(lon, lat);
    const d = 30;
    const bbox = `${x - d},${y - d},${x + d},${y + d},urn:ogc:def:crs:EPSG::3857`;
    const url =
      `${RCE_WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
      `&TYPENAMES=${RCE_LAAG}&COUNT=1&BBOX=${bbox}&OUTPUTFORMAT=application/json`;

    let mon: Record<string, unknown> = {
      is_rijksmonument: false,
      rijksmonument_nummer: null,
      rijksmonument_categorie: null,
      rijksmonument_url: null,
    };
    try {
      const res = await fetch(url);
      const gj = await res.json();
      const f = gj?.features?.[0];
      if (f) {
        const p = (f.properties ?? {}) as Record<string, unknown>;
        mon = {
          is_rijksmonument: true,
          rijksmonument_nummer:
            p.rijksmonument_nummer != null ? String(p.rijksmonument_nummer) : null,
          rijksmonument_categorie:
            typeof p.subcategorie === "string" && p.subcategorie
              ? p.subcategorie
              : typeof p.hoofdcategorie === "string" && p.hoofdcategorie
                ? p.hoofdcategorie
                : null,
          rijksmonument_url:
            typeof p.rijksmonumenturl === "string" ? p.rijksmonumenturl : null,
        };
      }
    } catch {
      continue; // stil falen: dit gebouw overslaan
    }

    await moet(
      supabase
        .from("stamobject")
        .update({ kenmerken: { ...k, ...mon } })
        .eq("id", g.id),
      "monumentstatus bijwerken",
    );
  }

  revalidatePath(`/landgoed/${landgoed_id}/profiel`);
}

// ── BGT Bodemgebruik (automatisch, per perceel-centroïde) ──
//
// BGT begroeidterreindeel geeft de fysieke situatie (wat er staat), wat voor
// oppervlakteverdeling nuttiger is dan de juridische bestemming. Query via
// PDOK OGC API Features — geen CORS-probleem server-side.
//
const BGT_BASE = "https://api.pdok.nl/lv/bgt/ogc/v1/collections";

// fysiek_voorkomen waarden → onze verdeling-categorieën
const BGT_SOORT: Record<string, string> = {
  loofbos: "Bos & laanstructuur",
  naaldbos: "Bos & laanstructuur",
  "gemengd bos": "Bos & laanstructuur",
  bosplantsoen: "Bos & laanstructuur",
  "grasland agrarisch": "Weiland (pacht)",
  bouwland: "Weiland (pacht)",
  fruitteelt: "Weiland (pacht)",
  "grasland overig": "Park & tuinen",
  groenvoorziening: "Park & tuinen",
  heesters: "Park & tuinen",
  planten: "Park & tuinen",
  heide: "Park & tuinen",
  duin: "Park & tuinen",
  moeras: "Water",
  rietland: "Water",
};

// gebruik_bgt → gebruik (dropdown-waarde), alleen gezet als gebruik nog leeg is
const BGT_GEBRUIK: Record<string, string> = {
  "Bos & laanstructuur": "Natuur",
  "Park & tuinen": "Natuur",
  "Weiland (pacht)": "Agrarisch",
};

async function bgtSoortOpCentroide(
  lat: number,
  lon: number,
): Promise<string | null> {
  // Kleine bbox (~25 m) rond centroïde; neem het eerste actuele BGT-object.
  const d = 0.0003;
  const bbox = `${lon - d},${lat - d},${lon + d},${lat + d}`;
  const params = `bbox=${bbox}&limit=5&f=json`;

  try {
    const [begroeid, water] = await Promise.all([
      fetch(`${BGT_BASE}/begroeidterreindeel/items?${params}`).then((r) =>
        r.json(),
      ),
      fetch(`${BGT_BASE}/waterdeel/items?${params}`).then((r) => r.json()),
    ]);

    // Waterdeel heeft voorrang als het er is.
    if ((water?.features?.length ?? 0) > 0) return "Water";

    // Bepaal meest voorkomende fysiek_voorkomen (filter historisch)
    const counts = new Map<string, number>();
    for (const f of begroeid?.features ?? []) {
      const p = f.properties ?? {};
      if (p.termination_date) continue; // historisch object
      const fv: string = p.fysiek_voorkomen ?? "";
      if (fv) counts.set(fv, (counts.get(fv) ?? 0) + 1);
    }
    if (counts.size === 0) return null;
    const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return BGT_SOORT[dominant] ?? null;
  } catch {
    return null;
  }
}

export async function haalBGTBodemgebruik(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  if (!landgoed_id) return;
  const supabase = await createClient();

  const { data: percelen } = await supabase
    .from("stamobject")
    .select("id, kenmerken")
    .eq("landgoed_id", landgoed_id)
    .in("categorie", ["perceel", "pachtperceel"])
    .eq("geaccordeerd", true);

  if (!percelen?.length) {
    await moet(
      supabase
        .from("landgoed")
        .update({ bodemgebruik_gecontroleerd_op: new Date().toISOString() })
        .eq("id", landgoed_id),
      "controle-tijdstip bijwerken",
    );
    revalidatePath(`/landgoed/${landgoed_id}/profiel`);
    return;
  }

  await Promise.all(
    percelen.map(async (p) => {
      const k = (p.kenmerken ?? {}) as { lat?: number; lon?: number };
      if (!k.lat || !k.lon) return;
      const soort = await bgtSoortOpCentroide(k.lat, k.lon);
      if (!soort) return;
      const bestaandGebruik = (p.kenmerken as Record<string, unknown>)?.gebruik;
      const autoGebruik = !bestaandGebruik ? (BGT_GEBRUIK[soort] ?? null) : null;
      const nieuweKenmerken: Record<string, unknown> = {
        ...((p.kenmerken as object) ?? {}),
        gebruik_bgt: soort,
        ...(autoGebruik ? { gebruik: autoGebruik } : {}),
      };
      await moet(
        supabase
          .from("stamobject")
          .update({ kenmerken: nieuweKenmerken })
          .eq("id", p.id),
        "bodemgebruik opslaan",
      );
    }),
  );

  await moet(
    supabase
      .from("landgoed")
      .update({ bodemgebruik_gecontroleerd_op: new Date().toISOString() })
      .eq("id", landgoed_id),
    "controle-tijdstip bijwerken",
  );

  revalidatePath(`/landgoed/${landgoed_id}/profiel`);
}

// ── Handmatig profiel (NSW + juridisch) ──
// NSW-rangschikking is niet-openbaar -> eigenaar-invoer. eigendomsvorm/rechtsvorm
// bestonden al op landgoed; hier samen bewerkbaar gemaakt.
export async function bewaarProfiel(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  if (!landgoed_id) return;
  const supabase = await createClient();
  await moet(
    supabase
      .from("landgoed")
      .update({
        nsw_status: tekst(fd, "nsw_status"),
        nsw_sinds: getal(fd, "nsw_sinds"),
        nsw_openstelling_dagen: getal(fd, "nsw_openstelling_dagen"),
        nsw_nummer: tekst(fd, "nsw_nummer"),
        eigendomsvorm: tekst(fd, "eigendomsvorm"),
        rechtsvorm: tekst(fd, "rechtsvorm"),
        hectare: getal(fd, "hectare"),
      })
      .eq("id", landgoed_id),
    "profiel opslaan",
  );
  revalidatePath(`/landgoed/${landgoed_id}/profiel`);
  redirect(`/landgoed/${landgoed_id}/profiel`);
}
