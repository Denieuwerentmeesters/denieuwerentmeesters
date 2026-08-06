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
  BEHEEROBJECT_PRIK_OPTIES,
} from "@/app/(app)/landgoed/[id]/stamgegevens/constanten";
import {
  isZelfkruisend,
  merc3857,
  oppervlakte3857,
  splitsPolygoon3857,
} from "@/lib/geo";
// Gedeelde kaart-bouwstenen (kleuren, groepen, PDOK-lagen, geometrie) — één
// bron voor deze invoerpagina én de kijk-pagina (KaartWeergave).
import {
  type KaartObject,
  objectDetails,
  PDOK_TILES,
  KADASTER_WMS,
  BAG_WMS,
  NATURA2000_WMS,
  NNN_WMS,
  GEBOUW_CATS,
  PERCEEL_CATS,
  GEBRUIK_KLEUR,
  KLEUR_GEEN_GEBRUIK,
  kleurVoorGebruik,
  KAARTGROEP_LABELS,
  type KaartGroepLabel,
  kaartGroep,
  groepeerOpties,
  ordenGebouwen,
  ordenPercelenMetObjecten,
  haTekst,
  geomNaarLatlngs,
  maakKadastraleLaag,
  maakStipIcoon,
} from "@/components/kaartDelen";

type PlaatsObject = KaartObject;

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
type Mode = "bekijk" | "basis" | "perceel" | "indelen" | "gebouw" | "object";

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

const LEEG: Basis = {
  adres: "",
  postcode: "",
  plaats: "",
  gemeente: "",
  provincie: "",
};

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
  plaatsBeheerobject,
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
  ontkoppelPerceel,
  zoekPercelenBinnenOmtrek,
  registreerBezitBinnenOmtrek,
  gebiedsligging,
}: {
  landgoedId: string;
  objecten: PlaatsObject[];
  koppelbaar: { id: string; naam: string; categorie: string; gebruik?: string | null }[];
  basisIngesteld: boolean;
  lat: number | null;
  lon: number | null;
  setBasisLocatie: (fd: FormData) => Promise<void>;
  plaatsOpKaart: (fd: FormData) => Promise<void>;
  plaatsBeheerobject: (
    fd: FormData,
  ) => Promise<{ perceelNaam: string | null } | void>;
  lookupPerceel: (
    lat: number,
    lon: number,
  ) => Promise<LookupResult | "onbereikbaar" | null>;
  lookupGebouw: (
    lat: number,
    lon: number,
  ) => Promise<LookupResult | "onbereikbaar" | null>;
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
  ontkoppelPerceel: (fd: FormData) => Promise<void>;
  zoekPercelenBinnenOmtrek: (
    landgoedId: string,
    omtrek: [number, number][],
  ) => Promise<
    | { status: "ok"; nieuw: number; bestaand: number; afgekapt: boolean }
    | { status: "fout"; melding: string }
  >;
  registreerBezitBinnenOmtrek: (
    landgoedId: string,
    omtrek: [number, number][],
  ) => Promise<
    | { status: "ok"; toegevoegd: number; overgeslagen: number }
    | { status: "fout"; melding: string }
  >;
  // Samenvatting "x van n percelen in Natura 2000 / NNN", of null als er
  // nog nooit gecontroleerd is.
  gebiedsligging?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const tempRef = useRef<CircleMarker | null>(null);
  const kadRef = useRef<TileLayer | null>(null);
  // Volledige kadastrale kaart (grenzen + perceelnummers), alleen zichtbaar
  // in de bezit-laadmodus — dan zie je wáár je moet klikken.
  const perceelWmsRef = useRef<TileLayer | null>(null);
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
  // Kadastrale weergave: de gekleurde beheer-laag maakt plaats voor de clean
  // kadasterkaart met perceelnummers (zelfde laag als op de kijk-pagina).
  const [kadastraalWeergave, setKadastraalWeergave] = useState(false);
  const kadastraalWeergaveRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kadWeergaveLaagRef = useRef<any>(null);
  const werkLabelsBijRef = useRef<(() => void) | null>(null);
  const [punt, setPunt] = useState<{ lat: number; lon: number } | null>(null);
  const [basis, setBasis] = useState<Basis>(LEEG);
  const [resultaat, setResultaat] = useState<Resultaat | null>(null);
  // Fase 1/2: laatste bezit-melding + de indeel-selectie (perceel-ids).
  const [melding, setMelding] = useState<string | null>(null);
  const [selectie, setSelectie] = useState<string[]>([]);
  // Beheerperceel waarvan het wijzig-formulier (naam/gebruik) openstaat.
  const [wijzigId, setWijzigId] = useState<string | null>(null);
  const [koppelGebouwId, setKoppelGebouwId] = useState<string | null>(null);
  // De lijst kent twee tabbladen: grond (beheerpercelen) en gebouwen.
  const [lijstTab, setLijstTab] = useState<"percelen" | "gebouwen">("percelen");
  // In-/uitklappen van onderliggende rijen (objecten onder een beheerperceel,
  // bijgebouwen onder een hoofdgebouw). Standaard ingeklapt — overzicht eerst.
  const [uitgeklapt, setUitgeklapt] = useState<Record<string, boolean>>({});
  function klapOm(id: string) {
    setUitgeklapt((prev) => ({ ...prev, [id]: !prev[id] }));
  }
  // Deelgebruik-knop in het indeel-paneel: pas na een bewuste druk hierop
  // zijn al-ingedeelde percelen aanklikbaar om extra te koppelen.
  const [extraKoppelen, setExtraKoppelen] = useState(false);
  // Splitslijn-flow: welk kadastraal perceel wordt gesplitst, de getekende
  // lijnpunten, de geknipte delen en per deel het gekozen beheerperceel.
  // Bezit-laadmodus kent drie voordeuren; de gekozen methode bepaalt wat een
  // kaartklik doet en welke uitleg het gele kader toont.
  const [bezitMethode, setBezitMethode] = useState<"klikken" | "omtrek">(
    "klikken",
  );
  const omtrekActief = bezitMethode === "omtrek";
  // Tijdens het tekenen is de omtrek een open lijn; sluiten (laatste →
  // eerste punt) is een bewuste stap. Voorkomt het verwarrende "rood en dan
  // weer zwart"-geknipper van een automatisch meesluitende ring.
  const [omtrekGesloten, setOmtrekGesloten] = useState(false);
  const omtrekGeslotenRef = useRef(false);
  const [omtrek, setOmtrek] = useState<[number, number][]>([]);
  const [omtrekResultaat, setOmtrekResultaat] = useState<{
    nieuw: number;
    bestaand: number;
    afgekapt: boolean;
  } | null>(null);
  const [omtrekBezig, setOmtrekBezig] = useState(false);
  const omtrekActiefRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const omtrekLaagRef = useRef<any>(null);
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

  // In de invoer-modi is de zwevende beheer-tooltip ("… behoort bij
  // beheerperceel …") vooral in de weg — die achtervolgt je terwijl je met
  // iets anders bezig bent (wens Steven). De werk-tooltips van de bezit-laag
  // ("nog in te delen") blijven wél zichtbaar; die horen bij die modi.
  useEffect(() => {
    containerRef.current?.classList.toggle(
      "verberg-beheer-tooltips",
      mode !== "bekijk" && mode !== "basis",
    );
  }, [mode]);

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
    // De rij staat mogelijk op het andere tabblad — dan eerst omschakelen.
    const o = objecten.find((x) => x.id === id);
    if (o) setLijstTab(kaartGroep(o) === "Gebouwen" ? "gebouwen" : "percelen");
    // Zit de rij ingeklapt onder een ouder (object onder perceel, bijgebouw
    // onder hoofdgebouw), klap die dan eerst open — anders is er niets om
    // naartoe te scrollen. Een bijgebouw heeft ook een staatOpId, maar in de
    // gebouwen-lijst is het hoofdgebouw de ouder.
    const ouder =
      o && kaartGroep(o) === "Gebouwen" ? o.hoortBijId : o?.staatOpId;
    if (ouder) setUitgeklapt((prev) => ({ ...prev, [ouder]: true }));
    setTimeout(() => {
      document
        .getElementById(`obj-rij-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
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
        for (let vi = 0; vi < vormen.length; vi++) {
          const vorm = vormen[vi];
          const latlngs = geomNaarLatlngs(L, vorm);
          if (!latlngs) continue;
          const poly = L.polygon(latlngs, {
            color: kleur,
            weight: 2.5,
            fillColor: kleur,
            fillOpacity: 0.25,
          });
          // Gerichte tooltip per vlak: éérst het kadastrale nummer van dít
          // vlak, dan bij welk beheerperceel het hoort — niet de hele
          // kadastrale waslijst van het beheerperceel (wens Steven).
          const aanduiding = o.geomAanduidingen?.[vi];
          poly.bindTooltip(
            aanduiding
              ? `${aanduiding} · behoort bij beheerperceel: ${o.naam}${o.gebruik ? ` (${o.gebruik})` : ""}`
              : `${o.naam}${o.gebruik ? ` · ${o.gebruik}` : ""}${o.kadastraal ? ` · ${o.kadastraal}` : ""}`,
            { sticky: true, className: "beheer-tooltip" },
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
          { sticky: true, className: "beheer-tooltip" },
        );
        poly.on("click", () => toonInLijst(o.id));
        poly.addTo(groep);
        bounds.extend(poly.getBounds());
        vlakkenRef.current.set(o.id, [
          { poly, basis: { weight: 2, fillOpacity: 0.45 } },
        ]);
        continue;
      }
      // Terugval: geen contour bekend, dan een merkje op het opgeslagen punt.
      // Geprikte beheerobjecten (boom, brug…) leven hier: gekleurd rondje met
      // wit pictogram per soort; groeien bij hover doet de CSS. Markers leven
      // in Leaflets marker-pane en liggen dus vanzelf bóven de vlakken.
      if (Number.isFinite(o.lat) && Number.isFinite(o.lon)) {
        const stip = L.marker([o.lat, o.lon], {
          icon: maakStipIcoon(L, o.categorie),
        });
        stip.bindTooltip(`${o.naam}${o.gebruik ? ` · ${o.gebruik}` : ""}`, {
          sticky: true,
          className: "beheer-tooltip",
        });
        stip.on("click", () => toonInLijst(o.id));
        stip.addTo(groep);
        bounds.extend([o.lat, o.lon]);
        // Spotlight/selecteer verwachten de polygon-API; een punt levert zijn
        // eigen mini-bounds, en vertaalt setStyle naar marker-opacity (dimmen
        // als iets anders de spotlight heeft).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (stip as any).getBounds = () => L.latLngBounds([[o.lat, o.lon]]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (stip as any).setStyle = (s: { opacity?: number }) =>
          stip.setOpacity(s?.opacity != null && s.opacity < 1 ? 0.35 : 1);
        vlakkenRef.current.set(o.id, [
          { poly: stip, basis: { weight: 1.5, fillOpacity: 0.7 } },
        ]);
      }
    }
    // In de kadastrale weergave blijft de gekleurde laag van de kaart af;
    // de toggle zet hem terug.
    if (!kadastraalWeergaveRef.current) groep.addTo(map);
    overzichtRef.current = groep;
    if (bounds.isValid()) boundsRef.current = bounds;
    // Na een herteken (bv. na wijzigen) de actieve spotlight opnieuw toepassen.
    spotlight(geselecteerdRef.current);
  }

  // De kadastrale weergave-laag (her)bouwen zodra het bezit bekend is of
  // wijzigt. Zonder klik-handler: de bezit-laag erboven blijft de invoer doen.
  function bouwKadastraleLaag() {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (kadWeergaveLaagRef.current) {
      kadWeergaveLaagRef.current.remove();
      kadWeergaveLaagRef.current = null;
    }
    const kad = maakKadastraleLaag(L, bezit);
    kadWeergaveLaagRef.current = kad.groep;
    werkLabelsBijRef.current = () => kad.werkLabelsBij(map);
    if (kadastraalWeergaveRef.current) {
      kad.groep.addTo(map);
      werkLabelsBijRef.current();
    }
  }

  useEffect(() => {
    bouwKadastraleLaag();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bezit]);

  useEffect(() => {
    kadastraalWeergaveRef.current = kadastraalWeergave;
    const map = mapRef.current;
    if (!map || !overzichtRef.current || !kadWeergaveLaagRef.current) return;
    if (kadastraalWeergave) {
      overzichtRef.current.remove();
      kadWeergaveLaagRef.current.addTo(map);
      werkLabelsBijRef.current?.();
    } else {
      kadWeergaveLaagRef.current.remove();
      overzichtRef.current.addTo(map);
    }
  }, [kadastraalWeergave]);

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
    setExtraKoppelen(false);
    // De omtrek-flow leeft alleen in de bezit-laadmodus.
    if (mode !== "perceel") {
      setBezitMethode("klikken");
      setOmtrek([]);
      setOmtrekResultaat(null);
      setOmtrekGesloten(false);
    }
    // De splitslijn-flow leeft alleen in de bekijk-modus.
    if (mode !== "bekijk") setSplitsing(null);
    setMelding(null);
    wisHighlights();
    // In bekijk-modus: toon het hele landgoed i.p.v. handmatig inzoomen.
    if (mode === "bekijk") zoomNaarLandgoed();
    // Bezit inladen: de volledige kadastrale kaart erbij (grenzen +
    // perceelnummers), zodat zichtbaar is wáár je kunt klikken. PDOK tekent
    // die pas bij voldoende inzoomen — dus zonodig even bijzoomen.
    {
      const L = LRef.current;
      const map = mapRef.current;
      if (L && map) {
        if (mode === "perceel") {
          if (!perceelWmsRef.current) {
            perceelWmsRef.current = L.tileLayer.wms(KADASTER_WMS, {
              layers: "Perceel",
              styles: "",
              format: "image/png",
              transparent: true,
              version: "1.3.0",
              maxZoom: 19,
              attribution: "© Kadaster",
            });
          }
          perceelWmsRef.current!.addTo(map);
          // PDOK tekent deze laag alleen voldoende ingezoomd — bij binnenkomst
          // dus even bijzoomen. Bewust zónder animatie: klikte je tijdens het
          // inzoomen, dan schoof de kaart nog onder je muis door en
          // registreerde je het verkeerde perceel. Uitzoomen blijft daarna
          // gewoon kunnen; de uitleg-tekst legt uit waarom percelen dan
          // even verdwijnen.
          if (map.getZoom() < 15) map.setZoom(15, { animate: false });
        } else {
          perceelWmsRef.current?.remove();
        }
      }
    }
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

  // De getekende omtrek (voordeur 1) op de kaart bijhouden: tijdens het
  // tekenen een open lijn met stippen; pas na "Sluit de omtrek" een gesloten,
  // licht gevuld vlak. Een zelfkruisend pad kleurt rood.
  useEffect(() => {
    omtrekActiefRef.current = omtrekActief;
    omtrekGeslotenRef.current = omtrekGesloten;
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    // Dubbelklik-zoomen zit het snelle punten-klikken in de weg.
    if (omtrekActief) map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
    if (omtrekLaagRef.current) {
      omtrekLaagRef.current.remove();
      omtrekLaagRef.current = null;
    }
    if (!omtrekActief || omtrek.length === 0) return;
    const kruist = isZelfkruisend(omtrek, omtrekGesloten);
    const kleur = kruist ? "#dc2626" : "#111827";
    const groep = L.layerGroup();
    for (const punt of omtrek) {
      L.circleMarker(punt, {
        radius: 5,
        color: kleur,
        weight: 2,
        fillColor: "#ffffff",
        fillOpacity: 1,
      }).addTo(groep);
    }
    if (omtrekGesloten && omtrek.length >= 3) {
      L.polygon(omtrek, {
        color: kleur,
        weight: 2,
        dashArray: "6 4",
        fillColor: kleur,
        fillOpacity: 0.06,
      }).addTo(groep);
    } else if (omtrek.length >= 2) {
      L.polyline(omtrek, {
        color: kleur,
        weight: 2,
        dashArray: "6 4",
      }).addTo(groep);
    }
    groep.addTo(map);
    omtrekLaagRef.current = groep;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [omtrek, omtrekActief, omtrekGesloten]);

  // De getekende splitslijn op de kaart bijhouden. Elk gezet punt krijgt
  // direct een stip — anders is de allereerste klik onzichtbaar (een lijn
  // bestaat pas vanaf twee punten) en lijkt er niets te gebeuren.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (lijnRef.current) {
      lijnRef.current.remove();
      lijnRef.current = null;
    }
    if (lijn.length) {
      const groep = L.layerGroup();
      for (const punt of lijn) {
        L.circleMarker(punt, {
          radius: 5,
          color: "#111827",
          weight: 2,
          fillColor: "#ffffff",
          fillOpacity: 1,
        }).addTo(groep);
      }
      if (lijn.length > 1) {
        L.polyline(lijn, {
          color: "#111827",
          weight: 2.5,
          dashArray: "6 4",
        }).addTo(groep);
      }
      groep.addTo(map);
      lijnRef.current = groep;
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
      // Ingedeelde percelen zijn normaal niet-interactief: klik en hover
      // vallen door naar het gekleurde beheerperceel eronder (tooltip,
      // spotlight, kaart-naar-lijst). Aanklikbaar zijn ze alleen in de
      // bezit-laadmodus (voor de "al ingedeeld"-melding) en in de indeel-
      // modus nádat de deelgebruik-knop is ingedrukt.
      const invoerModus =
        mode === "perceel" || (mode === "indelen" && extraKoppelen);
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
            ? `${p.aanduiding} · ingedeeld bij ${bij}${
                mode === "indelen" && extraKoppelen
                  ? " — klik om extra te koppelen (deelgebruik)"
                  : ""
              }`
            : `${p.aanduiding} · nog in te delen`,
          { sticky: true },
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      poly.on("click", async (e: any) => {
        const m = modeRef.current;
        // Tijdens het omtrek-tekenen is óók een klik op een (grijs) bezit-vlak
        // gewoon een hoekpunt.
        if (m === "perceel" && omtrekActiefRef.current) {
          laagKlikRef.current = true;
          if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
          if (!omtrekGeslotenRef.current) {
            setOmtrek((prev) => [...prev, [e.latlng.lat, e.latlng.lng]]);
            setOmtrekResultaat(null);
          }
          return;
        }
        // Alleen in de modi waar het vlak de klik zelf afhandelt de kaart-klik
        // onderdrukken; in de basis-modus moet een klik óp een perceel gewoon
        // de landgoed-locatie kunnen zetten.
        if (m === "perceel" || m === "indelen") {
          laagKlikRef.current = true;
          if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
        }
        if (m === "indelen") {
          // Vanaf hier is een ingedeeld perceel gewoon een perceel als alle
          // andere: de deelgebruik-knop was de bewuste tussenstap, de rest
          // van de indeel-flow kent geen uitzonderingen meer (wens Steven).
          setMelding(null);
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
    // extraKoppelen hoort erbij: het bepaalt of ingedeelde percelen
    // aanklikbaar zijn (deelgebruik-knop in het indeel-paneel).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bezit, selectie, mode, extraKoppelen]);

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

  // Ondergrond wisselen tussen kleur en grijs (zelfde PDOK-bron, andere
  // smaak) + een grayscale-filter die de laatste zachte kleuren wegneemt.
  useEffect(() => {
    achtergrondRef.current?.setUrl(PDOK_TILES(grijzeKaart ? "grijs" : "standaard"));
    achtergrondRef.current
      ?.getContainer()
      ?.classList.toggle("ondergrond-grijs", grijzeKaart);
  }, [grijzeKaart]);

  // Natura 2000-overlay aan/uit op basis van de toggle.
  useEffect(() => {
    const map = mapRef.current;
    const laag = natRef.current;
    if (!map || !laag) return;
    if (toonNatura) laag.addTo(map);
    else laag.remove();
  }, [toonNatura]);

  // NNN-overlay aan/uit op basis van de toggle. De klasse kleurt de grijze
  // PDOK-stijl groen (na elke addTo opnieuw: Leaflet bouwt de laag-container
  // dan opnieuw op).
  useEffect(() => {
    const map = mapRef.current;
    const laag = nnnRef.current;
    if (!map || !laag) return;
    if (toonNnn) {
      laag.addTo(map);
      laag.getContainer()?.classList.add("nnn-groen");
    } else {
      laag.remove();
    }
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
      bouwKadastraleLaag();
      map.on("zoomend", () => werkLabelsBijRef.current?.());
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
        // Omtrek tekenen (voordeur 1): elke kaartklik is een hoekpunt —
        // behalve als de omtrek al gesloten is (eerst weer openen).
        if (m === "perceel" && omtrekActiefRef.current) {
          if (!omtrekGeslotenRef.current) {
            setOmtrek((prev) => [...prev, [lat, lon]]);
            setOmtrekResultaat(null);
          }
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
          if (r === "onbereikbaar") {
            // Bron-storing is iets anders dan "geen resultaat" (issue #8).
            setMelding(
              "PDOK (Kadaster) is op dit moment niet bereikbaar — probeer het zo nog eens.",
            );
          } else if (r) {
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
        } else if (m === "object") {
          // Prikken: geen externe lookup — het geklikte punt zelf is de
          // registratie; het formulier in het paneel maakt het af.
          setResultaat(null);
          setMelding(null);
        } else {
          const r = await lookupGebouw(lat, lon);
          if (r === "onbereikbaar") {
            setResultaat(null);
            setPunt(null);
            setMelding(
              "PDOK (BAG) is op dit moment niet bereikbaar — probeer het zo nog eens.",
            );
          } else {
            setResultaat(r ? { ...r, soort: "gebouw" } : null);
            tekenRand(L, map, randRef, r?.geom ? [r.geom] : []);
          }
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
            ["object", "Objecten plaatsen"],
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
            checked={kadastraalWeergave}
            onChange={(e) => setKadastraalWeergave(e.target.checked)}
          />
          Kadastrale weergave
        </label>
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
          <form
            action={controleerGebiedsligging}
            title="Controleert Natura 2000, NNN, bodemtype en ANLb-leefgebieden opnieuw bij de overheid (PDOK). Nieuw ingeladen percelen worden al automatisch gecheckt — verversen is alleen nodig als beleidsgebieden wijzigen (± jaarlijks)."
          >
            <input type="hidden" name="landgoed_id" value={landgoedId} />
            <input type="hidden" name="lat" value={lat} />
            <input type="hidden" name="lon" value={lon} />
            <SubmitKnop className="btn btn-ghost btn-sm" pendingTekst="Verversen…">
              Ververs gebiedsligging
            </SubmitKnop>
          </form>
        )}
        {gebiedsligging && (
          <span className="text-[12px]" style={{ color: "var(--text-2)" }}>
            {gebiedsligging}
          </span>
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

      {/* Bezit inladen: eerst de methode kiezen (de drie voordeuren), dan
          pas de uitleg — de uitleg in het gele kader volgt de keuze. */}
      {mode === "perceel" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
            Bezit inladen via:
          </span>
          <button
            type="button"
            className={`btn btn-sm ${bezitMethode === "klikken" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => {
              setBezitMethode("klikken");
              setOmtrek([]);
              setOmtrekResultaat(null);
              setOmtrekGesloten(false);
            }}
          >
            Percelen aanklikken
          </button>
          <button
            type="button"
            className={`btn btn-sm ${bezitMethode === "omtrek" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setBezitMethode("omtrek")}
          >
            ✏️ Omtrek tekenen
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled
            title="Voordeur 3 — in ontwikkeling"
            style={{ opacity: 0.5 }}
          >
            📄 Uittreksel uploaden · binnenkort
          </button>
        </div>
      )}

      {/* Modus-uitleg: belangrijke gebruiksinfo, dus in een opvallend kader
          in plaats van grijs weggemoffeld (wens Steven). */}
      <p
        className="rounded-md border px-3 py-2 text-[12.5px] font-medium"
        style={{
          background: "#FEF3C7",
          borderColor: "#F59E0B",
          color: "#92400E",
        }}
      >
        {mode === "bekijk"
          ? "Bekijk-modus: klikken op de kaart doet niets. Kies een invoer-modus om percelen of gebouwen toe te voegen."
          : mode === "basis"
          ? basisIngesteld
            ? "Klik op de kaart om de landgoed-locatie te wijzigen."
            : "Klik op de hoofdlocatie van het landgoed; adres/gemeente/provincie wordt opgezocht."
          : mode === "perceel"
            ? bezitMethode === "omtrek"
              ? "Omtrek tekenen: klik hoekpunten langs de rand van het gebied (minstens 3), druk op “Sluit de omtrek” als de vorm af is, en kies dan “Zoek percelen binnen de omtrek” — alle percelen erbinnen gaan in één keer het bezit in."
              : "Klik-klik-klik: elk aangeklikt perceel gaat direct het bezit in (PDOK Kadaster). Nogmaals klikken op een grijs perceel verwijdert het weer. Let op: zoom je ver uit, dan verbergt het Kadaster de perceelgrenzen en nummers — zoom in en ze verschijnen weer. Indelen komt daarna."
            : mode === "indelen"
              ? "Selecteer een of meer grijze percelen en maak er samen een beheerperceel van — of voeg ze toe aan een bestaand beheerperceel."
              : mode === "object"
                ? "Klik op de kaart waar het object staat — een boom, brug, hek of technische voorziening — en geef het een naam. Het object koppelt zichzelf aan het beheerperceel waar het punt in valt."
                : "Klik op een gebouw; adres, oppervlakte, pandstatus en monumentstatus (RCE) worden opgehaald."}
      </p>
      {/* Meldingen in alle modi — ook een bron-storing in de gebouwen-modus
          moet ergens leesbaar landen. */}
      {melding && (
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

      {/* Omtrek-paneel (voordeur 1): bedienknoppen bij de gekozen methode
          "Omtrek tekenen" — de uitleg staat in het gele kader hierboven. */}
      {mode === "perceel" && omtrekActief && (
        <div className="card flex flex-wrap items-center gap-3 p-4 text-[13px]">
          {omtrekResultaat ? (
            <>
              <span className="font-medium">
                {omtrekResultaat.nieuw} nieuwe percelen gevonden ·{" "}
                {omtrekResultaat.bestaand} al in bezit
                {omtrekResultaat.afgekapt
                  ? " · let op: gebied te groot, niet alles doorzocht — teken kleiner"
                  : ""}
              </span>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={omtrekBezig || omtrekResultaat.nieuw === 0}
                onClick={async () => {
                  setOmtrekBezig(true);
                  const omtrek3857 = omtrek.map(([la, lo]) =>
                    merc3857(lo, la),
                  );
                  const r = await registreerBezitBinnenOmtrek(
                    landgoedId,
                    omtrek3857,
                  );
                  setOmtrekBezig(false);
                  if (r.status === "fout") {
                    setMelding(r.melding);
                    return;
                  }
                  setOmtrek([]);
                  setOmtrekResultaat(null);
                  setOmtrekGesloten(false);
                  setBezitMethode("klikken");
                  setMelding(
                    `${r.toegevoegd} percelen toegevoegd aan het bezit${
                      r.overgeslagen
                        ? ` (${r.overgeslagen} stond${r.overgeslagen > 1 ? "en" : ""} er al in)`
                        : ""
                    }.`,
                  );
                }}
              >
                {omtrekBezig
                  ? "Toevoegen…"
                  : `Voeg ${omtrekResultaat.nieuw} percelen toe`}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={omtrekBezig}
                onClick={() => {
                  setOmtrek([]);
                  setOmtrekResultaat(null);
                  setOmtrekGesloten(false);
                }}
              >
                Opnieuw
              </button>
            </>
          ) : omtrekGesloten ? (
            <>
              <span style={{ color: "var(--text-2)" }}>
                Omtrek gesloten ({omtrek.length} hoekpunten) — zoek de
                percelen, of open de omtrek weer om aan te passen.
              </span>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={omtrekBezig}
                onClick={async () => {
                  setOmtrekBezig(true);
                  const omtrek3857 = omtrek.map(([la, lo]) =>
                    merc3857(lo, la),
                  );
                  const r = await zoekPercelenBinnenOmtrek(
                    landgoedId,
                    omtrek3857,
                  );
                  setOmtrekBezig(false);
                  if (r.status === "fout") {
                    setMelding(r.melding);
                    return;
                  }
                  setOmtrekResultaat(r);
                }}
              >
                {omtrekBezig ? "Zoeken…" : "Zoek percelen binnen de omtrek"}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={omtrekBezig}
                onClick={() => setOmtrekGesloten(false)}
              >
                Open de omtrek weer
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={omtrekBezig}
                onClick={() => {
                  setOmtrek([]);
                  setOmtrekGesloten(false);
                }}
              >
                Wis omtrek
              </button>
            </>
          ) : (
            <>
              <span
                style={{
                  color: isZelfkruisend(omtrek, false)
                    ? "var(--red)"
                    : "var(--text-2)",
                }}
              >
                {isZelfkruisend(omtrek, false)
                  ? "De lijn kruist zichzelf (rood) — haal het laatste punt weg of pas de vorm aan."
                  : omtrek.length === 0
                    ? "Nog geen hoekpunten gezet — klik op de kaart."
                    : `${omtrek.length} hoekpunt${omtrek.length > 1 ? "en" : ""} gezet — sluit de omtrek als de vorm af is.`}
              </span>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={omtrek.length < 3 || omtrekBezig}
                onClick={() => {
                  if (isZelfkruisend(omtrek, true)) {
                    setMelding(
                      "Sluiten zou de omtrek zichzelf laten kruisen — haal het laatste punt weg of pas de vorm aan.",
                    );
                    return;
                  }
                  setMelding(null);
                  setOmtrekGesloten(true);
                }}
              >
                Sluit de omtrek
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={omtrek.length === 0 || omtrekBezig}
                onClick={() => setOmtrek((prev) => prev.slice(0, -1))}
              >
                Laatste punt weg
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={omtrek.length === 0 || omtrekBezig}
                onClick={() => setOmtrek([])}
              >
                Wis omtrek
              </button>
            </>
          )}
        </div>
      )}

      {/* Indeel-paneel (fase 2) in twee losgekoppelde blokken (wens Steven):
          eerst beheerpercelen maken (altijd leeg, altijd simpel), daarna
          percelen toewijzen aan een bestáánd beheerperceel. Deelgebruik is
          een bescheiden vinkje onderin — uit de hoofdflow, vindbaar waar je
          het nodig hebt. */}
      {mode === "indelen" && (
        <>
          <form
            action={async (fd) => {
              await deelPercelenIn(fd);
              setMelding(
                'Beheerperceel aangemaakt — kies het hieronder bij "Wijs toe aan".',
              );
            }}
            className="card flex flex-wrap items-end gap-3 p-4"
          >
            <input type="hidden" name="landgoed_id" value={landgoedId} />
            <div
              className="w-full text-[12px] font-semibold uppercase tracking-wide"
              style={{ color: "var(--text-2)" }}
            >
              1 · Beheerpercelen maken
            </div>
            <div className="min-w-[180px] flex-1">
              <label className="label-up mb-1 block">Naam</label>
              <input className="input" name="naam" placeholder="bv. Weiland zuid" required />
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
            <SubmitKnop className="btn btn-primary" pendingTekst="Maken…">
              + Maak beheerperceel
            </SubmitKnop>
          </form>

          <form
            action={async (fd) => {
              const aantal = selectie.length;
              const doel = koppelOpties.find((o) => o.id === koppelId)?.naam ?? "";
              await deelPercelenIn(fd);
              setSelectie([]);
              setMelding(
                `${aantal} perceel${aantal > 1 ? "en" : ""} toegewezen aan ${doel}.`,
              );
            }}
            className="card flex flex-wrap items-end gap-3 p-4"
          >
            <input type="hidden" name="landgoed_id" value={landgoedId} />
            {selectie.map((pid) => (
              <input key={pid} type="hidden" name="perceel_id" value={pid} />
            ))}
            <div
              className="w-full text-[12px] font-semibold uppercase tracking-wide"
              style={{ color: "var(--text-2)" }}
            >
              2 · Percelen toewijzen
            </div>
            <div className="min-w-[220px] flex-1">
              <label className="label-up mb-1 block">Wijs toe aan</label>
              <select
                className="input"
                name="bestaand_id"
                value={koppelId}
                onChange={(e) => setKoppelId(e.target.value)}
              >
                <option value="">— kies beheerperceel —</option>
                {groepeerOpties(koppelOpties).map(([label, lijst]) => (
                  <optgroup key={label} label={label}>
                    {lijst.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.naam}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <SubmitKnop
              className="btn btn-primary"
              pendingTekst="Toewijzen…"
              disabled={selectie.length === 0 || koppelId === ""}
            >
              {selectie.length > 0 && koppelId
                ? `Wijs ${selectie.length} perceel${selectie.length > 1 ? "en" : ""} toe aan ${
                    koppelOpties.find((o) => o.id === koppelId)?.naam ?? ""
                  }`
                : "Wijs toe"}
            </SubmitKnop>
            {selectie.length > 0 && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setSelectie([])}
              >
                Wis selectie
              </button>
            )}
            <div className="w-full text-[12px]" style={{ color: "var(--text-2)" }}>
              {selectie.length === 0 ? (
                // Hulptekst die meedenkt met de situatie: wat valt er
                // werkelijk aan te klikken?
                (() => {
                  const nogInTeDelen = bezit.filter((b) => !b.ingedeeld).length;
                  if (bezit.length === 0)
                    return "Nog geen bezit ingeladen — begin bij 1 · Bezit inladen.";
                  if (nogInTeDelen > 0)
                    return `Klik de nog in te delen percelen (grijs gestippeld) aan op de kaart of in de lijst hieronder — nog ${nogInTeDelen}.`;
                  if (extraKoppelen)
                    return "Deelgebruik staat aan: klik een al-ingedeeld perceel aan om het óók aan een tweede beheerperceel toe te wijzen.";
                  return `Alle ${bezit.length} percelen zijn ingedeeld — er valt niets meer toe te wijzen. Wil je een perceel óók bij een tweede beheerperceel voegen? Zet dan het deelgebruik-vinkje hieronder aan. Een perceel verplaatsen? Ontkoppel het eerst via Wijzig bij het beheerperceel.`;
                })()
              ) : (
                <>
                  Geselecteerd:{" "}
                  {selectie
                    .map((pid) => {
                      const p = bezit.find((b) => b.id === pid);
                      if (!p) return null;
                      return p.ingedeeld
                        ? `${p.aanduiding} (al bij ${p.ingedeeldBij.map((b) => b.naam).join(", ")} — wordt gedeeld gebruik)`
                        : p.aanduiding;
                    })
                    .filter(Boolean)
                    .join(" · ")}
                </>
              )}
            </div>
            {/* Deelgebruik: instelling in plaats van actie-knop. */}
            <label
              className="flex w-full items-start gap-2 text-[12px]"
              style={{ color: "var(--text-2)" }}
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={extraKoppelen}
                onChange={(e) => setExtraKoppelen(e.target.checked)}
              />
              <span>
                Ook al-ingedeelde percelen aanklikbaar maken (deelgebruik: één
                perceel bij twee beheerpercelen — het telt dan bij beide als
                gedeeld).
              </span>
            </label>
          </form>
        </>
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

      {/* Prik-paneel (Hugo 2.3): puntobject een naam en soort geven. */}
      {mode === "object" && punt && (
        <form
          action={async (fd) => {
            const res = await plaatsBeheerobject(fd);
            setPunt(null);
            if (tempRef.current) {
              tempRef.current.remove();
              tempRef.current = null;
            }
            setMelding(
              res && res.perceelNaam
                ? `Object geplaatst en gekoppeld aan beheerperceel ${res.perceelNaam}.`
                : "Object geplaatst. Het punt valt buiten de beheerpercelen, dus er is nog geen koppeling gelegd.",
            );
          }}
          className="card p-4"
        >
          <input type="hidden" name="landgoed_id" value={landgoedId} />
          <input type="hidden" name="lat" value={punt.lat} />
          <input type="hidden" name="lon" value={punt.lon} />
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label-up mb-1 block">Wat staat hier?</label>
              <select className="input" name="categorie" defaultValue="boom">
                {BEHEEROBJECT_PRIK_OPTIES.map(([waarde, label]) => (
                  <option key={waarde} value={waarde}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[180px] flex-1">
              <label className="label-up mb-1 block">Naam</label>
              <input
                className="input"
                name="naam"
                placeholder="Bijv. Rode beuk bij het koetshuis"
                required
              />
            </div>
            <SubmitKnop className="btn btn-primary" pendingTekst="Plaatsen…">
              Plaats object
            </SubmitKnop>
          </div>
        </form>
      )}

      {/* Bezit dat nog niet is ingedeeld (werkvoorraad — mag blijven staan).
          Via de deelgebruik-knop aangewezen (al-ingedeelde) percelen schuiven
          hier ook in, zodat ze verder als elk ander perceel meedoen. */}
      {bezit.some((p) => !p.ingedeeld || selectie.includes(p.id)) && (
        <div>
          <div className="mb-2 text-[13px] font-semibold">
            Nog in te delen ({bezit.filter((p) => !p.ingedeeld).length})
            <span className="ml-2 font-normal text-[12px]" style={{ color: "var(--text-3)" }}>
              klik een perceel om het te selecteren voor indelen
            </span>
          </div>
          <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
            {bezit
              .filter((p) => !p.ingedeeld || selectie.includes(p.id))
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
                      {p.ingedeeld && (
                        <span className="font-normal" style={{ color: "var(--text-2)" }}>
                          {" "}· al bij {p.ingedeeldBij.map((b) => b.naam).join(", ")} — wordt gedeeld gebruik
                        </span>
                      )}
                      {isGeselecteerd && (
                        <span className="font-semibold" style={{ color: "#92400e" }}>
                          {" "}· geselecteerd
                        </span>
                      )}
                    </button>
                    {p.ingedeeld ? null : (
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
                    )}
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
            {/* Grond en gebouwen als aparte tabbladen (wens Steven: door
                elkaar was onduidelijk of "Wonen" grond of pand betekende). */}
            <div className="flex gap-2">
              <button
                type="button"
                className={`btn btn-sm ${lijstTab === "percelen" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setLijstTab("percelen")}
              >
                Percelen (
                {objecten.filter((o) => kaartGroep(o) !== "Gebouwen").length})
              </button>
              <button
                type="button"
                className={`btn btn-sm ${lijstTab === "gebouwen" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setLijstTab("gebouwen")}
              >
                Gebouwen (
                {objecten.filter((o) => kaartGroep(o) === "Gebouwen").length})
              </button>
            </div>
            {(lijstTab === "gebouwen"
              ? /* Gebouwen als clusters: bijgebouwen ingesprongen onder
                   hun hoofdgebouw. */
                ([["Gebouwen", ordenGebouwen(groepenMap.get("Gebouwen")!)]] as [
                  string,
                  { item: PlaatsObject; ingesprongen: boolean; ouderId?: string }[],
                ][])
              : /* Percelen: beheerperceel als hoofditem, geprikte objecten
                   ingesprongen eronder; losse objecten apart (issue #130). */
                (() => {
                  const { groepen, los } = ordenPercelenMetObjecten(objecten);
                  return [
                    ...groepen,
                    ...(los.length
                      ? ([
                          [
                            "Losse objecten (nog niet gekoppeld)",
                            los.map((item) => ({ item, ingesprongen: false })),
                          ],
                        ] as [
                          string,
                          { item: PlaatsObject; ingesprongen: boolean; ouderId?: string }[],
                        ][])
                      : []),
                  ];
                })()
            ).map(([label, geordend]) => {
              if (geordend.length === 0) return null;
              return (
                <div key={label} className="card p-4">
                  <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-2)" }}>
                    {label} ({geordend.length})
                  </div>
                  <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                    {geordend
                      .filter(
                        (r) =>
                          !r.ingesprongen ||
                          (r.ouderId != null && uitgeklapt[r.ouderId]),
                      )
                      .map(({ item: o, ingesprongen }) => {
                      const kinderen = geordend.filter(
                        (r) => r.ouderId === o.id,
                      ).length;
                      return (
                      <div
                        key={o.id}
                        id={`obj-rij-${o.id}`}
                        style={{
                          background:
                            geselecteerd === o.id ? "var(--primary-light)" : undefined,
                          paddingLeft: ingesprongen ? 18 : undefined,
                        }}
                      >
                        <div className="flex items-center gap-3 py-2.5">
                          {/* Pijltje voor in-/uitklappen van wat eronder
                              hangt; rijen zonder kinderen krijgen een spacer
                              zodat de namen uitlijnen. */}
                          {kinderen > 0 ? (
                            <button
                              type="button"
                              onClick={() => klapOm(o.id)}
                              className="shrink-0 text-[12.5px] font-medium"
                              style={{ color: "var(--text-2)", minWidth: 22 }}
                              title={
                                uitgeklapt[o.id]
                                  ? "Klap in"
                                  : `Toon ${kinderen} onderliggende`
                              }
                            >
                              {uitgeklapt[o.id] ? "▾" : `▸ ${kinderen}`}
                            </button>
                          ) : (
                            <span className="shrink-0" style={{ minWidth: 22 }} />
                          )}
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
                            href={`/landgoed/${landgoedId}/object/${o.id}?van=invoer`}
                            className="btn btn-ghost btn-sm"
                          >
                            Details
                          </Link>
                          {/* Zelden gebruikte acties: klein en tekstueel, niet in
                              your face (wens Steven). Ook geprikte objecten
                              zijn te wijzigen (naam + soort). */}
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
                          {/* Ook geprikte objecten (boom, vijver…) zijn zo
                              handmatig te (ont)koppelen — zelfde verband en
                              formulier als bij gebouwen. */}
                          {!PERCEEL_CATS.has(o.categorie) && (
                            <button
                              type="button"
                              className="text-[11.5px] hover:underline"
                              style={{ color: "var(--text-2)" }}
                              onClick={() =>
                                setKoppelGebouwId(koppelGebouwId === o.id ? null : o.id)
                              }
                            >
                              {o.staatOpId
                                ? "Wijzig / ontkoppel perceel"
                                : "Koppel aan perceel"}
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
                            {PERCEEL_CATS.has(o.categorie) ||
                            GEBOUW_CATS.has(o.categorie) ? (
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
                            ) : (
                              /* Geprikt object: geen gebruik-veld maar de
                                 soort (boom bleek toch een brug…). */
                              <div>
                                <label className="label-up mb-1 block">Soort</label>
                                <select
                                  className="input"
                                  name="soort"
                                  defaultValue={
                                    BEHEEROBJECT_PRIK_OPTIES.some(
                                      ([w]) => w === o.categorie,
                                    )
                                      ? o.categorie
                                      : "overig"
                                  }
                                >
                                  {BEHEEROBJECT_PRIK_OPTIES.map(([waarde, label]) => (
                                    <option key={waarde} value={waarde}>
                                      {label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                            {/* Gebouwen-cluster: schuur/stal onder zijn
                                hoofdgebouw hangen (één niveau diep). */}
                            {GEBOUW_CATS.has(o.categorie) && (
                              <div>
                                <label className="label-up mb-1 block">
                                  Hoort bij (hoofdgebouw)
                                </label>
                                <select
                                  className="input"
                                  name="hoofdgebouw_id"
                                  defaultValue={o.hoortBijId ?? ""}
                                >
                                  <option value="">— geen —</option>
                                  {objecten
                                    .filter(
                                      (g) =>
                                        GEBOUW_CATS.has(g.categorie) &&
                                        g.id !== o.id &&
                                        !g.hoortBijId,
                                    )
                                    .map((g) => (
                                      <option key={g.id} value={g.id}>
                                        {g.naam}
                                      </option>
                                    ))}
                                </select>
                              </div>
                            )}
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
                        {/* Bij Wijzig ook de gekoppelde percelen, elk met een
                            eigen ontkoppel-knopje — fijner dan alleen het
                            botte "Hef indeling op". */}
                        {wijzigId === o.id &&
                          PERCEEL_CATS.has(o.categorie) &&
                          (o.kadDelen?.length ?? 0) > 0 && (
                            <div
                              className="flex flex-col gap-1 pb-3 text-[12px]"
                              style={{ color: "var(--text-2)" }}
                            >
                              <div className="label-up">
                                Gekoppelde kadastrale percelen
                              </div>
                              {(o.kadDelen ?? []).map((d) => (
                                <div
                                  key={d.perceelId}
                                  className="flex items-center gap-2"
                                >
                                  <span>
                                    {d.aanduiding}
                                    {d.dekking === "gedeeltelijk" ? " (deels)" : ""}
                                  </span>
                                  <form
                                    action={ontkoppelPerceel}
                                    style={{ color: "var(--red)" }}
                                  >
                                    <input type="hidden" name="landgoed_id" value={landgoedId} />
                                    <input type="hidden" name="stamobject_id" value={o.id} />
                                    <input type="hidden" name="perceel_id" value={d.perceelId} />
                                    <VerwijderKnop
                                      className="text-[11.5px] hover:underline"
                                      vraag={`de koppeling van ${d.aanduiding} met "${o.naam}" (het perceel blijft in het bezit${
                                        d.dekking === "gedeeltelijk"
                                          ? " en bij de andere beheerpercelen"
                                          : ' en wordt weer "nog in te delen"'
                                      })`}
                                    >
                                      ontkoppel
                                    </VerwijderKnop>
                                  </form>
                                </div>
                              ))}
                            </div>
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
                                {groepeerOpties(
                                  objecten.filter((p) =>
                                    PERCEEL_CATS.has(p.categorie),
                                  ),
                                ).map(([label, lijst]) => (
                                  <optgroup key={label} label={label}>
                                    {lijst.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.naam}
                                        {p.gebruik ? ` (${p.gebruik})` : ""}
                                      </option>
                                    ))}
                                  </optgroup>
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
                      );
                    })}
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
