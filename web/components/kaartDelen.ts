// Gedeelde kaart-bouwstenen voor de kijk-pagina (KaartWeergave) en de
// invoerpagina (Kaart): kleuren, groepen, PDOK-lagen en geometrie-tekenwerk.
// Eén bron, zodat beide pagina's dezelfde taal spreken en er geen kopie van
// het kaartwerk ontstaat.
import { labelPunt3857 } from "@/lib/geo";

export type KaartObject = {
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
  // Oppervlakte in m² (kadastrale registratie, anders kenmerken) — voor
  // optelsommen over een selectie.
  oppervlakteM2Som?: number;
  // Uit de kadastrale registratie (stap 1): álle gekoppelde perceel-vormen
  // en een leesbaar label ("kadastraal: Baarn C 1562, C 1129").
  geoms?: unknown[];
  // Aanduiding per vorm, in dezelfde volgorde als geoms — voor de gerichte
  // tooltip per vlak.
  geomAanduidingen?: string[];
  kadastraal?: string | null;
  // "AI · 12 jul" of "handmatig · 30 jul" — waar komt dit object vandaan?
  herkomstLabel?: string | null;
  // Gebouw ↔ beheerperceel (Hugo: PrimairBeheerperceelID): op welk
  // beheerperceel staat dit gebouw? Eén primair perceel per gebouw.
  staatOp?: string | null;
  staatOpId?: string | null;
  // Gebouwen-cluster: een bijgebouw (schuur, stal) hangt onder zijn
  // hoofdgebouw via stamobject.bovenliggend_id.
  hoortBij?: string | null;
  hoortBijId?: string | null;
  // De gekoppelde kadastrale percelen (voor deelgebruik en splitsen).
  kadDelen?: {
    perceelId: string;
    aanduiding: string;
    dekking: string;
    gesplitst: boolean;
  }[];
};

export function objectDetails(o: KaartObject): string {
  const isGebouw = GEBOUW_CATS.has(o.categorie);
  const delen = isGebouw
    ? [
        o.gebruik,
        o.adres,
        o.oppervlakteM2 ? `${o.oppervlakteM2} m²` : null,
        o.pandstatus,
        o.bouwjaar ? `bouwjaar ${o.bouwjaar}` : null,
        o.staatOp ? `staat op beheerperceel ${o.staatOp}` : null,
        o.hoortBij ? `hoort bij ${o.hoortBij}` : null,
      ]
    : [
        o.gebruik,
        o.oppervlakteHa,
        o.kadastraal ?? "nog geen percelen gekoppeld",
      ];
  return [o.categorie, ...delen, o.herkomstLabel].filter(Boolean).join(" · ");
}

// BRT-Achtergrondkaart: zelfde bron, twee smaken. Op "grijs" springen de
// gebruikskleuren van de beheerpercelen er veel duidelijker uit.
export const PDOK_TILES = (variant: "standaard" | "grijs") =>
  `https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/${variant}/EPSG:3857/{z}/{x}/{y}.png`;
export const KADASTER_WMS =
  "https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0";
export const BAG_WMS = "https://service.pdok.nl/lv/bag/wms/v2_0";
export const NATURA2000_WMS =
  "https://service.pdok.nl/rvo/natura2000/wms/v1_0";
export const NNN_WMS =
  "https://service.pdok.nl/provincies/natuurnetwerk-nederland/wms/v1_0";

export const GEBOUW_CATS = new Set(["gebouw", "woning", "opstal"]);
export const PERCEEL_CATS = new Set(["pachtperceel"]);

// Kleur = gebruik: de kaart vertelt in één oogopslag wat er met de grond
// gebeurt (zelfde taal als de oppervlakteverdeling op het profiel). De eenheid
// van een beheerperceel zie je door eroverheen te bewegen: alle vlakken van
// dat beheerperceel lichten samen op. Rood en amber zijn gereserveerd
// (aangeklikt gebouw / indeel-selectie) en zitten niet in dit palet.
export const GEBRUIK_KLEUR: Record<string, string> = {
  Natuur: "#2F7D4F",
  Agrarisch: "#C9A227",
  Wonen: "#B0574F",
  Bedrijf: "#8A5A2B",
  Water: "#3B82C4",
  Recreatie: "#7B4FA0",
  Maatschappelijk: "#4A8A8A",
};
export const KLEUR_GEEN_GEBRUIK = "#64748b";
export function kleurVoorGebruik(gebruik: string | null): string {
  return GEBRUIK_KLEUR[gebruik ?? ""] ?? KLEUR_GEEN_GEBRUIK;
}

// Eerst de grond-groepen (de beheerpercelen, per gebruik), dan pas de
// gebouwen: "de grond, en dan wat erop staat" — zelfde denklaag als de kaart.
export const KAARTGROEP_LABELS = [
  "Wonen",
  "Agrarisch",
  "Natuur",
  "Recreatie",
  "Werken",
  "Infrastructuur",
  "Water & Klimaat",
  "Overig",
  "Gebouwen",
] as const;

export type KaartGroepLabel = (typeof KAARTGROEP_LABELS)[number];

// Bepaalt de groep op basis van categorie + gebruik.
// Percelen erven hun groep van het gebruik-veld; vaste objectcategorieën
// (gebouwen, infrastructuur, enz.) worden direct ingedeeld.
export function kaartGroep(o: {
  categorie: string;
  gebruik?: string | null;
}): KaartGroepLabel {
  const cat = o.categorie;
  const gebruik = (o.gebruik ?? "").toLowerCase();

  // Vaste objectcategorieën
  if (["gebouw", "woning", "opstal"].includes(cat)) return "Gebouwen";
  if (["natuur", "natuurbeheertype", "onderhoudszone", "boom"].includes(cat)) return "Natuur";
  if (["tuin", "wandelroute", "bomenlaan", "risicoplek"].includes(cat)) return "Recreatie";
  if (["bedrijf", "werken"].includes(cat)) return "Werken";
  if (["infrastructuur", "weg_pad", "brug", "hek", "kabel_leiding", "voorziening"].includes(cat)) return "Infrastructuur";
  if (["water", "waterloop", "vijver_sloot"].includes(cat)) return "Water & Klimaat";

  // Percelen: indeling via gebruik-veld. Een woonperceel is grond en hoort
  // dus onder "Wonen" — niet tussen de gebouwen die erop staan.
  if (cat === "pachtperceel") {
    if (gebruik === "wonen") return "Wonen";
    if (gebruik === "agrarisch") return "Agrarisch";
    if (gebruik === "natuur") return "Natuur";
    if (gebruik === "recreatie") return "Recreatie";
    if (gebruik === "bedrijf") return "Werken";
    if (gebruik === "maatschappelijk") return "Werken";
    if (gebruik === "water") return "Water & Klimaat";
    return "Overig"; // geen gebruik gekozen: grijs op de kaart, dus ook hier neutraal
  }

  return "Overig";
}

// Opties voor een dropdown, gegroepeerd met dezelfde kopjes en volgorde als
// de lijst — zo blijft de kaartpagina overal dezelfde taal spreken.
export function groepeerOpties<
  T extends { categorie: string; gebruik?: string | null },
>(opties: T[]): [KaartGroepLabel, T[]][] {
  const per = new Map<KaartGroepLabel, T[]>(
    KAARTGROEP_LABELS.map((l) => [l, []]),
  );
  for (const o of opties) per.get(kaartGroep(o))!.push(o);
  return KAARTGROEP_LABELS.map(
    (l) => [l, per.get(l)!] as [KaartGroepLabel, T[]],
  ).filter(([, lijst]) => lijst.length > 0);
}

// Ordent de gebouwen-lijst als clusters: elk hoofdgebouw gevolgd door zijn
// bijgebouwen (ingesprongen). Gebouwen zonder cluster blijven gewoon staan.
export function ordenGebouwen<T extends { id: string; hoortBijId?: string | null }>(
  lijst: T[],
): { item: T; ingesprongen: boolean }[] {
  const bijgebouwenVan = new Map<string, T[]>();
  const hoofd: T[] = [];
  for (const g of lijst) {
    if (g.hoortBijId && lijst.some((h) => h.id === g.hoortBijId)) {
      const l = bijgebouwenVan.get(g.hoortBijId) ?? [];
      l.push(g);
      bijgebouwenVan.set(g.hoortBijId, l);
    } else {
      hoofd.push(g);
    }
  }
  const uit: { item: T; ingesprongen: boolean }[] = [];
  for (const h of hoofd) {
    uit.push({ item: h, ingesprongen: false });
    for (const b of bijgebouwenVan.get(h.id) ?? []) {
      uit.push({ item: b, ingesprongen: true });
    }
  }
  return uit;
}

export function haTekst(m2: unknown): string {
  const n = Number(m2);
  if (!Number.isFinite(n)) return "";
  return `${(n / 10000).toLocaleString("nl-NL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ha`;
}

// Kort perceelnummer voor het kaartlabel: "Middelburg S 3193" → "S 3193".
export function kortNummer(aanduiding: string): string {
  const delen = aanduiding.split(" ");
  return delen.length >= 2 ? delen.slice(-2).join(" ") : aanduiding;
}

// Bouwt de kadastrale weergave-laag: alle percelen van het landgoed in een
// herkenbare (huisstijl-groene) tint — zo vallen ze op tussen het omliggende
// kadaster — met het korte perceelnummer als label op een punt dat
// gegarandeerd bínnen het vlak ligt (labelPunt3857; het middelpunt van de
// omtrek valt bij smalle percelen vaak in de buurman).
// werkLabelsBij(map) verbergt labels van percelen die op het scherm te smal
// zijn voor hun eigen nummer (geen overlappende tekstbrij bij uitzoomen);
// aanroepen bij zoomen en bij het tonen van de laag.
export function maakKadastraleLaag(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  L: any,
  percelen: { id: string; aanduiding: string; geom: unknown }[],
  opAanklik?: (id: string) => void,
) {
  const groep = L.layerGroup();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vlakken = new Map<string, any>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const labels: { label: any; poly: any; tekst: string }[] = [];
  for (const p of percelen) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const latlngs = geomNaarLatlngs(L, p.geom) as any;
    if (!latlngs) continue;
    // Paars: een kleur die verder nergens op de kaart voorkomt, zodat de
    // kadastrale weergave niet te verwarren is met groen uit de topografie
    // of de gebruikskleuren.
    const poly = L.polygon(latlngs, {
      color: "#5B21B6",
      weight: 2,
      fillColor: "#8B5CF6",
      fillOpacity: 0.16,
      interactive: Boolean(opAanklik),
    });
    if (opAanklik) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      poly.on("click", (e: any) => {
        if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
        opAanklik(p.id);
      });
    }
    poly.addTo(groep);
    vlakken.set(p.id, poly);

    const punt = labelPunt3857(p.geom);
    if (punt) {
      const tekst = kortNummer(p.aanduiding);
      const label = L.tooltip({
        permanent: true,
        direction: "center",
        className: "kadastraal-label",
      })
        .setLatLng(L.CRS.EPSG3857.unproject(L.point(punt[0], punt[1])))
        .setContent(tekst);
      label.addTo(groep);
      labels.push({ label, poly, tekst });
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const werkLabelsBij = (map: any) => {
    for (const { label, poly, tekst } of labels) {
      const b = poly.getBounds();
      const breedte = Math.abs(
        map.latLngToLayerPoint(b.getNorthEast()).x -
          map.latLngToLayerPoint(b.getSouthWest()).x,
      );
      // Past het nummer (± 7px per teken) niet in het vlak, dan geen label.
      label.setOpacity(breedte > tekst.length * 7 + 12 ? 1 : 0);
    }
  };
  return { groep, vlakken, werkLabelsBij };
}

// Zet een geom (EPSG:3857) om naar Leaflet-latlngs, of null als ongeldig.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function geomNaarLatlngs(L: any, geom: unknown): unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = geom as any;
  if (!g?.coordinates) return null;
  const ring = (rng: number[][]) =>
    rng.map(([x, y]) => L.CRS.EPSG3857.unproject(L.point(x, y)));
  return g.type === "MultiPolygon"
    ? g.coordinates.map((poly: number[][][]) => poly.map(ring))
    : g.coordinates.map(ring);
}
