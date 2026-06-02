---
title: "feat: Standalone kaart.html met PDOK perceel + BAG-pand layers"
status: abandoned
abandoned: 2026-06-02
created: 2026-06-02
type: feat
depth: standard
origin: none (direct invocation)
target_repo: denieuwerentmeesters
---

> **Abandoned 2026-06-02.** Geïmplementeerd en live getest. PDOK BRK + BAG WFS-lagen
> werkten, maar in de praktijk bleek de kaart te complex en te weinig toegevoegde
> waarde te bieden in de huidige fase. `kaart.html` verwijderd; statische kaart-card
> op Overzicht ook verwijderd. Plan blijft staan als referentie voor latere
> heroverweging (mogelijk in combinatie met Supabase + multi-user).


# feat: Standalone kaart.html met PDOK perceel + BAG-pand layers

## Summary

Bouw een zelfstandig `kaart.html` bestand in `denieuwerentmeesters/` dat dient als interactieve perceel- en gebouwen-kaart voor de landgoedbeheertool. Eén HTML-bestand met Leaflet (CDN), vanilla JavaScript en `localStorage` als data-laag. Alle geo-data komt rechtstreeks uit PDOK (Locatieserver, BRK WFS, BAG WFS). De Landgoed-tab in `index.html` krijgt een knop "Kaart openen" die naar `kaart.html` linkt.

Functionaliteit:

1. **Zoekbalk** — adres/plaatsnaam → PDOK Locatieserver → dropdown → kaart centreert op selectie.
2. **Kaart** — OSM-basemap; BRK-percelen (groene polygonen) + BAG-panden (oranje polygonen), bbox-gedreven geladen. Kleuren reflecteren beheerstatus uit `localStorage`.
3. **Zijpaneel** — klik op perceel of pand → paneel rechts toont PDOK-metadata + bewerkbaar formulier; "Opslaan" persist naar `localStorage` en herkleurt direct de polygoon.

`localStorage` is de tijdelijke data-laag; key-shape (`perceel_{id}` / `gebouw_{id}`) is gekozen zodat migratie naar Supabase later 1:1 mapt op een row.

## Problem Frame

De huidige `index.html` toont op de Landgoed-tab statische tekst over percelen en objecten. Een rentmeester wil tijdens veldwerk en in gesprekken met pachters/eigenaren snel kunnen zien: welk perceel is dit, wie pacht het, wanneer loopt het af, welke staat heeft het gebouw, wat is de actiepunt-status. Dat vraagt een visuele perceel-/pand-kaart met directe bewerkmogelijkheid, zonder backend (project zit nog in mockup-/prototype-fase).

PDOK biedt alle benodigde geo-bronnen open en gratis aan, zonder authenticatie. Door alles client-side te bouwen blijft het project consistent met de bestaande aanpak (één HTML-bestand, geen build) en is er nog geen Supabase-werk nodig.

## Requirements

| ID | Requirement | Bron |
|----|-------------|------|
| R1 | Zoekbalk bovenaan; PDOK Locatieserver `free`-endpoint; dropdown met max 5 resultaten; selectie centreert kaart op coordinaten | gebruiker |
| R2 | Leaflet-kaart met OSM-basemap, standaard centrum op Gunterstein (Vechtstreek) zoom 15 | gebruiker + project-context |
| R3 | BRK-percelen via WFS, bbox-gedreven, getekend als groene polygonen; min-zoom gate om overbevraging te voorkomen | gebruiker + agent default |
| R4 | BAG-panden via WFS, bbox-gedreven, `count=200`; getekend als oranje polygonen; min-zoom gate | gebruiker |
| R5 | Perceel-kleur reflecteert pacht-status uit localStorage: groen (pacht >1 jaar), geel (<1 jaar), rood (verlopen/geen pachter), grijs (niet ingevuld) | gebruiker |
| R6 | Pand-kleur reflecteert conditie uit localStorage: groen (uitstekend/goed), geel (redelijk), rood (matig/slecht), grijs (niet ingevuld) | gebruiker |
| R7 | Klik op perceel → zijpaneel rechts opent met kadastraal nummer, oppervlakte (uit WFS) en formulier (grondgebruik, pachter, einddatum, subsidieregeling, opmerkingen) | gebruiker |
| R8 | Klik op pand → zijpaneel rechts opent met bouwjaar, gebruiksfunctie, oppervlakte (uit BAG) en formulier (naam, conditie, inspectiedatum, onderhoudshistorie-lijst, actiepunten-lijst, opmerkingen) | gebruiker |
| R9 | "Opslaan"-knop schrijft naar `localStorage`; kaartkleur update direct na opslaan zonder reload | gebruiker |
| R10 | Vanuit `index.html` Landgoed-tab is `kaart.html` bereikbaar via knop/link | gebruiker |
| R11 | Eén HTML-bestand, geen build-stap, geen npm; alle dependencies via CDN | gebruiker (tech constraint) |

## Key Technical Decisions

**KTD1. Standalone bestand naast `index.html`, geen embed.**
`kaart.html` wordt een zelfstandige pagina. De Landgoed-tab in `index.html` krijgt een knop "Kaart openen" met `onclick="window.location.href='kaart.html'"`. Geen iframe (breekt single-file principe, geeft scrollbar-issues en lostgeraakte z-index met Leaflet-popups). Geen module-import (geen build). Wel een terug-link in `kaart.html` naar `index.html`.

**KTD2. Leaflet 1.9.x via unpkg CDN.**
`https://unpkg.com/leaflet@1.9.4/dist/leaflet.css` + `leaflet.js`. Stabiele versie, geen wijzigingen verwacht. SRI-hash optioneel (kost weinig, voorkomt CDN-tamper).

**KTD3. PDOK direct vanuit browser, geen proxy.**
PDOK-endpoints serven CORS-headers correct voor browser-clients. Geen serverless-functie nodig. Endpoints:
- Locatieserver: `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q={q}&rows=5`
- BRK WFS: `https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0` (typeName `Perceel`, output `application/json`, SRS `EPSG:4326`). *Let op: de gebruiker noemde `service.pdok.nl/brk/perceel/wfs/v2_0`; in implementatie eerst dit endpoint testen en daarna v5_0 (kadastralekaart) als fallback. Beide leveren perceelpolygonen — exact endpoint kiezen we tijdens implementatie op basis van wat een 200 met geldige GeoJSON geeft.*
- BAG WFS: `https://service.pdok.nl/lv/bag/wfs/v2_0` (typeName `bag:pand`, output `application/json`, SRS `EPSG:4326`).

**KTD4. BBox-loading met debounce + min-zoom gate.**
Op `moveend` event van Leaflet → debounce 500ms → fetch nieuwe bbox. Min-zoom: BRK alleen bij zoom ≥ 14, BAG bij zoom ≥ 15. Onder die zoom worden bestaande lagen geleegd (anders dumpt de browser duizenden features). Bij zoom-uit blijft de kaart bruikbaar; bij zoom-in laden polygonen on-demand.

**KTD5. localStorage key-shape: `perceel_{kadastraal_id}` / `gebouw_{pand_id}`.**
Value is JSON-stringified object met velden uit het formulier + `updated_at` ISO-timestamp. Key bevat de PDOK-identifier (BRK kadastraal nummer / BAG identificatie) zodat ze stabiel zijn over sessies. Migratie naar Supabase later: één row per key, zelfde shape.

**KTD6. Kleur-mapping wordt afgeleid bij rendering, niet opgeslagen.**
Pacht-einddatum → kleur is een functie (datum > vandaag + 1jr = groen; < 1jr = geel; verlopen of leeg pachter = rood; perceel zonder localStorage entry = grijs). Niet de kleur zelf in localStorage. Zo blijft kleur consistent als regels veranderen.

**KTD7. Zijpaneel is fixed-position overlay, niet split-pane.**
Paneel `position: fixed; right: 0; width: 380px; height: 100vh` met slide-in transform. Kaart blijft 100% width eronder (geen reflow → geen Leaflet `invalidateSize()` nodig na open/close).

**KTD8. Onderhoudshistorie + actiepunten als arrays in het gebouw-object.**
Niet als losse localStorage keys. Eén lees-/schrijfactie per gebouw. UI rendert lijst met "+ regel toevoegen" knop die row in array pusht en form re-rendert.

**KTD9. Geen authenticatie, geen user-context.**
Mockup-fase. Multi-user / Supabase-RLS volgt in een latere plan.

---

## High-Level Technical Design

### Lagen-architectuur

```
┌──────────────────────────────────────────────────────────────┐
│                        kaart.html                             │
│                                                                │
│  ┌──────────────┐   ┌──────────────────┐  ┌─────────────────┐│
│  │  Zoekbalk    │   │   Leaflet kaart  │  │  Zijpaneel      ││
│  │  (PDOK LS)   │   │   (OSM tiles)    │  │  (klik-driven)  ││
│  └──────┬───────┘   │                  │  │                 ││
│         │           │  ┌────────────┐  │  │  ┌───────────┐  ││
│         └──setView──▶  │ Perceel-   │  │  │  │ Perceel-  │  ││
│                     │  │ laag (BRK) │──┼──┼─▶│ formulier │  ││
│                     │  └────────────┘  │  │  └───────────┘  ││
│                     │  ┌────────────┐  │  │  ┌───────────┐  ││
│                     │  │ Pand-laag  │──┼──┼─▶│ Pand-     │  ││
│                     │  │ (BAG)      │  │  │  │ formulier │  ││
│                     │  └────────────┘  │  │  └───────────┘  ││
│                     └─────┬────────────┘  └────────┬────────┘│
│                           │ moveend (debounced)    │ save    │
│                           ▼                        ▼          │
│             ┌──────────────────┐         ┌──────────────────┐│
│             │ PDOK WFS fetch   │         │   localStorage   ││
│             │ (BRK + BAG)      │◀────────│ perceel_*        ││
│             │                  │         │ gebouw_*         ││
│             └──────────────────┘         └──────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

### State-flow bij gebruikersacties

```
[Zoek "Vreeland"]
  → fetch Locatieserver
  → toon dropdown 5 results
  → click result
  → map.setView(lat, lon, 15)
  → moveend fires
    → debounce 500ms
    → fetch BRK + BAG voor nieuwe bbox
    → render polygonen met kleur o.b.v. localStorage

[Klik op perceel]
  → e.layer = feature
  → read localStorage["perceel_" + kadastraalId]
  → open zijpaneel, vul formulier
  → user wijzigt veld + "Opslaan"
  → write localStorage
  → recolor specifieke polygoon (geen full reload)
```

### Kleur-decisietabel

| Entiteit | Conditie | Kleur (fill) |
|----------|----------|--------------|
| Perceel | geen localStorage entry | `#9CA3AF` grijs |
| Perceel | localStorage maar geen pachter / pacht verlopen | `#DC2626` rood |
| Perceel | pacht einddatum < vandaag + 1 jaar | `#F59E0B` geel |
| Perceel | pacht einddatum ≥ vandaag + 1 jaar | `#22C55E` groen |
| Pand | geen localStorage entry | `#9CA3AF` grijs |
| Pand | conditie "matig" of "slecht" | `#DC2626` rood |
| Pand | conditie "redelijk" | `#F59E0B` geel |
| Pand | conditie "uitstekend" of "goed" | `#22C55E` groen |

Standaard stroke voor percelen blijft groen-tint, voor panden oranje-tint, om type visueel te onderscheiden van conditie-fill.

---

## Output Structure

```
denieuwerentmeesters/
├── index.html               (gewijzigd — knop "Kaart openen" op Landgoed-tab)
├── kaart.html               (nieuw — volledige kaart-functionaliteit)
└── docs/
    └── plans/
        └── 2026-06-02-002-feat-kaart-html-landgoedbeheer-plan.md
```

Eén nieuw bestand `kaart.html`, één edit in `index.html`. Geen subdirectories, geen build-output.

---

## Implementation Units

### U1. Bestand-skeleton + Leaflet basemap

**Goal:** `kaart.html` met basis-layout (header, kaart-container, lege zijpaneel-container, footer-link "← Terug naar dashboard"), Leaflet ingeladen via CDN, OSM-tiles renderend, default-view op Gunterstein.

**Requirements:** R2, R11

**Dependencies:** geen

**Files:**
- `kaart.html` (nieuw)

**Approach:**
- HTML5 doctype, `<meta viewport>`, Plus Jakarta Sans font (consistent met `index.html`).
- Leaflet CSS + JS via `https://unpkg.com/leaflet@1.9.4/dist/`.
- CSS-variabelen overnemen uit `index.html` (`--primary`, `--primary-mid`, `--bg`, `--white`, `--border`, `--red`, `--amber`) zodat look consistent is — copy-paste uit `:root` block.
- Layout: full-screen `#map`-div met header-bar erboven (zoek + back-link). Zijpaneel-container is `position: fixed; right: -380px` (verborgen), met transitie.
- Map init: `L.map('map').setView([52.197, 5.005], 15)` (Gunterstein-omgeving Vreeland).
- OSM-tile layer met attribution.

**Patterns to follow:** kleurpalet en typografie uit `index.html` `:root` block. Geen frameworks.

**Test scenarios:**
- Open `kaart.html` in Chrome/Safari → kaart laadt, OSM-tiles zichtbaar, viewport centreert op Vechtstreek.
- Resize browser → kaart blijft full-screen.
- Klik "← Terug naar dashboard" → navigeert naar `index.html`.

**Verification:** Pagina laadt zonder console-errors; Leaflet draait.

---

### U2. PDOK Locatieserver zoek-dropdown

**Goal:** Zoekbalk in header die bij typen (debounce 300ms) PDOK Locatieserver bevraagt en dropdown met max 5 resultaten toont. Klik op resultaat → kaart pant + zoomt naar locatie.

**Requirements:** R1

**Dependencies:** U1

**Files:**
- `kaart.html` (wijzig — zoek-UI + JS)

**Approach:**
- `<input type="search">` + onderliggende `<ul>` dropdown (verborgen tot results).
- `input`-event → debounce 300ms → `fetch('https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=' + encodeURIComponent(q) + '&rows=5')`.
- Response heeft `response.docs[]` met `weergavenaam` en `centroide_ll` (formaat `POINT(lon lat)`). Parse coords met regex.
- Click handler op `<li>`: `map.setView([lat, lon], 16)` + sluit dropdown.
- Klik buiten input/dropdown → sluit dropdown.
- Escape-toets → sluit dropdown.

**Patterns to follow:** debounce-helper inline functie `(fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>fn(...a), ms); } }`. Geen library.

**Test scenarios:**
- Type "Vreeland" → dropdown toont resultaten binnen 1s.
- Klik resultaat → kaart centreert op coordinaten.
- Type "asdfghjkl" → dropdown leeg of zonder resultaten, geen crash.
- Type lege string → dropdown sluit.
- Network offline → fetch faalt → dropdown toont nette "Geen verbinding" boodschap, geen JS-error in console.

**Verification:** Zoek werkt voor ten minste 5 verschillende NL plaatsnamen + adressen; geen XSS bij weergeven van resultaat (gebruik `textContent`, niet `innerHTML`).

---

### U3. BRK perceel-laag met bbox-loading

**Goal:** Perceel-polygonen ophalen van PDOK BRK WFS op basis van huidige kaart-bbox, debounced op `moveend`, met min-zoom-gate ≥ 14. Polygonen renderen met groene stroke + grijze fill als default.

**Requirements:** R3, R5 (kleur-basis; volledige kleurlogica in U6)

**Dependencies:** U1

**Files:**
- `kaart.html` (wijzig — WFS-fetch + L.geoJSON layer)

**Approach:**
- L.geoJSON laag (`perceelLayer`) leeg geinitialiseerd, `addTo(map)`.
- `loadPercelen()` functie:
  - Check `map.getZoom() < 14` → `perceelLayer.clearLayers()`, return.
  - `bounds = map.getBounds()`; bouw bbox-string `west,south,east,north,EPSG:4326`.
  - Fetch WFS-endpoint (zie KTD3) met query params.
  - Parse GeoJSON-response; `perceelLayer.clearLayers()`; `perceelLayer.addData(geojson)`.
  - `style`-callback geeft default kleur (definitieve kleur via U6).
- Bind aan `map.on('moveend', debounce(loadPercelen, 500))`.
- Initial call: na `map.whenReady()`.

**Execution note:** test eerst handmatig de PDOK BRK endpoint-URL in browser (paste in adresbalk met bbox van Vreeland) om vorm van GeoJSON-response te valideren voordat je parsing schrijft. PDOK heeft v2_0 + v5_0 varianten — kies degene die `Polygon`/`MultiPolygon` geometrie levert in `application/json` zonder server-side transformatie.

**Patterns to follow:** `L.geoJSON(null, { style: featureStyleFn, onEachFeature: bindClickHandler })`. Hergebruik debounce uit U2.

**Test scenarios:**
- Pan kaart binnen Vechtstreek op zoom 15 → percelen verschijnen binnen 1s.
- Zoom uit naar 10 → percelen verdwijnen, geen WFS-call meer.
- Zoom in naar 18 → percelen blijven zichtbaar.
- Snel pannen → debounce voorkomt > 1 fetch per 500ms (verifieer in Network tab).
- WFS-call faalt (forceer met DevTools throttle/block) → kaart blijft werken, error naar console + niet-blokkerende toast/melding.
- Response met 0 features → geen JS-error, laag is leeg.

**Verification:** Op zoom 15 in Vechtstreek toont kaart ≥ 10 perceelpolygonen die overeenkomen met PDOK BRK-viewer.

---

### U4. BAG pand-laag met bbox-loading

**Goal:** Pand-polygonen ophalen van PDOK BAG WFS, bbox-gedreven, debounced op `moveend`, min-zoom-gate ≥ 15, `count=200`. Render met oranje stroke + grijze fill als default.

**Requirements:** R4, R6 (kleur-basis)

**Dependencies:** U1 (parallel aan U3 mogelijk maar liever sequentieel om patroon te valideren)

**Files:**
- `kaart.html` (wijzig — tweede WFS-fetch + L.geoJSON layer)

**Approach:**
- Hergebruik patroon uit U3. Aparte `gebouwLayer`.
- Endpoint en typeName uit KTD3.
- Onthoud: BAG `pand`-features hebben property `identificatie` (de pand-ID) + `bouwjaar` + `oppervlakte_min`/`oppervlakte_max` + `gebruiksdoel` (array van strings).
- Aparte debounce-call (of share dezelfde 500ms tick) — beide fetches starten dan parallel na moveend.

**Test scenarios:**
- Zoom 15 in Vreeland-centrum → panden + percelen samen zichtbaar, panden visueel onderscheidbaar door oranje stroke.
- Zoom 13 → beide lagen leeg.
- Zoom 14 → percelen zichtbaar, panden leeg (verifieer onafhankelijke zoom-gates).
- Pand-laag levert exact `count=200` max — verifieer dat dichtbevolkte gebieden geen geheugen-explosie geven.

**Verification:** PDOK BAG-viewer en `kaart.html` tonen dezelfde panden op dezelfde locatie.

---

### U5. Zijpaneel-skeleton + klik-binding

**Goal:** Zijpaneel-component dat opent bij klik op perceel of pand, met sluit-knop, en die de PDOK-metadata (kadastraal nr / bouwjaar / oppervlakte / gebruiksfunctie) leesbaar toont. Formulier is in deze unit nog leeg-placeholder.

**Requirements:** R7 (deels), R8 (deels)

**Dependencies:** U3, U4

**Files:**
- `kaart.html` (wijzig — zijpaneel HTML + CSS + open/close JS)

**Approach:**
- HTML: `<aside id="sidepanel">` met header (titel + close-X) + scrollable content.
- CSS: slide-in via `transform: translateX(0)` als `.open` class aanwezig is.
- JS: `openSidepanel(type, feature)` met `type ∈ {'perceel', 'gebouw'}`:
  - Vul header met type-label + identificatie.
  - Vul metadata-block (read-only) met properties uit GeoJSON feature.
  - Voor nu: formulier-block is `<p>TODO formulier (U6/U7)</p>`.
- Klik-handler in `onEachFeature` van beide L.geoJSON lagen: `feature.layer.on('click', () => openSidepanel(type, feature))`.
- Close-X handler + Escape-toets handler.
- Klik op kaart buiten polygoon → sluit niet (anders frustrerend tijdens schrijven). Alleen expliciete close.

**Test scenarios:**
- Klik op perceel → paneel slidet in vanaf rechts; kadastraal nr + oppervlakte zichtbaar.
- Klik op pand → paneel toont bouwjaar + gebruiksdoel + oppervlakte.
- Klik andere polygoon terwijl paneel open → paneel inhoud wisselt, paneel blijft open.
- Klik close-X → paneel sluit.
- Escape → paneel sluit.
- Klik buiten paneel op kaart → paneel blijft open (verifieer expliciet gewenst gedrag).

**Verification:** Metadata in paneel komt 1:1 overeen met properties die PDOK in GeoJSON-response stuurt voor dat feature.

---

### U6. Perceel-formulier + localStorage + kleur-update

**Goal:** Volledig perceel-formulier (grondgebruik, pachter, pacht einddatum, subsidieregeling, opmerkingen) inclusief Opslaan-knop die naar `localStorage` schrijft. Kleur-functie voor perceel-polygonen op basis van localStorage. Kleur update direct na opslaan.

**Requirements:** R5, R7, R9

**Dependencies:** U3, U5

**Files:**
- `kaart.html` (wijzig — formulier + style-functie + save-flow)

**Approach:**
- Formulier-HTML in `openSidepanel('perceel', ...)`:
  - Grondgebruik: `<select>` met opties `bos / natuur / agrarisch / water / erf / overig`.
  - Pachter: `<input type="text">`.
  - Pacht einddatum: `<input type="date">`.
  - Subsidieregeling: `<select>` met `SNL / ANLb / geen / onbekend`.
  - Opmerkingen: `<textarea>`.
  - Opslaan-knop.
- Pre-fill: lees `localStorage.getItem('perceel_' + kadastraalId)`, JSON-parse, vul velden.
- Op submit:
  - Bouw object `{ grondgebruik, pachter, einddatum, subsidie, opmerkingen, updated_at: new Date().toISOString() }`.
  - `localStorage.setItem('perceel_' + id, JSON.stringify(obj))`.
  - Roep `perceelLayer.setStyle()` aan op de specifieke feature (lookup via id) of voor de hele laag: `perceelLayer.eachLayer(l => l.setStyle(perceelStyle(l.feature)))`.
  - Toon korte "Opgeslagen" toast in paneel.
- `perceelStyle(feature)` implementeert kleur-decisietabel (zie HTD).

**Test scenarios:**
- Open perceel zonder localStorage → form leeg, polygoon grijs.
- Vul pachter + einddatum (over 2 jaar) → Opslaan → polygoon wordt groen.
- Verander einddatum naar over 3 maanden → Opslaan → polygoon wordt geel.
- Verander einddatum naar gisteren → Opslaan → polygoon wordt rood.
- Wis pachter (leeg) → Opslaan → polygoon wordt rood.
- Refresh pagina → form toont opgeslagen data; kleur klopt.
- Open ander perceel → form toont andere data (geen state-bleeding).
- Inspecteer `localStorage` in DevTools → key `perceel_{id}` aanwezig met JSON-value.
- XSS-probe: pachter `<script>alert(1)</script>` → veld toont raw text bij re-open, geen script-execution (gebruik `value` op input, niet `innerHTML`).

**Verification:** Drie verschillende percelen ingevuld, pagina-refresh, alle drie tonen correcte kleur + form-data.

---

### U7. Gebouw-formulier met onderhoudshistorie en actiepunten

**Goal:** Pand-formulier met naam, conditie, inspectiedatum, opmerkingen + dynamische lijsten voor onderhoudshistorie (datum + omschrijving) en actiepunten (titel + prioriteit + status). "+ Regel toevoegen" knoppen. Opslaan persist alles. Kleur-functie voor pand-polygonen.

**Requirements:** R6, R8, R9

**Dependencies:** U4, U5, U6 (form-patroon)

**Files:**
- `kaart.html` (wijzig — pand-formulier + array-render + style)

**Approach:**
- Formulier-HTML in `openSidepanel('gebouw', ...)`:
  - Naam: `<input type="text">`.
  - Conditie: `<select>` met `uitstekend / goed / redelijk / matig / slecht`.
  - Laatste inspectiedatum: `<input type="date">`.
  - **Onderhoudshistorie sectie:** `<div>` met dynamisch gerenderde regels uit array `history[]`. Elke regel: date-input + text-input + verwijder-knop. "+ Regel toevoegen" pusht `{date: '', desc: ''}` in array en re-rendert.
  - **Actiepunten sectie:** dynamische lijst uit array `actions[]`. Elke regel: titel-input + prioriteit-select (`laag / normaal / hoog / urgent`) + status-select (`open / in_behandeling / gereed`) + verwijder-knop. "+ Taak toevoegen" pusht lege task in array.
  - Opmerkingen: `<textarea>`.
  - Opslaan.
- State-mgmt: bij open lees localStorage, deserialize arrays, render in vivo. Bij elke "+ toevoegen" update local form-state object + re-render alleen de betreffende sectie (niet hele paneel — anders verlies je focus).
- Op submit: schrijf object `{ naam, conditie, inspectie, history: [...], actions: [...], opmerkingen, updated_at }` naar `localStorage.setItem('gebouw_' + pandId, ...)`.
- `gebouwStyle(feature)` implementeert kleur-decisietabel (zie HTD).
- Na opslaan: update kleur (idem U6) + toast.

**Patterns to follow:** array-render-pattern: helper `renderHistory(container, items)` die DOM-children genereert; bij wijzig roept dezelfde helper opnieuw aan na items-array mutatie.

**Test scenarios:**
- Open pand → form toont bouwjaar + gebruiksdoel uit BAG read-only; onder formulier velden leeg.
- Vul conditie "goed" + Opslaan → polygoon wordt groen.
- Conditie naar "matig" → polygoon wordt rood.
- Klik "+ Regel toevoegen" in historie → nieuwe lege row verschijnt.
- Vul 3 historie-regels + Opslaan + refresh → alle 3 regels terug, in originele volgorde.
- Klik verwijder-knop op middelste historie-regel → blijft 2 over.
- Voeg actiepunt toe met prio "urgent" + status "open" → Opslaan → refresh → blijft staan.
- Wijzig status van bestaand actiepunt naar "gereed" → Opslaan → blijft.
- Wis alle conditie + Opslaan → polygoon wordt grijs (geen entry-equivalent: of expliciet: conditie leeg = grijs).
- localStorage-quota probe: voeg 100 historie-regels toe (handmatig of via console) → moet werken (quota is 5-10MB, ruim genoeg).

**Verification:** Twee panden volledig ingevuld met meerdere onderhoudsregels en actiepunten; pagina-refresh; alles intact en kleur correct.

---

### U8. Integratie met Landgoed-tab in `index.html`

**Goal:** Bestaande Landgoed-tab in `index.html` krijgt een knop "Kaart openen" die naar `kaart.html` linkt. Cosmetisch: knop past in bestaand design.

**Requirements:** R10

**Dependencies:** U1 (kaart.html bestaat)

**Files:**
- `index.html` (wijzig — knop op `#page-landgoed`)

**Approach:**
- Op regel ~708 in `index.html` staat al `<button class="btn btn-ghost btn-sm">Kadasterkaart openen</button>` als placeholder. Wijzig naar `<a href="kaart.html" class="btn btn-primary btn-sm">Interactieve kaart openen</a>` (of een `<button onclick="window.location.href='kaart.html'">`).
- Geen overige wijzigingen aan `index.html` — minimale scope om diff klein te houden.

**Test scenarios:**
- Open `index.html` → klik Landgoed-tab → knop "Interactieve kaart openen" zichtbaar.
- Klik knop → browser navigeert naar `kaart.html`.
- Op `kaart.html` klik "← Terug naar dashboard" (uit U1) → navigeert naar `index.html` (Overzicht-tab default).

**Verification:** Round-trip `index.html` → `kaart.html` → `index.html` werkt.

**Test expectation:** geen automated tests — handmatige browser-verificatie volstaat voor link-werking. Geen feature-bearing logica.

---

## Scope Boundaries

**In scope:**
- Eén nieuw bestand `kaart.html` met alle functionaliteit hierboven.
- Eén-regel wijziging in `index.html` voor de tab-link.

**Deferred to Follow-Up Work:**
- **Supabase-migratie**: `localStorage` keys zijn al gevormd als `perceel_{id}` / `gebouw_{id}`; latere stap is row-mapping + RLS.
- **Multi-user / authenticatie**: geen user-context in deze fase.
- **Sync tussen `kaart.html` en de Landgoed-tab tabel** (objecten op het landgoed): zou het mooist via shared store, vraagt design-besluit (events vs polling van localStorage vs full backend).
- **WMS/WMTS fallback** als WFS te traag is voor grote bbox: nog niet nodig zolang min-zoom gate werkt.
- **Pacht-status / conditie als filter** (toon alleen rode percelen) — UI nice-to-have voor v2.
- **Bulk-export** (CSV/GeoJSON van alle localStorage data) — handig voor backup voordat we naar Supabase migreren, maar geen blokker.

**Outside this product's identity:**
- Server-side endpoints of een eigen backend — project is bewust client-only voor nu.
- Geo-bewerking (perceelgrenzen tekenen/wijzigen): PDOK is bronwaarheid, niet bewerken.
- Schaal-features (clustering, vector tiles) — single-landgoed scope.

---

## Risks & Dependencies

| Risico | Impact | Mitigatie |
|--------|--------|-----------|
| PDOK BRK endpoint-URL/versie blijkt niet exact wat gebruiker noemde | Medium — kaart toont geen percelen | KTD3 + U3 execution note: handmatig endpoint testen vóór parsing. Fallback v5_0 endpoint. |
| WFS-response op laag-zoom levert duizenden features → browser-vries | Hoog | Min-zoom gate (KTD4) + `count=200` op BAG. BRK kent geen `count` param maar zoom-14 begrenst genoeg. |
| PDOK rate-limit of throttling tijdens demo | Medium | Debounce 500ms + min-zoom; geen retry-storm. Tijdens demo niet meer dan een paar moves. |
| `localStorage` quota-overschrijding | Laag | 5-10MB is ruim voor honderden percelen + panden. Quota-exceeded → try/catch toont nette melding. |
| CORS-headers wijzigen aan PDOK-zijde | Laag (PDOK is stabiel) | Geen mitigatie nodig nu; als het ooit breekt: serverless proxy. |
| Klik op overlappende polygonen (perceel onder pand) opent verkeerde paneel | Medium UX | Z-order: panden boven percelen. Klik registreert op bovenste laag. Documenteren in U5. |
| Verloren `localStorage` bij browser-clear / incognito | Hoog voor data-persistentie | Mockup-fase accepteert dit. Export-knop is in Deferred. |

**Externe dependencies:**
- Leaflet 1.9.4 via unpkg CDN (alternatief: cdnjs).
- OpenStreetMap tile-servers (publieke tile-policy: dev/demo OK, geen high-volume productie).
- PDOK Locatieserver, BRK WFS, BAG WFS endpoints.

---

## System-Wide Impact

- **`index.html`**: één link/knop wijziging op Landgoed-tab. Geen breaking changes aan bestaande tabs.
- **Routing**: tweetal HTML-bestanden in root; geen router nodig (browser-native navigation).
- **Styling**: copy-paste van CSS-variabelen, geen shared stylesheet. Bij latere refactor naar shared `styles.css` blijft kaart.html werkend.
- **Geen impact op**: documenten/relaties/financieel/taken tabs of bestaande mockup-functionaliteit.

---

## Open Questions

| Vraag | Type | Owner |
|-------|------|-------|
| BRK WFS exact endpoint (v2_0 `brk/perceel` vs v5_0 `kadaster/kadastralekaart`)? | Implementation-time test (U3) | Implementer |
| Default kaart-center: Gunterstein-coördinaten of dynamisch via "huidige landgoed"-context? | Plan-time, nu vastgelegd op Vechtstreek-centrum (Gunterstein). | Gebruiker kan tijdens demo overrulen. |
| Moet pacht-status-kleur naar perceel-stroke i.p.v. fill? | UX-keuze | Visueel testen in U6, keuze in implementatie. |

---

## Sources & Research

- PDOK Locatieserver docs: `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free`
- PDOK Kadastrale kaart (BRK) WFS: `https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0` (v5 is huidige hoofdversie).
- PDOK BAG WFS: `https://service.pdok.nl/lv/bag/wfs/v2_0`
- Leaflet docs: `https://leafletjs.com/reference.html` (L.geoJSON, L.map, L.tileLayer).
- Bestaande context: `index.html` Landgoed-tab (regel 701-799) — design-language, kleur-tokens, knop-patroon.

Externe research was niet load-bearing — PDOK-endpoints en velden zijn door gebruiker zelf aangeleverd; codebase-patroon (single HTML) is direct observeerbaar.
