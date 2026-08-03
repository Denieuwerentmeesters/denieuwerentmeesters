"use client";

// De kijk-kaart (menu-item "Kaart"): dezelfde kaarttaal als de invoerpagina,
// maar zonder invoer. Kijken, filteren op gebruikssoort, meerdere
// beheerpercelen tegelijk oplichten, de kadastrale weergave en doorklikken
// naar de invoerpagina — meer niet.
import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Map as LMap, TileLayer } from "leaflet";
import {
  type KaartObject,
  objectDetails,
  PDOK_TILES,
  KADASTER_WMS,
  BAG_WMS,
  NATURA2000_WMS,
  NNN_WMS,
  KLEUR_GEEN_GEBRUIK,
  kleurVoorGebruik,
  KAARTGROEP_LABELS,
  type KaartGroepLabel,
  kaartGroep,
  ordenGebouwen,
  geomNaarLatlngs,
  maakKadastraleLaag,
} from "@/components/kaartDelen";
// De gebruik-lijsten per soort: percelen en gebouwen hebben elk hun eigen
// gebruiksvormen — de filterchips volgen het actieve tabblad.
import {
  GEBRUIK_OPTIES,
  GEBRUIK_GEBOUW_OPTIES,
} from "@/app/(app)/landgoed/[id]/stamgegevens/constanten";

type BezitVlak = {
  id: string;
  aanduiding: string;
  oppervlakteHa: string | null;
  oppervlakteM2: number | null;
  geom: unknown;
};

function haGetal(m2: number): string {
  return `${(m2 / 10000).toLocaleString("nl-NL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ha`;
}

// Sentinel voor de filter-chip "nog geen gebruik".
const GEEN_GEBRUIK = "__geen__";

export default function KaartWeergave({
  landgoedId,
  objecten,
  bezit,
  lat,
  lon,
  totaalHa,
  aantalPercelen,
  aantalGebouwen,
}: {
  landgoedId: string;
  objecten: KaartObject[];
  bezit: BezitVlak[];
  lat: number | null;
  lon: number | null;
  totaalHa: string;
  aantalPercelen: number;
  aantalGebouwen: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overzichtRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kadastraalLaagRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const boundsRef = useRef<any>(null);
  const achtergrondRef = useRef<TileLayer | null>(null);
  const natRef = useRef<TileLayer | null>(null);
  const nnnRef = useRef<TileLayer | null>(null);
  // Alle getekende vlakken per object, met basisstijl + gebruik — voor de
  // spotlight (klik) en het gebruiksfilter.
  const vlakkenRef = useRef<
    Map<
      string,
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        poly: any;
        basis: { weight: number; fillOpacity: number };
        gebruik: string | null;
        isPerceel: boolean;
      }[]
    >
  >(new Map());
  // De kadastrale vlakken per bezit-perceel (voor selectie in die weergave).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kadVlakkenRef = useRef<Map<string, any>>(new Map());
  const werkLabelsBijRef = useRef<(() => void) | null>(null);
  const selectieRef = useRef<string[]>([]);
  const kadSelectieRef = useRef<string[]>([]);
  const filterRef = useRef<string | null>(null);

  const [grijzeKaart, setGrijzeKaart] = useState(true);
  const [toonNatura, setToonNatura] = useState(false);
  const [toonNnn, setToonNnn] = useState(false);
  const [kadastraal, setKadastraal] = useState(false);
  const [filterGebruik, setFilterGebruik] = useState<string | null>(null);
  // De lijst kent twee tabbladen: grond (de beheerpercelen) en gebouwen —
  // door elkaar was het onduidelijk wanneer "Wonen" over grond ging en
  // wanneer over een pand (wens Steven).
  const [lijstTab, setLijstTab] = useState<"percelen" | "gebouwen">("percelen");
  // Meervoudige selectie: meerdere beheerpercelen (of kadastrale percelen)
  // tegelijk laten oplichten.
  const [selectie, setSelectie] = useState<string[]>([]);
  const [kadSelectie, setKadSelectie] = useState<string[]>([]);

  // Eén stijl-pass over alle vlakken: selectie wint van filter, filter wint
  // van de basisweergave. Alles wat niet meedoet vervaagt. Het filter slaat
  // alleen op het soort van het actieve tabblad (percelen óf gebouwen).
  function pasStijlenToe(
    sel: string[],
    filter: string | null,
    tab: "percelen" | "gebouwen",
  ) {
    for (const [oid, vlakken] of vlakkenRef.current) {
      for (const { poly, basis, gebruik, isPerceel } of vlakken) {
        const vol = sel.length
          ? sel.includes(oid)
          : filter
            ? (gebruik ?? GEEN_GEBRUIK) === filter &&
              (tab === "gebouwen" ? !isPerceel : isPerceel)
            : null;
        if (vol === null) poly.setStyle({ opacity: 1, ...basis });
        else if (vol) poly.setStyle({ opacity: 1, weight: 4, fillOpacity: 0.55 });
        else poly.setStyle({ opacity: 0.25, weight: 1.5, fillOpacity: 0.05 });
      }
    }
  }

  function pasKadStijlenToe(sel: string[]) {
    for (const [pid, poly] of kadVlakkenRef.current) {
      if (!sel.length)
        poly.setStyle({ opacity: 1, weight: 2, fillOpacity: 0.12 });
      else if (sel.includes(pid))
        poly.setStyle({ opacity: 1, weight: 3.5, fillOpacity: 0.3 });
      else poly.setStyle({ opacity: 0.35, weight: 1, fillOpacity: 0.04 });
    }
  }

  // Zoom naar de gezamenlijke omtrek van een set vlakken; leeg = het hele
  // landgoed weer in beeld (wens Steven: ontklikken = uitzoomen).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function zoomNaar(polys: any[]) {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (!polys.length) {
      if (boundsRef.current?.isValid())
        map.fitBounds(boundsRef.current, { padding: [40, 40], maxZoom: 16 });
      return;
    }
    const bounds = L.latLngBounds([]);
    for (const p of polys) bounds.extend(p.getBounds());
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 17 });
  }

  const vorigeSelectie = useRef(0);
  useEffect(() => {
    selectieRef.current = selectie;
    filterRef.current = filterGebruik;
    pasStijlenToe(selectie, filterGebruik, lijstTab);
    if (selectie.length) {
      zoomNaar(
        selectie.flatMap((id) =>
          (vlakkenRef.current.get(id) ?? []).map((v) => v.poly),
        ),
      );
    } else if (vorigeSelectie.current > 0) {
      zoomNaar([]);
    }
    vorigeSelectie.current = selectie.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectie, filterGebruik, lijstTab]);

  const vorigeKadSelectie = useRef(0);
  useEffect(() => {
    kadSelectieRef.current = kadSelectie;
    pasKadStijlenToe(kadSelectie);
    if (kadSelectie.length) {
      zoomNaar(
        kadSelectie
          .map((id) => kadVlakkenRef.current.get(id))
          .filter(Boolean),
      );
    } else if (vorigeKadSelectie.current > 0) {
      zoomNaar([]);
    }
    vorigeKadSelectie.current = kadSelectie.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kadSelectie]);

  // Kaart opbouwen (eenmalig): lagen + alle vlakken.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current).setView([52.15, 5.4], 8);
      achtergrondRef.current = L.tileLayer(PDOK_TILES("grijs"), {
        maxZoom: 19,
        attribution: "© PDOK BRT-Achtergrondkaart",
      }).addTo(map);
      // Grijs staat hier standaard aan; de filterklasse hoort daar meteen bij
      // (de toggle-effect draaide al vóór de kaart bestond).
      achtergrondRef.current
        ?.getContainer()
        ?.classList.add("ondergrond-grijs");
      L.tileLayer
        .wms(KADASTER_WMS, {
          layers: "KadastraleGrens",
          styles: "",
          format: "image/png",
          transparent: true,
          version: "1.3.0",
          maxZoom: 19,
          attribution: "© Kadaster",
        })
        .addTo(map);
      L.tileLayer
        .wms(BAG_WMS, {
          layers: "pand",
          styles: "",
          format: "image/png",
          transparent: true,
          version: "1.3.0",
          maxZoom: 19,
          attribution: "© BAG",
        })
        .addTo(map);
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

      // ── De gekleurde beheer-laag ──
      const groep = L.layerGroup();
      const bounds = L.latLngBounds([]);
      vlakkenRef.current = new Map();
      for (const o of objecten) {
        const vormen = o.geoms?.length ? o.geoms : o.geom ? [o.geom] : [];
        const kleur = kleurVoorGebruik(o.gebruik);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const eenheid: any[] = [];
        const isPerceel = o.categorie === "pachtperceel";
        const basis = isPerceel
          ? { weight: 2.5, fillOpacity: 0.25 }
          : { weight: 2, fillOpacity: 0.45 };
        vormen.forEach((vorm, vi) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const latlngs = geomNaarLatlngs(L, vorm) as any;
          if (!latlngs) return;
          const poly = L.polygon(latlngs, {
            color: kleur,
            fillColor: kleur,
            ...basis,
          });
          const aanduiding = isPerceel ? o.geomAanduidingen?.[vi] : null;
          poly.bindTooltip(
            aanduiding
              ? `${aanduiding} · behoort bij beheerperceel: ${o.naam}${o.gebruik ? ` (${o.gebruik})` : ""}`
              : `${o.naam}${o.gebruik ? ` · ${o.gebruik}` : ""}`,
            { sticky: true },
          );
          poly.on("mouseover", () => {
            if (selectieRef.current.length || filterRef.current) return;
            for (const p of eenheid) p.setStyle({ weight: 4, fillOpacity: 0.45 });
          });
          poly.on("mouseout", () => {
            if (selectieRef.current.length || filterRef.current) return;
            for (const p of eenheid) p.setStyle({ opacity: 1, ...basis });
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          poly.on("click", (e: any) => {
            if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
            toonInLijst(o.id);
          });
          eenheid.push(poly);
          poly.addTo(groep);
          bounds.extend(poly.getBounds());
        });
        if (eenheid.length) {
          vlakkenRef.current.set(
            o.id,
            eenheid.map((p) => ({
              poly: p,
              basis,
              gebruik: o.gebruik,
              isPerceel,
            })),
          );
        }
      }
      groep.addTo(map);
      overzichtRef.current = groep;

      // ── De kadastrale laag (gedeelde bouwsteen): landgoed-percelen in een
      // herkenbare tint, korte nummers, labels alleen als ze passen ──
      const kad = maakKadastraleLaag(L, bezit, toonKadInLijst);
      kadastraalLaagRef.current = kad.groep;
      kadVlakkenRef.current = kad.vlakken;
      werkLabelsBijRef.current = () => kad.werkLabelsBij(map);
      map.on("zoomend", () => werkLabelsBijRef.current?.());
      for (const poly of kad.vlakken.values()) bounds.extend(poly.getBounds());

      if (bounds.isValid()) {
        boundsRef.current = bounds;
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      } else if (lat != null && lon != null) {
        map.setView([lat, lon], 14);
      }

      // Bewust géén "klik naast de vlakken = alles wissen": bij het
      // aanklikken van meerdere percelen was één misklik anders een
      // sloopknop voor de hele selectie (wens Steven). Wissen kan per vlak
      // (nogmaals klikken) of in één keer via de knop "Wis selectie".
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

  // Laag-toggles.
  useEffect(() => {
    achtergrondRef.current?.setUrl(PDOK_TILES(grijzeKaart ? "grijs" : "standaard"));
    achtergrondRef.current
      ?.getContainer()
      ?.classList.toggle("ondergrond-grijs", grijzeKaart);
  }, [grijzeKaart]);
  useEffect(() => {
    const map = mapRef.current;
    const laag = natRef.current;
    if (!map || !laag) return;
    if (toonNatura) laag.addTo(map);
    else laag.remove();
  }, [toonNatura]);
  useEffect(() => {
    const map = mapRef.current;
    const laag = nnnRef.current;
    if (!map || !laag) return;
    if (toonNnn) {
      laag.addTo(map);
      // Grijze PDOK-stijl groen kleuren (na elke addTo opnieuw).
      laag.getContainer()?.classList.add("nnn-groen");
    } else {
      laag.remove();
    }
  }, [toonNnn]);

  // Kadastrale weergave: de gekleurde beheer-laag maakt plaats voor de
  // clean kadasterkaart met perceelnummers; selecties over en weer wissen.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !overzichtRef.current || !kadastraalLaagRef.current) return;
    if (kadastraal) {
      setSelectie([]);
      overzichtRef.current.remove();
      kadastraalLaagRef.current.addTo(map);
      werkLabelsBijRef.current?.();
    } else {
      setKadSelectie([]);
      kadastraalLaagRef.current.remove();
      overzichtRef.current.addTo(map);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kadastraal]);

  // Kaart → lijst: klik op een vlak, de rij springt in beeld. Klikken werkt
  // stapelend (meervoudige selectie); nogmaals klikken haalt hem er weer af.
  function toonInLijst(id: string) {
    setFilterGebruik(null);
    const wasGekozen = selectieRef.current.includes(id);
    setSelectie((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
    if (!wasGekozen) {
      // De rij staat mogelijk op het andere tabblad — dan eerst omschakelen.
      const o = objecten.find((x) => x.id === id);
      if (o) setLijstTab(kaartGroep(o) === "Gebouwen" ? "gebouwen" : "percelen");
      setTimeout(() => {
        document
          .getElementById(`weergave-rij-${id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 0);
    }
  }

  function toonKadInLijst(id: string) {
    const wasGekozen = kadSelectieRef.current.includes(id);
    setKadSelectie((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
    if (!wasGekozen) {
      document
        .getElementById(`weergave-kad-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  // Lijst → kaart: rij aanklikken stapelt de selectie; zoomen doet het
  // selectie-effect (gezamenlijke omtrek van alles wat aan staat).
  function selecteer(o: KaartObject) {
    setFilterGebruik(null);
    setSelectie((prev) =>
      prev.includes(o.id) ? prev.filter((x) => x !== o.id) : [...prev, o.id],
    );
  }

  function kiesFilter(gebruik: string) {
    setSelectie([]);
    setFilterGebruik((huidig) => (huidig === gebruik ? null : gebruik));
  }

  // Lijst-groepen (zelfde kopjes en volgorde als de invoerpagina).
  const groepenMap = new Map<KaartGroepLabel, KaartObject[]>(
    KAARTGROEP_LABELS.map((l) => [l, []]),
  );
  for (const o of objecten) groepenMap.get(kaartGroep(o))!.push(o);

  // Het ha-sommetje beweegt mee met de selectie: niets aangeklikt = het
  // totaal; wel iets aangeklikt = de som van wat er oplicht.
  const selectieM2 = selectie.reduce((som, id) => {
    const o = objecten.find((x) => x.id === id);
    return som + (o?.oppervlakteM2Som ?? 0);
  }, 0);
  const kadSelectieM2 = kadSelectie.reduce((som, id) => {
    const p = bezit.find((x) => x.id === id);
    return som + (p?.oppervlakteM2 ?? 0);
  }, 0);
  const somRegel =
    kadastraal && kadSelectie.length
      ? `Selectie: ${haGetal(kadSelectieM2)} · ${kadSelectie.length} kadastra${kadSelectie.length > 1 ? "le percelen" : "al perceel"}`
      : !kadastraal && selectie.length
        ? `Selectie: ${haGetal(selectieM2)} · ${selectie.length} beheerperce${selectie.length > 1 ? "len" : "el"}`
        : `${totaalHa} ha · ${aantalPercelen} beheerpercelen · ${aantalGebouwen} gebouwen`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[13px] font-medium" style={{ color: "var(--text-2)" }}>
          {somRegel}
        </p>
        {(selectie.length > 0 || kadSelectie.length > 0) && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSelectie([]);
              setKadSelectie([]);
            }}
          >
            Wis selectie
          </button>
        )}
      </div>

      {/* Filter op gebruikssoort (niet in de kadastrale weergave). De chips
          volgen het actieve tabblad: perceel- of gebouw-gebruiksvormen. */}
      {!kadastraal && (
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span style={{ color: "var(--text-2)" }}>
            Licht op ({lijstTab === "gebouwen" ? "gebouwen" : "percelen"}):
          </span>
          {(lijstTab === "gebouwen" ? GEBRUIK_GEBOUW_OPTIES : GEBRUIK_OPTIES).map(
            (naam) => {
              const kleur = kleurVoorGebruik(naam);
              return (
                <button
                  key={naam}
                  type="button"
                  onClick={() => kiesFilter(naam)}
                  className="flex items-center gap-1.5 rounded-full border px-2.5 py-1"
                  style={{
                    borderColor: filterGebruik === naam ? kleur : "var(--border)",
                    background: filterGebruik === naam ? `${kleur}22` : undefined,
                    fontWeight: filterGebruik === naam ? 600 : 400,
                  }}
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ background: kleur }}
                  />
                  {naam}
                </button>
              );
            },
          )}
          <button
            type="button"
            onClick={() => kiesFilter(GEEN_GEBRUIK)}
            className="flex items-center gap-1.5 rounded-full border px-2.5 py-1"
            style={{
              borderColor:
                filterGebruik === GEEN_GEBRUIK ? KLEUR_GEEN_GEBRUIK : "var(--border)",
              background:
                filterGebruik === GEEN_GEBRUIK ? `${KLEUR_GEEN_GEBRUIK}22` : undefined,
              fontWeight: filterGebruik === GEEN_GEBRUIK ? 600 : 400,
            }}
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: KLEUR_GEEN_GEBRUIK }}
            />
            nog geen gebruik
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-[12.5px]" style={{ color: "var(--text-2)" }}>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={kadastraal}
            onChange={(e) => setKadastraal(e.target.checked)}
          />
          Kadastrale weergave (alle perceelnummers)
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={grijzeKaart}
            onChange={(e) => setGrijzeKaart(e.target.checked)}
          />
          Grijze ondergrond
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={toonNatura}
            onChange={(e) => setToonNatura(e.target.checked)}
          />
          Natura 2000 tonen
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={toonNnn}
            onChange={(e) => setToonNnn(e.target.checked)}
          />
          NNN tonen
        </label>
      </div>

      {/* Lijsten links, kaart rechts (sticky) — zelfde opzet als de invoer. */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-4">
        <div className="flex flex-col gap-2 lg:order-2 lg:sticky lg:top-4">
          <div
            ref={containerRef}
            className="card h-[480px] overflow-hidden lg:h-[calc(100vh-200px)]"
            style={{ padding: 0 }}
          />
          <p className="text-[12px]" style={{ color: "var(--text-2)" }}>
            Klik vlakken of rijen aan om ze op te laten lichten — meerdere
            tegelijk kan, nogmaals klikken haalt ze er weer af, en met
            &quot;Wis selectie&quot; is alles in één keer uit. Kleur = gebruik.
          </p>
        </div>

        <div className="flex flex-col gap-3 lg:order-1">
          {kadastraal ? (
            /* Kadastrale weergave: alle percelen plat onder elkaar. */
            <div className="card p-4">
              <div
                className="mb-2 text-[12px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--text-2)" }}
              >
                Kadastrale percelen ({bezit.length})
              </div>
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {bezit.map((p) => (
                  <div
                    key={p.id}
                    id={`weergave-kad-${p.id}`}
                    className="flex items-center gap-3 py-2"
                    style={{
                      background: kadSelectie.includes(p.id)
                        ? "var(--primary-light)"
                        : undefined,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toonKadInLijst(p.id)}
                      className="flex-1 text-left text-[13.5px] font-medium"
                    >
                      {p.aanduiding}
                      {p.oppervlakteHa && (
                        <span className="font-normal" style={{ color: "var(--text-2)" }}>
                          {" "}· {p.oppervlakteHa}
                        </span>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Grond en gebouwen als aparte tabbladen. */}
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`btn btn-sm ${lijstTab === "percelen" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => {
                    setLijstTab("percelen");
                    setFilterGebruik(null);
                  }}
                >
                  Percelen (
                  {objecten.filter((o) => kaartGroep(o) !== "Gebouwen").length})
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${lijstTab === "gebouwen" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => {
                    setLijstTab("gebouwen");
                    setFilterGebruik(null);
                  }}
                >
                  Gebouwen (
                  {objecten.filter((o) => kaartGroep(o) === "Gebouwen").length})
                </button>
              </div>
              {KAARTGROEP_LABELS.filter((l) =>
                lijstTab === "gebouwen" ? l === "Gebouwen" : l !== "Gebouwen",
              ).map((label) => {
              const lijst = groepenMap.get(label)!;
              if (lijst.length === 0) return null;
              return (
                <div key={label} className="card p-4">
                  <div
                    className="mb-2 text-[12px] font-semibold uppercase tracking-wide"
                    style={{ color: "var(--text-2)" }}
                  >
                    {label} ({lijst.length})
                  </div>
                  <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                    {/* Gebouwen als clusters: bijgebouwen ingesprongen onder
                        hun hoofdgebouw. */}
                    {(label === "Gebouwen"
                      ? ordenGebouwen(lijst)
                      : lijst.map((item) => ({ item, ingesprongen: false }))
                    ).map(({ item: o, ingesprongen }) => {
                      // Filter actief: passende rijen lichten op in de
                      // filterkleur, de rest dimt licht — zelfde taal als de
                      // kaart (wens Steven).
                      const filterRaak =
                        !selectie.length &&
                        filterGebruik != null &&
                        (o.gebruik ?? GEEN_GEBRUIK) === filterGebruik;
                      const filterMis =
                        !selectie.length && filterGebruik != null && !filterRaak;
                      return (
                      <div
                        key={o.id}
                        id={`weergave-rij-${o.id}`}
                        className="flex items-center gap-3 py-2.5"
                        style={{
                          background: selectie.includes(o.id)
                            ? "var(--primary-light)"
                            : filterRaak
                              ? `${kleurVoorGebruik(o.gebruik)}1f`
                              : undefined,
                          opacity: filterMis ? 0.45 : undefined,
                          paddingLeft: ingesprongen ? 18 : undefined,
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
                      </div>
                      );
                    })}
                  </div>
                </div>
              );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
