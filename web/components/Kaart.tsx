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
// Eén bron voor de gebruik-lijsten (gedeeld met de stamgegevenspagina):
// percelen en gebouwen hebben elk hun eigen gebruiksvormen.
import {
  GEBRUIK_OPTIES as GEBRUIK,
  gebruikOptiesVoor,
} from "@/app/(app)/landgoed/[id]/stamgegevens/constanten";
import { merc3857, oppervlakte3857, splitsPolygoon3857 } from "@/lib/geo";

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
  // "AI · 12 jul" of "handmatig · 30 jul" — waar komt dit object vandaan?
  herkomstLabel?: string | null;
  // Gebouw ↔ beheerperceel (Hugo: PrimairBeheerperceelID): op welk
  // beheerperceel staat dit gebouw? Eén primair perceel per gebouw.
  staatOp?: string | null;
  staatOpId?: string | null;
  // De gekoppelde kadastrale percelen (voor deelgebruik en splitsen).
  kadDelen?: {
    perceelId: string;
    aanduiding: string;
    dekking: string;
    gesplitst: boolean;
  }[];
};

function objectDetails(o: PlaatsObject): string {
  const isGebouw = GEBOUW_CATS.has(o.categorie);
  const delen = isGebouw
    ? [
        o.gebruik,
        o.adres,
        o.oppervlakteM2 ? `${o.oppervlakteM2} m²` : null,
        o.pandstatus,
        o.bouwjaar ? `bouwjaar ${o.bouwjaar}` : null,
        o.staatOp ? `staat op ${o.staatOp}` : null,
      ]
    : [
        o.gebruik,
        o.oppervlakteHa,
        o.kadastraal ?? "nog geen percelen gekoppeld",
      ];
  return [o.categorie, ...delen, o.herkomstLabel].filter(Boolean).join(" · ");
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
// "bekijk" is de veilige standaard: klikken op de kaart doet dan niets.
// "basis" (landgoed-locatie aanwijzen) is een eenmalige actie en zit bewust
// niet meer tussen de hoofdmodi — bereikbaar via een aparte knop/link.
type Mode = "bekijk" | "basis" | "perceel" | "indelen" | "gebouw";

// Eén kadastraal perceel uit het bezit-register (fase 1), met indeel-status
// en bij welke beheerpercelen het hoort (voor deelgebruik en kaart→lijst).
type BezitPerceel = {
  ingedeeldBij: { id: string; naam: string }[];
  id: string;
  aanduiding: string;
  oppervlakteHa: string | null;
  geom: unknown;
  ingedeeld: boolean;
};

// BRT-Achtergrondkaart: zelfde bron, twee smaken. Op "grijs" springen de
// gebruikskleuren van de beheerpercelen er veel duidelijker uit.
const PDOK_TILES = (variant: "standaard" | "grijs") =>
  `https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/${variant}/EPSG:3857/{z}/{x}/{y}.png`;
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

const GEBOUW_CATS = new Set(["gebouw", "woning", "opstal"]);
const PERCEEL_CATS = new Set(["pachtperceel"]);

// Kleur = gebruik: de kaart vertelt in één oogopslag wat er met de grond
// gebeurt (zelfde taal als de oppervlakteverdeling op het profiel). De eenheid
// van een beheerperceel zie je door eroverheen te bewegen: alle vlakken van
// dat beheerperceel lichten samen op. Rood en amber zijn gereserveerd
// (aangeklikt gebouw / indeel-selectie) en zitten niet in dit palet.
const GEBRUIK_KLEUR: Record<string, string> = {
  Natuur: "#2F7D4F",
  Agrarisch: "#C9A227",
  Wonen: "#B0574F",
  Bedrijf: "#8A5A2B",
  Water: "#3B82C4",
  Recreatie: "#7B4FA0",
  Maatschappelijk: "#4A8A8A",
};
const KLEUR_GEEN_GEBRUIK = "#64748b";
function kleurVoorGebruik(gebruik: string | null): string {
  return GEBRUIK_KLEUR[gebruik ?? ""] ?? KLEUR_GEEN_GEBRUIK;
}

// Eerst de grond-groepen (de beheerpercelen, per gebruik), dan pas de
// gebouwen: "de grond, en dan wat erop staat" — zelfde denklaag als de kaart.
const KAARTGROEP_LABELS = [
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

// Tekent de rode selectierand om één of meer vlakken (geoms in EPSG:3857) —
// een beheerperceel kan uit meerdere kadastrale vormen bestaan en die horen
// dan állemaal op te lichten. Geeft de gezamenlijke bounds terug (of null).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tekenRand(L: any, map: LMap, ref: { current: any }, geoms: unknown[]) {
  if (ref.current) {
    ref.current.remove();
    ref.current = null;
  }
  const groep = L.layerGroup();
  const bounds = L.latLngBounds([]);
  let getekend = false;
  for (const geom of geoms) {
    const latlngs = geomNaarLatlngs(L, geom);
    if (!latlngs) continue;
    const poly = L.polygon(latlngs, {
      color: "#dc2626",
      weight: 2,
      fillColor: "#dc2626",
      fillOpacity: 0.12,
    });
    poly.addTo(groep);
    bounds.extend(poly.getBounds());
    getekend = true;
  }
  if (!getekend) return null;
  groep.addTo(map);
  ref.current = groep;
  return bounds;
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
  bezit,
  registreerBezit,
  verwijderBezit,
  deelPercelenIn,
  wijzigBeheerperceel,
  koppelGebouwAanPerceel,
  splitsPerceel,
  wisSplitsing,
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
  bezit: BezitPerceel[];
  registreerBezit: (
    landgoedId: string,
    kenmerken: Record<string, unknown>,
  ) => Promise<{ status: "toegevoegd" | "bestond" | "onbruikbaar"; aanduiding: string }>;
  verwijderBezit: (fd: FormData) => Promise<void>;
  deelPercelenIn: (fd: FormData) => Promise<void>;
  wijzigBeheerperceel: (fd: FormData) => Promise<void>;
  koppelGebouwAanPerceel: (fd: FormData) => Promise<void>;
  splitsPerceel: (fd: FormData) => Promise<void>;
  wisSplitsing: (fd: FormData) => Promise<void>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const tempRef = useRef<CircleMarker | null>(null);
  const kadRef = useRef<TileLayer | null>(null);
  const bagRef = useRef<TileLayer | null>(null);
  const achtergrondRef = useRef<TileLayer | null>(null);
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
  const modeRef = useRef<Mode>("bekijk");
  // Alle getekende vlakken per object-id, met hun basisstijl — zodat de
  // spotlight-selectie stijlen kan aanpassen én weer kan herstellen.
  const vlakkenRef = useRef<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Map<string, { poly: any; basis: { weight: number; fillOpacity: number } }[]>
  >(new Map());
  const geselecteerdRef = useRef<string | null>(null);

  const [mode, setMode] = useState<Mode>("bekijk");
  const [toonNatura, setToonNatura] = useState(false);
  const [toonNnn, setToonNnn] = useState(false);
  const [grijzeKaart, setGrijzeKaart] = useState(false);
  const [punt, setPunt] = useState<{ lat: number; lon: number } | null>(null);
  const [basis, setBasis] = useState<Basis>(LEEG);
  const [resultaat, setResultaat] = useState<Resultaat | null>(null);
  // Fase 1/2: laatste bezit-melding + de indeel-selectie (perceel-ids).
  const [melding, setMelding] = useState<string | null>(null);
  const [selectie, setSelectie] = useState<string[]>([]);
  // Beheerperceel waarvan het wijzig-formulier (naam/gebruik) openstaat.
  const [wijzigId, setWijzigId] = useState<string | null>(null);
  const [koppelGebouwId, setKoppelGebouwId] = useState<string | null>(null);
  // Splitslijn-flow: welk kadastraal perceel wordt gesplitst, de getekende
  // lijnpunten, de geknipte delen en per deel het gekozen beheerperceel.
  const [splitsing, setSplitsing] = useState<{
    perceelId: string;
    aanduiding: string;
  } | null>(null);
  const [lijn, setLijn] = useState<[number, number][]>([]);
  const [delen, setDelen] = useState<{ geom: unknown }[] | null>(null);
  const [toewijzing, setToewijzing] = useState<string[]>([]);
  const splitsingRef = useRef<string | null>(null);
  const delenKlaarRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lijnRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delenLaagRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bezitLaagRef = useRef<any>(null);
  const bezitRef = useRef<BezitPerceel[]>(bezit);
  bezitRef.current = bezit;
  // Klik-arbitrage: als een perceel-vlak de klik afhandelt, moet de kaart-klik
  // (die eronder óók afgaat) niets doen — anders verwijdert het vlak zichzelf
  // en registreert de kaart-lookup het perceel direct opnieuw. stopPropagation
  // is hiervoor niet in elke renderer betrouwbaar; deze vlag wel.
  const laagKlikRef = useRef(false);
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
  // Spotlight-selectie: het gekozen object blijft in zijn eigen gebruikskleur
  // maar vol aan; al het andere vervaagt. Zo is "wat hoort erbij" altijd
  // leesbaar, ook als de gebruikskleur zelf op rood lijkt (Wonen).
  function spotlight(id: string | null) {
    for (const [oid, vlakken] of vlakkenRef.current) {
      for (const { poly, basis } of vlakken) {
        if (id === null) poly.setStyle({ opacity: 1, ...basis });
        else if (oid === id)
          poly.setStyle({ opacity: 1, weight: 4.5, fillOpacity: 0.6 });
        else poly.setStyle({ opacity: 0.25, weight: 1.5, fillOpacity: 0.05 });
      }
    }
  }

  useEffect(() => {
    geselecteerdRef.current = geselecteerd;
    spotlight(geselecteerd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geselecteerd]);

  // Kaart → lijst: klik in bekijk-modus op een vlak en de lijst springt naar
  // de bijbehorende rij (de omgekeerde richting van selecteer()). Nogmaals
  // klikken heft de selectie weer op.
  function toonInLijst(id: string) {
    // Tijdens het splitsen tekent elke kaartklik de lijn (via de map-handler).
    if (splitsingRef.current) return;
    if (modeRef.current !== "bekijk") return;
    // De kaart-klik eronder mag deze selectie niet direct weer wissen.
    laagKlikRef.current = true;
    if (geselecteerdRef.current === id) {
      setGeselecteerd(null);
      return;
    }
    setGeselecteerd(id);
    document
      .getElementById(`obj-rij-${id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function tekenOverzicht() {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (overzichtRef.current) {
      overzichtRef.current.remove();
      overzichtRef.current = null;
    }
    boundsRef.current = null;
    vlakkenRef.current = new Map();
    const groep = L.layerGroup();
    const bounds = L.latLngBounds([]);
    for (const o of objecten) {
      if (PERCEEL_CATS.has(o.categorie)) {
        // Alle gekoppelde kadastrale vormen tekenen (één beheerperceel kan er
        // meerdere hebben). Kleur = gebruik; beweeg je over één vlak, dan
        // lichten álle vlakken van dat beheerperceel samen op (de eenheid).
        const kleur = kleurVoorGebruik(o.gebruik);
        const vormen = o.geoms?.length ? o.geoms : [o.geom];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const eenheid: any[] = [];
        let getekend = false;
        for (const vorm of vormen) {
          const latlngs = geomNaarLatlngs(L, vorm);
          if (!latlngs) continue;
          const poly = L.polygon(latlngs, {
            color: kleur,
            weight: 2.5,
            fillColor: kleur,
            fillOpacity: 0.25,
          });
          poly.bindTooltip(
            `${o.naam}${o.gebruik ? ` · ${o.gebruik}` : ""}${o.kadastraal ? ` · ${o.kadastraal}` : ""}`,
            { sticky: true },
          );
          // Hover-oplichten alleen zolang er geen spotlight-selectie actief is.
          poly.on("mouseover", () => {
            if (geselecteerdRef.current) return;
            for (const p of eenheid) p.setStyle({ weight: 4.5, fillOpacity: 0.45 });
          });
          poly.on("mouseout", () => {
            if (geselecteerdRef.current) return;
            for (const p of eenheid) p.setStyle({ weight: 2.5, fillOpacity: 0.25 });
          });
          poly.on("click", () => toonInLijst(o.id));
          eenheid.push(poly);
          poly.addTo(groep);
          bounds.extend(poly.getBounds());
          getekend = true;
        }
        if (getekend) {
          vlakkenRef.current.set(
            o.id,
            eenheid.map((p) => ({
              poly: p,
              basis: { weight: 2.5, fillOpacity: 0.25 },
            })),
          );
          continue;
        }
      }
      // Gebouwen (en andere objecten met een vorm): teken de echte contour,
      // gekleurd naar gebruik — dan zie je in één oogopslag welke panden
      // geregistreerd zijn. Panden zijn klein, dus wat meer vulling.
      const contour = geomNaarLatlngs(L, o.geom);
      if (contour) {
        const kleur = kleurVoorGebruik(o.gebruik);
        const poly = L.polygon(contour, {
          color: kleur,
          weight: 2,
          fillColor: kleur,
          fillOpacity: 0.45,
        });
        poly.bindTooltip(
          `${o.naam}${o.gebruik ? ` · ${o.gebruik}` : ""}`,
          { sticky: true },
        );
        poly.on("click", () => toonInLijst(o.id));
        poly.addTo(groep);
        bounds.extend(poly.getBounds());
        vlakkenRef.current.set(o.id, [
          { poly, basis: { weight: 2, fillOpacity: 0.45 } },
        ]);
        continue;
      }
      // Terugval: geen contour bekend, dan een stip op het opgeslagen punt.
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
    // Na een herteken (bv. na wijzigen) de actieve spotlight opnieuw toepassen.
    spotlight(geselecteerdRef.current);
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
    // De indeel-selectie blijft staan bij het BINNENKOMEN van de indeel-modus
    // (een lijstklik schakelt daarheen mét selectie); bij het verlaten wist hij.
    if (mode !== "indelen") setSelectie([]);
    // De splitslijn-flow leeft alleen in de bekijk-modus.
    if (mode !== "bekijk") setSplitsing(null);
    setMelding(null);
    wisHighlights();
    // In bekijk-modus: toon het hele landgoed i.p.v. handmatig inzoomen.
    if (mode === "bekijk") zoomNaarLandgoed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Splitslijn-flow: bij starten inzoomen op het perceel, bij stoppen alles
  // opruimen. (Na de modus-effect gedeclareerd, zodat deze zoom wint.)
  useEffect(() => {
    splitsingRef.current = splitsing ? splitsing.perceelId : null;
    setLijn([]);
    setDelen(null);
    setToewijzing([]);
    if (!splitsing) return;
    const L = LRef.current;
    const map = mapRef.current;
    const p = bezit.find((b) => b.id === splitsing.perceelId);
    if (L && map && p) {
      const latlngs = geomNaarLatlngs(L, p.geom);
      if (latlngs) {
        map.fitBounds(L.polygon(latlngs).getBounds(), { padding: [80, 80] });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitsing]);

  // De getekende splitslijn op de kaart bijhouden.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (lijnRef.current) {
      lijnRef.current.remove();
      lijnRef.current = null;
    }
    if (lijn.length) {
      lijnRef.current = L.polyline(lijn, {
        color: "#111827",
        weight: 2.5,
        dashArray: "6 4",
      }).addTo(map);
    }
  }, [lijn]);

  // Voorbeeld van de geknipte delen, gekleurd naar het gekozen beheerperceel.
  useEffect(() => {
    delenKlaarRef.current = !!delen;
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (delenLaagRef.current) {
      delenLaagRef.current.remove();
      delenLaagRef.current = null;
    }
    if (!delen) return;
    const groep = L.layerGroup();
    delen.forEach((d, i) => {
      const eigenaar = objecten.find((o) => o.id === toewijzing[i]);
      const kleur = kleurVoorGebruik(eigenaar?.gebruik ?? null);
      const latlngs = geomNaarLatlngs(L, d.geom);
      if (!latlngs) return;
      L.polygon(latlngs, {
        color: kleur,
        weight: 3,
        fillColor: kleur,
        fillOpacity: 0.5,
      })
        .bindTooltip(`Deel ${i + 1}${eigenaar ? ` → ${eigenaar.naam}` : ""}`, {
          sticky: true,
        })
        .addTo(groep);
    });
    groep.addTo(map);
    delenLaagRef.current = groep;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delen, toewijzing]);

  // Knip het perceel langs de getekende lijn en zet de toewijzing klaar.
  function knip() {
    if (!splitsing) return;
    const p = bezit.find((b) => b.id === splitsing.perceelId);
    if (!p) return;
    const lijn3857 = lijn.map(([lat, lng]) => merc3857(lng, lat));
    const parts = splitsPolygoon3857(p.geom, lijn3857);
    if (parts.length < 2) {
      setMelding(
        "De lijn doorsnijdt het perceel niet — begin en eindig búiten het perceel en probeer opnieuw.",
      );
      setLijn([]);
      return;
    }
    setMelding(null);
    const eigenaren = splitsEigenaren();
    setDelen(parts.map((geom) => ({ geom })));
    setToewijzing(parts.map((_, i) => eigenaren[i]?.id ?? ""));
  }

  // De beheerpercelen die dit kadastrale perceel delen (de toewijs-opties).
  function splitsEigenaren(): PlaatsObject[] {
    if (!splitsing) return [];
    return objecten.filter((o) =>
      o.kadDelen?.some((d) => d.perceelId === splitsing.perceelId),
    );
  }

  async function slaSplitsingOp() {
    if (!splitsing || !delen) return;
    // Meerdere delen naar hetzelfde beheerperceel mag: die vormen samen een
    // MultiPolygon. Er moeten wel minstens twee beheerpercelen gekozen zijn.
    const perEigenaar = new Map<string, unknown[]>();
    delen.forEach((d, i) => {
      const eigenaar = toewijzing[i];
      if (!eigenaar) return;
      const lijst = perEigenaar.get(eigenaar) ?? [];
      lijst.push(d.geom);
      perEigenaar.set(eigenaar, lijst);
    });
    if (perEigenaar.size < 2) {
      setMelding("Wijs de delen aan minstens twee verschillende beheerpercelen toe.");
      return;
    }
    const payload = [...perEigenaar.entries()].map(([stamobject_id, geoms]) => ({
      stamobject_id,
      geom:
        geoms.length === 1
          ? geoms[0]
          : {
              type: "MultiPolygon",
              coordinates: geoms.map(
                (g) => (g as { coordinates: unknown }).coordinates,
              ),
            },
    }));
    const fd = new FormData();
    fd.set("landgoed_id", landgoedId);
    fd.set("perceel_id", splitsing.perceelId);
    fd.set("delen", JSON.stringify(payload));
    const aanduiding = splitsing.aanduiding;
    await splitsPerceel(fd);
    setSplitsing(null);
    setMelding(`Splitsing van ${aanduiding} opgeslagen.`);
  }

  // (Her)teken de overzichtslaag wanneer de objecten wijzigen (na toevoegen/
  // verwijderen). Daarna óók de bezit-laag opnieuw, zodat die altijd bovenop
  // ligt — anders vangen beheer-vlakken de klikken van grijze percelen af.
  useEffect(() => {
    tekenOverzicht();
    tekenBezit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objecten]);

  // Tekent het bezit-register: nog in te delen percelen grijs gestippeld,
  // ingedeelde percelen als vrijwel onzichtbare klik-laag (hun kleur komt van
  // het beheerperceel eronder), selectie in amber. Klikgedrag volgt de modus.
  function tekenBezit() {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (bezitLaagRef.current) {
      bezitLaagRef.current.remove();
      bezitLaagRef.current = null;
    }
    const groep = L.layerGroup();
    for (const p of bezit) {
      const latlngs = geomNaarLatlngs(L, p.geom);
      if (!latlngs) continue;
      const geselecteerd = selectie.includes(p.id);
      // Ingedeelde percelen zijn in de bekijk-modus niet-interactief: klik en
      // hover vallen dan door naar het gekleurde beheerperceel eronder
      // (tooltip, spotlight, kaart-naar-lijst). In de invoer-modi zijn ze wél
      // aanklikbaar — voor de "al ingedeeld"-melding en voor deelgebruik.
      const invoerModus = mode === "indelen" || mode === "perceel";
      const poly = L.polygon(
        latlngs,
        geselecteerd
          ? { color: "#d97706", weight: 3, fillColor: "#d97706", fillOpacity: 0.3 }
          : p.ingedeeld
            ? { interactive: invoerModus, weight: 0, opacity: 0, fillColor: "#6b7280", fillOpacity: 0.02 }
            : { color: "#6b7280", weight: 2, dashArray: "6 4", fillColor: "#9ca3af", fillOpacity: 0.15 },
      );
      if (!p.ingedeeld || geselecteerd || invoerModus) {
        const bij = p.ingedeeldBij.map((b) => b.naam).join(", ");
        poly.bindTooltip(
          p.ingedeeld
            ? `${p.aanduiding} · ingedeeld bij ${bij}${mode === "indelen" ? " — klik voor deelgebruik" : ""}`
            : `${p.aanduiding} · nog in te delen`,
          { sticky: true },
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      poly.on("click", async (e: any) => {
        const m = modeRef.current;
        // Alleen in de modi waar het vlak de klik zelf afhandelt de kaart-klik
        // onderdrukken; in de basis-modus moet een klik óp een perceel gewoon
        // de landgoed-locatie kunnen zetten.
        if (m === "perceel" || m === "indelen") {
          laagKlikRef.current = true;
          if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
        }
        if (m === "indelen") {
          // Deelgebruik: een al ingedeeld perceel mag óók bij dit (nieuwe)
          // beheerperceel — na een expliciete bevestiging. Beide koppelingen
          // worden dan dekking 'gedeeltelijk'.
          if (p.ingedeeld && !selectie.includes(p.id)) {
            const bij = p.ingedeeldBij.map((b) => b.naam).join(", ");
            if (
              !window.confirm(
                `${p.aanduiding} is al ingedeeld bij ${bij}. Ook koppelen aan dit beheerperceel (deelgebruik)? Het perceel telt dan bij beide als gedeeld.`,
              )
            )
              return;
          }
          setSelectie((prev) =>
            prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id],
          );
        } else if (m === "perceel") {
          if (p.ingedeeld) {
            setMelding(`${p.aanduiding} is al ingedeeld bij een beheerperceel.`);
            return;
          }
          if (!window.confirm(`${p.aanduiding} uit het bezit verwijderen?`)) {
            setMelding(null);
            return;
          }
          const fd = new FormData();
          fd.set("landgoed_id", landgoedId);
          fd.set("perceel_id", p.id);
          await verwijderBezit(fd);
          setMelding(`${p.aanduiding} verwijderd uit het bezit.`);
        }
      });
      poly.addTo(groep);
    }
    groep.addTo(map);
    bezitLaagRef.current = groep;
  }

  useEffect(() => {
    tekenBezit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bezit, selectie, mode]);

  // Selecteer een bezit-perceel vanuit de lijst: schakel naar de indeel-modus,
  // wissel de selectie en zoom ernaartoe (als het een vorm heeft).
  function selecteerBezit(p: BezitPerceel) {
    if (p.ingedeeld) return;
    setMode("indelen");
    setSelectie((prev) =>
      prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id],
    );
    const L = LRef.current;
    const map = mapRef.current;
    if (L && map) {
      const latlngs = geomNaarLatlngs(L, p.geom);
      if (latlngs) {
        map.fitBounds(L.polygon(latlngs).getBounds(), { padding: [60, 60], maxZoom: 17 });
      }
    }
  }

  // Ondergrond wisselen tussen kleur en grijs (zelfde PDOK-bron, andere smaak).
  useEffect(() => {
    achtergrondRef.current?.setUrl(PDOK_TILES(grijzeKaart ? "grijs" : "standaard"));
  }, [grijzeKaart]);

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
      achtergrondRef.current = L.tileLayer(PDOK_TILES("standaard"), {
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
        opacity: 0.8,
        maxZoom: 19,
        attribution: "© Natuurnetwerk Nederland / Provincies (PDOK)",
      });
      LRef.current = L;
      mapRef.current = map;

      // Toon bij laden alle aangevinkte percelen en zoom in op het landgoed.
      tekenOverzicht();
      tekenBezit();
      zoomNaarLandgoed();

      map.on("click", async (e: LeafletMouseEvent) => {
        // Splitslijn tekenen: elke klik is een lijnpunt (tot er geknipt is).
        if (splitsingRef.current) {
          laagKlikRef.current = false;
          if (!delenKlaarRef.current) {
            setLijn((prev) => [...prev, [e.latlng.lat, e.latlng.lng]]);
          }
          return;
        }
        // Heeft een perceel-vlak deze klik al afgehandeld? Dan niets doen —
        // anders zou de lookup het zojuist verwijderde perceel direct opnieuw
        // registreren (of een selectie-klik als nieuwe registratie behandelen).
        if (laagKlikRef.current) {
          laagKlikRef.current = false;
          return;
        }
        const lat = e.latlng.lat;
        const lon = e.latlng.lng;
        const m = modeRef.current;
        // Bekijk-modus: klik naast de vlakken heft de spotlight-selectie op.
        if (m === "bekijk") {
          setGeselecteerd(null);
          return;
        }
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
        } else if (m === "perceel") {
          // Fase 1 — bezit inladen: klik = direct registreren, geen formulier.
          const r = await lookupPerceel(lat, lon);
          setResultaat(null);
          setPunt(null);
          if (r) {
            const res = await registreerBezit(landgoedId, {
              ...r.kenmerken,
              geom_3857: r.geom,
            });
            setMelding(
              res.status === "toegevoegd"
                ? `${res.aanduiding} toegevoegd aan het bezit.`
                : res.status === "bestond"
                  ? `${res.aanduiding} stond al in het bezit.`
                  : "Geen bruikbaar perceel gevonden op dit punt.",
            );
          } else {
            setMelding("Geen perceel gevonden op dit punt.");
          }
          if (tempRef.current) {
            tempRef.current.remove();
            tempRef.current = null;
          }
        } else if (m === "indelen") {
          // Selecteren gaat via klikken op de getekende percelen zelf.
          setPunt(null);
          setMelding("Klik op een perceel (grijs gestippeld = nog in te delen).");
          if (tempRef.current) {
            tempRef.current.remove();
            tempRef.current = null;
          }
        } else {
          const r = await lookupGebouw(lat, lon);
          setResultaat(r ? { ...r, soort: "gebouw" } : null);
          tekenRand(L, map, randRef, r?.geom ? [r.geom] : []);
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

  function selecteer(o: PlaatsObject) {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    // Nogmaals klikken op de al geselecteerde rij heft de selectie op.
    if (geselecteerd === o.id) {
      setGeselecteerd(null);
      return;
    }
    setGeselecteerd(o.id);
    setPunt(null);
    setResultaat(null);
    wisHighlights();

    // Object met getekende vlakken (beheerperceel of pandcontour): inzoomen op
    // het geheel; het oplichten doet de spotlight (geen rode rand meer — die
    // botste met de gebruikskleur van Wonen).
    const vlakken = vlakkenRef.current.get(o.id);
    if (vlakken?.length) {
      const bounds = L.latLngBounds([]);
      for (const { poly } of vlakken) bounds.extend(poly.getBounds());
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 17 });
      return;
    }

    // Terugval voor objecten zonder vorm: markeer het opgeslagen punt.
    if (!Number.isFinite(o.lat) || !Number.isFinite(o.lon)) return;
    map.setView([o.lat, o.lon], 16);
    tempRef.current = L.circleMarker([o.lat, o.lon], {
      radius: 8,
      color: "#1B3A28",
      fillColor: "#2A5C3F",
      fillOpacity: 0.9,
      weight: 2,
    }).addTo(map);
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
            ["bekijk", "Bekijken"],
            ["perceel", "1 · Bezit inladen"],
            ["indelen", "2 · Percelen indelen"],
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
            checked={grijzeKaart}
            onChange={(e) => setGrijzeKaart(e.target.checked)}
          />
          Grijze ondergrond
        </label>
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
        {basisIngesteld && mode !== "basis" && (
          <button
            type="button"
            className="text-[12.5px] underline"
            style={{ color: "var(--text-2)" }}
            onClick={() => setMode("basis")}
          >
            landgoed-locatie wijzigen
          </button>
        )}
      </div>

      {/* Eenmalige instap: zonder basislocatie eerst de locatie aanwijzen */}
      {!basisIngesteld && mode !== "basis" && (
        <div className="card flex flex-wrap items-center gap-3 p-4">
          <p className="flex-1 text-[13px]" style={{ color: "var(--text-2)" }}>
            Er is nog geen landgoed-locatie ingesteld — dat is de eenmalige eerste stap
            (nodig voor o.a. de monumenten- en gebiedschecks).
          </p>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setMode("basis")}>
            Stel de landgoed-locatie in
          </button>
        </div>
      )}

      <p className="text-[12px]" style={{ color: "var(--text-3)" }}>
        {mode === "bekijk"
          ? "Bekijk-modus: klikken op de kaart doet niets. Kies een invoer-modus om percelen of gebouwen toe te voegen."
          : mode === "basis"
          ? basisIngesteld
            ? "Klik op de kaart om de landgoed-locatie te wijzigen."
            : "Klik op de hoofdlocatie van het landgoed; adres/gemeente/provincie wordt opgezocht."
          : mode === "perceel"
            ? "Klik-klik-klik: elk aangeklikt perceel gaat direct het bezit in (PDOK Kadaster). Nogmaals klikken op een grijs perceel verwijdert het weer. Indelen komt daarna."
            : mode === "indelen"
              ? "Selecteer een of meer grijze percelen en maak er samen een beheerperceel van — of voeg ze toe aan een bestaand beheerperceel."
              : "Klik op een gebouw; adres, oppervlakte, pandstatus en monumentstatus (RCE) worden opgehaald."}
      </p>
      {melding && (mode === "perceel" || mode === "indelen" || mode === "bekijk") && (
        <p className="text-[12.5px] font-medium" style={{ color: "var(--text-2)" }}>
          {melding}
        </p>
      )}

      {/* Op groot scherm: lijsten links (scrollen door), kaart rechts (blijft
          in beeld — sticky). Op smal scherm: gestapeld zoals voorheen. */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-4">
        <div className="flex flex-col gap-2 lg:order-2 lg:sticky lg:top-4">
          {/* Splitslijn-paneel: lijn tekenen → knippen → delen toewijzen. */}
          {splitsing && (
            <div className="card p-4 text-[13px]">
              <div className="mb-1 font-semibold">
                Splits {splitsing.aanduiding}
              </div>
              {!delen ? (
                <>
                  <p style={{ color: "var(--text-2)" }}>
                    Klik punten op de kaart om de splitslijn te tekenen — begin
                    en eindig búiten het perceel, zodat de lijn het helemaal
                    doorsnijdt. {lijn.length === 0 ? "Nog geen punten gezet." : `${lijn.length} punt${lijn.length > 1 ? "en" : ""} gezet.`}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={lijn.length < 2}
                      onClick={knip}
                    >
                      Knip
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={!lijn.length}
                      onClick={() => setLijn([])}
                    >
                      Lijn wissen
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setSplitsing(null)}
                    >
                      Annuleer
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ color: "var(--text-2)" }}>
                    {delen.length} delen — wijs elk deel toe aan een
                    beheerperceel (beweeg over de kaart om ze te herkennen):
                  </p>
                  {(() => {
                    const opp = delen.map((d) => oppervlakte3857(d.geom));
                    const totaal = opp.reduce((s, o) => s + o, 0) || 1;
                    return delen.map((d, i) => (
                      <div key={i} className="mt-1.5 flex items-center gap-2">
                        <span className="whitespace-nowrap">
                          Deel {i + 1} (~{Math.round((100 * opp[i]) / totaal)}%)
                        </span>
                        <select
                          className="input"
                          value={toewijzing[i] ?? ""}
                          onChange={(e) =>
                            setToewijzing((prev) => {
                              const kopie = [...prev];
                              kopie[i] = e.target.value;
                              return kopie;
                            })
                          }
                        >
                          <option value="">— kies beheerperceel —</option>
                          {splitsEigenaren().map((eig) => (
                            <option key={eig.id} value={eig.id}>
                              {eig.naam}
                              {eig.gebruik ? ` (${eig.gebruik})` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    ));
                  })()}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={toewijzing.some((t) => !t)}
                      onClick={slaSplitsingOp}
                    >
                      Opslaan
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setDelen(null);
                        setToewijzing([]);
                        setLijn([]);
                      }}
                    >
                      Opnieuw
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setSplitsing(null)}
                    >
                      Annuleer
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          <div
            ref={containerRef}
            className="card h-[480px] overflow-hidden lg:h-[calc(100vh-200px)]"
            style={{ padding: 0 }}
          />

      <p className="text-[11.5px]" style={{ color: "var(--text-3)" }}>
        Kleur = gebruik:{" "}
        {Object.entries(GEBRUIK_KLEUR).map(([naam, kleur]) => (
          <span key={naam} className="mr-2 inline-flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: kleur }}
            />
            {naam}
          </span>
        ))}
        <span className="mr-2 inline-flex items-center gap-1">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: KLEUR_GEEN_GEBRUIK }}
          />
          nog geen gebruik
        </span>
        · beweeg over een vlak om het hele beheerperceel op te laten lichten ·
        klik op een vlak of een rij: de selectie licht op en de rest vervaagt
        (nogmaals klikken heft op) ·{" "}
        <span style={{ color: "#6b7280" }}>grijs gestippeld</span> = nog in te delen ·{" "}
        <span style={{ color: "#d97706" }}>amber</span> = indeel-selectie.
      </p>
        </div>

        {/* Linkerkolom: panelen en lijsten */}
        <div className="flex flex-col gap-3 lg:order-1">

      {/* Indeel-paneel (fase 2) — direct zichtbaar zodra de modus actief is,
          zodat meteen duidelijk is wat hier gebeurt; de maak-knop ontgrendelt
          zodra er percelen geselecteerd zijn. */}
      {mode === "indelen" && (
        <form
          action={async (fd) => {
            const leeg = selectie.length === 0;
            await deelPercelenIn(fd);
            setSelectie([]);
            setKoppelId("");
            setMelding(
              leeg
                ? "Leeg beheerperceel aangemaakt — klik nu percelen aan en kies het bij 'indelen bij'."
                : "Percelen ingedeeld.",
            );
          }}
          className="card flex flex-wrap items-end gap-3 p-4"
        >
          <input type="hidden" name="landgoed_id" value={landgoedId} />
          {selectie.map((pid) => (
            <input key={pid} type="hidden" name="perceel_id" value={pid} />
          ))}
          <div className="min-w-[220px] flex-1">
            <label className="label-up mb-1 block">
              {selectie.length === 0
                ? "Klik percelen aan (kaart of lijst) — of maak alvast een leeg beheerperceel"
                : `${selectie.length} perceel${selectie.length > 1 ? "en" : ""} geselecteerd — indelen bij`}
            </label>
            <select
              className="input"
              name="bestaand_id"
              value={koppelId}
              onChange={(e) => setKoppelId(e.target.value)}
            >
              <option value="">— Nieuw beheerperceel —</option>
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
              <input className="input" name="naam" placeholder="bv. Weiland zuid" required />
            </div>
          )}
          {koppelId === "" && (
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
          )}
          {/* Een nieuw beheerperceel mag ook léég worden aangemaakt (handig
              voor deelgebruik: eerst de bak, dan de percelen erbij). Alleen
              "niets toevoegen aan bestaand" is zinloos en blijft op slot. */}
          <SubmitKnop
            className="btn btn-primary"
            pendingTekst="Indelen…"
            disabled={selectie.length === 0 && koppelId !== ""}
          >
            {koppelId
              ? "Toevoegen aan bestaand"
              : selectie.length === 0
                ? "Leeg beheerperceel maken"
                : "Beheerperceel maken"}
          </SubmitKnop>
          {selectie.length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectie([])}>
              Wis selectie
            </button>
          )}
        </form>
      )}

      {/* Basis-paneel */}
      {mode === "basis" && punt && (
        <form
          action={async (fd) => {
            await setBasisLocatie(fd);
            // Eenmalige actie: na het opslaan terug naar de veilige bekijk-modus.
            setMode("bekijk");
          }}
          className="card p-4"
        >
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

      {/* Plaats-paneel (alleen gebouwen; percelen gaan via bezit inladen + indelen) */}
      {mode === "gebouw" && punt && (
        <form
          action={async (fd) => {
            await plaatsOpKaart(fd);
            // Selectie wissen: het rood ("aangeklikt, nog niet gekoppeld") hoort
            // te verdwijnen zodra het plaatsen/koppelen klaar is.
            setResultaat(null);
            setPunt(null);
            setKoppelId("");
            if (randRef.current) {
              randRef.current.remove();
              randRef.current = null;
            }
            if (tempRef.current) {
              tempRef.current.remove();
              tempRef.current = null;
            }
          }}
          className="card p-4"
        >
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

              {/* Gebruik is een eigenschap van het beheerperceel als geheel —
                  bij koppelen aan een bestaand object dus niet opnieuw kiezen. */}
              {koppelId === "" && (
                <div>
                  <label className="label-up mb-1 block">Gebruik</label>
                  <select className="input" name="gebruik" defaultValue="">
                    <option value="">— kies —</option>
                    {gebruikOptiesVoor(mode === "gebouw" ? "gebouw" : "pachtperceel").map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <SubmitKnop className="btn btn-primary" pendingTekst="Opslaan…">
                {koppelId ? "Koppel & verrijk" : "Plaats"}
              </SubmitKnop>
            </div>
          )}
        </form>
      )}

      {/* Bezit dat nog niet is ingedeeld (werkvoorraad — mag blijven staan) */}
      {bezit.some((p) => !p.ingedeeld) && (
        <div>
          <div className="mb-2 text-[13px] font-semibold">
            Nog in te delen ({bezit.filter((p) => !p.ingedeeld).length})
            <span className="ml-2 font-normal text-[12px]" style={{ color: "var(--text-3)" }}>
              klik een perceel om het te selecteren voor indelen
            </span>
          </div>
          <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
            {bezit
              .filter((p) => !p.ingedeeld)
              .map((p) => {
                const isGeselecteerd = selectie.includes(p.id);
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 px-4 py-2.5"
                    style={{ background: isGeselecteerd ? "#fef3c7" : undefined }}
                  >
                    <button
                      type="button"
                      onClick={() => selecteerBezit(p)}
                      className="flex-1 text-left text-[13.5px] font-medium"
                    >
                      {p.aanduiding}
                      {p.oppervlakteHa && (
                        <span className="font-normal" style={{ color: "var(--text-2)" }}>
                          {" "}· {p.oppervlakteHa}
                        </span>
                      )}
                      {isGeselecteerd && (
                        <span className="font-semibold" style={{ color: "#92400e" }}>
                          {" "}· geselecteerd
                        </span>
                      )}
                    </button>
                    <form action={verwijderBezit}>
                      <input type="hidden" name="landgoed_id" value={landgoedId} />
                      <input type="hidden" name="perceel_id" value={p.id} />
                      <button
                        className="text-[11.5px] hover:underline"
                        style={{ color: "var(--red)" }}
                      >
                        Verwijder
                      </button>
                    </form>
                  </div>
                );
              })}
          </div>
        </div>
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
                        id={`obj-rij-${o.id}`}
                        style={{
                          background:
                            geselecteerd === o.id ? "var(--primary-light)" : undefined,
                        }}
                      >
                        <div className="flex items-center gap-3 py-2.5">
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
                          {/* Zelden gebruikte acties: klein en tekstueel, niet in
                              your face (wens Steven). */}
                          {(PERCEEL_CATS.has(o.categorie) ||
                            GEBOUW_CATS.has(o.categorie)) && (
                            <button
                              type="button"
                              className="text-[11.5px] hover:underline"
                              style={{ color: "var(--text-2)" }}
                              onClick={() =>
                                setWijzigId(wijzigId === o.id ? null : o.id)
                              }
                            >
                              Wijzig
                            </button>
                          )}
                          {GEBOUW_CATS.has(o.categorie) && (
                            <button
                              type="button"
                              className="text-[11.5px] hover:underline"
                              style={{ color: "var(--text-2)" }}
                              onClick={() =>
                                setKoppelGebouwId(koppelGebouwId === o.id ? null : o.id)
                              }
                            >
                              Koppel aan perceel
                            </button>
                          )}
                          <form action={verwijderObject} style={{ color: "var(--red)" }}>
                            <input type="hidden" name="landgoed_id" value={landgoedId} />
                            <input type="hidden" name="id" value={o.id} />
                            {PERCEEL_CATS.has(o.categorie) ? (
                              // Bij een beheerperceel blijft het bezit bestaan: de
                              // kadastrale percelen vallen terug naar "nog in te delen".
                              <VerwijderKnop
                                className="text-[11.5px] hover:underline"
                                vraag={`de indeling "${o.naam}" (de kadastrale percelen blijven in het bezit en worden weer "nog in te delen")`}
                              >
                                Hef indeling op
                              </VerwijderKnop>
                            ) : (
                              <VerwijderKnop
                                className="text-[11.5px] hover:underline"
                                vraag={`"${o.naam}"`}
                              >
                                Verwijder
                              </VerwijderKnop>
                            )}
                          </form>
                        </div>
                        {wijzigId === o.id && (
                          <form
                            action={async (fd) => {
                              await wijzigBeheerperceel(fd);
                              setWijzigId(null);
                            }}
                            className="flex flex-wrap items-end gap-3 pb-3"
                          >
                            <input type="hidden" name="landgoed_id" value={landgoedId} />
                            <input type="hidden" name="id" value={o.id} />
                            <div className="min-w-[180px] flex-1">
                              <label className="label-up mb-1 block">Naam</label>
                              <input
                                className="input"
                                name="naam"
                                defaultValue={o.naam}
                                required
                              />
                            </div>
                            <div>
                              <label className="label-up mb-1 block">Gebruik</label>
                              <select
                                className="input"
                                name="gebruik"
                                defaultValue={o.gebruik ?? ""}
                              >
                                <option value="">— geen —</option>
                                {gebruikOptiesVoor(o.categorie, o.gebruik).map((g) => (
                                  <option key={g} value={g}>
                                    {g}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <SubmitKnop className="btn btn-primary btn-sm" pendingTekst="Opslaan…">
                              Opslaan
                            </SubmitKnop>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => setWijzigId(null)}
                            >
                              Annuleer
                            </button>
                          </form>
                        )}
                        {koppelGebouwId === o.id && (
                          <form
                            action={async (fd) => {
                              await koppelGebouwAanPerceel(fd);
                              setKoppelGebouwId(null);
                            }}
                            className="flex flex-wrap items-end gap-3 pb-3"
                          >
                            <input type="hidden" name="landgoed_id" value={landgoedId} />
                            <input type="hidden" name="gebouw_id" value={o.id} />
                            <div className="min-w-[220px] flex-1">
                              <label className="label-up mb-1 block">
                                Staat op beheerperceel
                              </label>
                              <select
                                className="input"
                                name="perceel_id"
                                defaultValue={o.staatOpId ?? ""}
                              >
                                <option value="">— geen —</option>
                                {objecten
                                  .filter((p) => PERCEEL_CATS.has(p.categorie))
                                  .map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.naam}
                                      {p.gebruik ? ` (${p.gebruik})` : ""}
                                    </option>
                                  ))}
                              </select>
                            </div>
                            <SubmitKnop className="btn btn-primary btn-sm" pendingTekst="Opslaan…">
                              Opslaan
                            </SubmitKnop>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => setKoppelGebouwId(null)}
                            >
                              Annuleer
                            </button>
                          </form>
                        )}
                        {/* Deelgebruik: percelen die dit beheerperceel deelt
                            met een ander kunnen met een lijn gesplitst worden. */}
                        {PERCEEL_CATS.has(o.categorie) &&
                          (o.kadDelen ?? []).some(
                            (d) => d.dekking === "gedeeltelijk",
                          ) && (
                            <div
                              className="flex flex-wrap items-center gap-3 pb-2 text-[11.5px]"
                              style={{ color: "var(--text-2)" }}
                            >
                              {(o.kadDelen ?? [])
                                .filter((d) => d.dekking === "gedeeltelijk")
                                .map((d) =>
                                  d.gesplitst ? (
                                    <form
                                      key={d.perceelId}
                                      action={wisSplitsing}
                                      className="flex items-center gap-1.5"
                                    >
                                      <input type="hidden" name="landgoed_id" value={landgoedId} />
                                      <input type="hidden" name="perceel_id" value={d.perceelId} />
                                      <span>{d.aanduiding} is gesplitst ·</span>
                                      <button className="hover:underline" style={{ color: "var(--red)" }}>
                                        herstel splitsing
                                      </button>
                                    </form>
                                  ) : (
                                    <button
                                      key={d.perceelId}
                                      type="button"
                                      className="hover:underline"
                                      onClick={() => {
                                        setMode("bekijk");
                                        setSplitsing({
                                          perceelId: d.perceelId,
                                          aanduiding: d.aanduiding,
                                        });
                                      }}
                                    >
                                      Splits {d.aanduiding} met een lijn
                                    </button>
                                  ),
                                )}
                            </div>
                          )}
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
      </div>
    </div>
  );
}
