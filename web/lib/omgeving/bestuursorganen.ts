// Welke bestuursorganen kunnen dit landgoed raken?
//
// Dat hoeft niemand in te vullen: het volgt uit waar de percelen liggen.
// Gemeente, buurgemeenten en provincie komen uit PDOK Bestuurlijke Gebieden,
// het waterschap uit de waterschapsgrenzen-WMS.
//
// Beide bronnen leveren in EPSG:28992, hetzelfde stelsel als kadastraal_perceel
// .geom_rd — dus geen herprojectie en geen kans op de 3857-valkuil.

const BESTUURLIJK_WFS =
  "https://service.pdok.nl/kadaster/bestuurlijkegebieden/wfs/v1_0";
const WATERSCHAP_WMS =
  "https://service.pdok.nl/hwh/waterschappen-waterschapsgrenzen-imso/wms/v2_0";

const TIMEOUT_MS = 20000;

export type Bestuursorgaan = {
  bestuurslaag: "gemeente" | "buurgemeente" | "provincie" | "waterschap";
  naam: string;
  // Officiële code: GM0687 voor gemeenten, provinciecode voor provincies,
  // waterbeheerdercode voor waterschappen. Dit is wat de SRU-query nodig heeft.
  code: string | null;
};

export type Rechthoek = { xmin: number; ymin: number; xmax: number; ymax: number };

async function haalJson(url: string, wat: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${wat}: HTTP ${res.status}`);
  const tekst = await res.text();
  try {
    return JSON.parse(tekst);
  } catch {
    // PDOK geeft bij een foute query een XML-ExceptionReport of een HTML-pagina
    // terug met status 200. Stil doorgaan zou hier betekenen: geen
    // bestuursorganen, dus geen berichten, zonder dat iemand het merkt.
    throw new Error(`${wat}: geen JSON terug (${tekst.slice(0, 120)})`);
  }
}

type Feature = { properties?: Record<string, unknown>; bbox?: number[] };

function features(json: unknown): Feature[] {
  const f = (json as { features?: unknown })?.features;
  return Array.isArray(f) ? (f as Feature[]) : [];
}

function tekst(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}

/** WFS-bevraging op een rechthoek in RD. */
async function bevraagVlak(
  laag: string,
  vak: Rechthoek,
  wat: string,
): Promise<Feature[]> {
  const url =
    `${BESTUURLIJK_WFS}?service=WFS&version=2.0.0&request=GetFeature` +
    `&typeNames=${encodeURIComponent(laag)}` +
    `&outputFormat=${encodeURIComponent("application/json")}` +
    `&count=50` +
    `&bbox=${vak.xmin},${vak.ymin},${vak.xmax},${vak.ymax},urn:ogc:def:crs:EPSG::28992`;
  return features(await haalJson(url, wat));
}

/**
 * Bestuursorganen afleiden uit de omhullende rechthoek van het invloedsgebied.
 *
 * `vak` is de bounding box in RD (EPSG:28992) van alles wat het landgoed
 * bezit of waar het belang bij heeft.
 */
export async function leidBestuursorganenAf(vak: Rechthoek): Promise<{
  organen: Bestuursorgaan[];
  waarschuwingen: string[];
}> {
  const waarschuwingen: string[] = [];
  const organen: Bestuursorgaan[] = [];

  // ── Eigen gemeente(n) en provincie ──
  const eigen = await bevraagVlak("bestuurlijkegebieden:Gemeentegebied", vak, "gemeente opzoeken");
  if (eigen.length === 0) {
    waarschuwingen.push(
      "Geen gemeente gevonden bij deze percelen — controleer of de geometrie klopt.",
    );
    return { organen, waarschuwingen };
  }

  const eigenCodes = new Set<string>();
  for (const f of eigen) {
    const p = f.properties ?? {};
    const naam = tekst(p.naam);
    if (!naam) continue;
    organen.push({
      bestuurslaag: "gemeente",
      naam,
      code: tekst(p.identificatie) ?? tekst(p.code),
    });
    const id = tekst(p.identificatie);
    if (id) eigenCodes.add(id);

    const prov = tekst(p.ligtInProvincieNaam);
    if (prov && !organen.some((o) => o.bestuurslaag === "provincie" && o.naam === prov)) {
      organen.push({
        bestuurslaag: "provincie",
        naam: prov,
        code: tekst(p.ligtInProvincieCode),
      });
    }
  }

  // ── Buurgemeenten ──
  //
  // Ruim de omhullende oprekken en alles pakken wat daarbinnen valt. Dat is
  // bewust royaal: een gemeente te veel kost wat extra publicaties om te
  // filteren, een gemeente te weinig betekent dat de radar zwijgt over de
  // overkant van de grens — en dat merkt niemand. Over-inclusief is hier de
  // veilige kant.
  const marge = 5000;
  const ruim: Rechthoek = {
    xmin: vak.xmin - marge,
    ymin: vak.ymin - marge,
    xmax: vak.xmax + marge,
    ymax: vak.ymax + marge,
  };
  try {
    for (const f of await bevraagVlak("bestuurlijkegebieden:Gemeentegebied", ruim, "buurgemeenten opzoeken")) {
      const p = f.properties ?? {};
      const naam = tekst(p.naam);
      const id = tekst(p.identificatie);
      if (!naam || (id && eigenCodes.has(id))) continue;
      if (organen.some((o) => o.naam === naam)) continue;
      organen.push({ bestuurslaag: "buurgemeente", naam, code: id ?? tekst(p.code) });
    }
  } catch (e) {
    waarschuwingen.push(`Buurgemeenten niet opgehaald: ${(e as Error).message}`);
  }

  // ── Waterschap ──
  //
  // Deze bron heeft geen WFS, alleen WMS GetFeatureInfo. Dus een prik op het
  // midden van het invloedsgebied in plaats van een vlakbevraging.
  try {
    const cx = Math.round((vak.xmin + vak.xmax) / 2);
    const cy = Math.round((vak.ymin + vak.ymax) / 2);
    const d = 200;
    const params = new URLSearchParams({
      SERVICE: "WMS",
      VERSION: "1.3.0",
      REQUEST: "GetFeatureInfo",
      LAYERS: "waterschap",
      QUERY_LAYERS: "waterschap",
      CRS: "EPSG:28992",
      BBOX: `${cx - d},${cy - d},${cx + d},${cy + d}`,
      WIDTH: "101",
      HEIGHT: "101",
      I: "50",
      J: "50",
      INFO_FORMAT: "application/json",
      FEATURE_COUNT: "3",
    });
    for (const f of features(await haalJson(`${WATERSCHAP_WMS}?${params}`, "waterschap opzoeken"))) {
      const p = f.properties ?? {};
      const naam = tekst(p.waterbeheerder) ?? tekst(p.naam);
      if (!naam || organen.some((o) => o.naam === naam)) continue;
      organen.push({
        bestuurslaag: "waterschap",
        naam,
        code: tekst(p.waterbeheerdercode),
      });
    }
  } catch (e) {
    waarschuwingen.push(`Waterschap niet opgehaald: ${(e as Error).message}`);
  }

  return { organen, waarschuwingen };
}
