---
title: "feat: Verwerk Hugo's feedback in Gunterstein mockup"
status: active
created: 2026-06-02
type: feat
depth: lightweight
origin: none (direct invocation)
target_repo: denieuwerentmeesters
---

# feat: Verwerk Hugo's feedback in Gunterstein mockup

## Summary

Hugo (partner) heeft de Gunterstein-mockup gereviewed en vraagt drie aanpassingen:

1. **Overzicht moet strakker** — alleen dagelijks beheer (agenda, openstaande taken, kaart). Geen statische landgoed-feiten meer in de KPI-grid.
2. **Financieel als eigen tab** — Guntenstein wil financiële administratie via de rentmeester laten lopen. Lara moet bij demo financiële KPI's zien.
3. **Taken als eigen tab** — wordt belangrijk onderdeel, per gebruiker filterbaar.

Daarnaast verplaatsen we hectare / rijksmonument feiten naar een nieuwe **Landgoed** tab (identiteitsblad van het object), en houden we de huidige kaart op Overzicht als statische SVG (interactieve versie volgt later).

Banking koppeling is **buiten scope** voor deze ronde — vereist backend (PSD2 aggregator zoals GoCardless Bank Account Data, Tink of Yapily). Wel een korte notitie in het plan zodat Lara weet dat het kan, plus mockdata.

## Problem Frame

De mockup wordt binnenkort aan Lara (Gunterstein) getoond. Hugo wil dat het Overzicht-tabblad fungeert als operationeel dashboard ("waar staan we vandaag?"), niet als statisch profiel. Tegelijk moet de financiële propositie zichtbaar worden — Guntenstein heeft al aangegeven die administratie bij de nieuwe rentmeester te willen onderbrengen, dus dat thema moet tastbaar zijn in de demo.

## Requirements

| ID | Requirement | Bron |
|----|-------------|------|
| R1 | Overzicht-tab toont uitsluitend dagelijks-beheer info: agenda, openstaande taken (per gebruiker), kaart, recente activiteit | Hugo |
| R2 | Statische landgoed-feiten (hectare, # rijksmonumenten, NSW, kadaster) verhuizen naar een eigen tab "Landgoed" | Hugo + agent default |
| R3 | Nieuwe tab "Financieel" met vijf KPI's: operationele kasstroom, onderhoudskosten vs budget, banksaldo, te betalen, te ontvangen | Hugo |
| R4 | Nieuwe tab "Taken" met filter per gebruiker en status | Reinoud |
| R5 | Overzicht toont compacte widgets die linken naar de nieuwe tabs (agenda → Agenda, mijn taken → Taken) | Reinoud |
| R6 | Bestaande nav-items (Documenten, Relaties, Subsidie, Regelgeving, Berichten, Agenda, Contracten, Onderhoud) blijven werken | Behoud |
| R7 | Plan benoemt expliciet hoe bankkoppeling later kan (PSD2 aggregator) zonder dat de mockup een echte koppeling probeert | Reinoud |

## Key Technical Decisions

**KTD1. Eén HTML-bestand blijft eén HTML-bestand.**
Geen build step, geen frameworks, geen split. Repo bestaat uit `index.html`. Pages worden al getoond/verborgen via `nav()` JS-functie en `.page.active` CSS. Nieuwe tabs volgen dezelfde pattern.

**KTD2. Dummy data hardcoded in HTML.**
Geen JSON-fetch, geen API. Cijfers in Financieel/Taken zijn statische strings, aansluitend bij Gunterstein-context (115 ha NSW-landgoed, kasteel + boerderij + Klein Boomrijk).

**KTD3. Bankkoppeling deferred, niet gemockt in flow.**
Op Financieel tab een kleine info-strip ("Banksaldo · ING · laatst bijgewerkt 2 uur geleden") die het concept toont, géén "Koppel bank" knop met dummy OAuth-flow. Lara begrijpt zo dat real-time koppeling mogelijk is, maar de mockup belooft niets dat we nog niet kunnen leveren. Bankintegratie krijgt later een eigen plan zodra backend besluit is genomen.

**KTD4. Landgoed-tab als nieuwe nav-positie bovenaan.**
Wordt visueel het "wat is dit landgoed"-startpunt. Plaatsing in nav: tussen huidige "Overzicht" en "Documenten".

**KTD5. Taken per gebruiker via filter-chips, niet via aparte tabs per persoon.**
Mockusers: *Lara (eigenaar)*, *Reinoud (rentmeester)*, *Hugo (partner)*, *Extern (aannemer)*. Default filter = ingelogde gebruiker (Reinoud) + status "open".

**KTD6. Overzicht "mijn taken" widget toont alleen top 3 van ingelogde gebruiker.**
Linkt naar Taken-tab voor volledige lijst. Voorkomt dat Overzicht weer dichtslibt.

## Output Structure

Geen nieuwe bestanden — alle wijzigingen binnen bestaande `index.html`. Geen build step, geen assets, geen JS-modules.

## Implementation Units

### U1. Nav: drie nieuwe items toevoegen

**Goal:** Nav-items voor Landgoed, Financieel, Taken toevoegen op de juiste positie.

**Requirements:** R2, R3, R4

**Dependencies:** geen

**Files:** `index.html` (rond regel 411-455 — sidebar nav block)

**Approach:**
- Volg bestaande `nav-item` pattern met `onclick="nav('<key>',this)"`
- Volgorde sidebar: Overzicht → **Landgoed** → Documenten → Relaties → Subsidie → Regelgeving → Berichten → Agenda → **Taken** → **Financieel** → Contracten → Onderhoud
- Taken-item krijgt urgent badge (`.nav-badge.urgent`) met getal "4" (huidige openstaande taken uit Overzicht KPI)
- Financieel-item krijgt neutrale badge "€" of geen badge
- Inline SVG icons in lijn met bestaande stijl (1.8 stroke, var(--text-2))

**Patterns to follow:** Bestaande nav-items op regels 411-455.

**Test scenarios:**
- Klik op elk van de drie nieuwe items → bijbehorende page wordt zichtbaar, vorige page verbergt
- Active state (`.nav-item.active`) verspringt mee
- Badge "4" op Taken rendert in rood/urgent kleur
- Sidebar overflow scrolt correct met 11 items (was 8)

**Verification:** Visueel check in browser, klik door alle nav items.

---

### U2. Nieuwe page: Landgoed (verhuisde KPI's)

**Goal:** Identiteitsblad van het landgoed — alle statische feiten die nu op Overzicht staan.

**Requirements:** R2

**Dependencies:** U1

**Files:** `index.html` (nieuwe `<div class="page" id="page-landgoed">` block, voor `id="page-subsidie"`)

**Approach:**
- Page-header: "Landgoed Gunterstein" / sub "Identiteit, oppervlakte, monumenten en kadaster"
- KPI-grid met 4 cards (zelfde `.kpi` styling):
  - Oppervlakte 115 ha (huidige featured KPI, behoud)
  - Rijksmonumenten 2 (Kasteel + Klein Boomrijk)
  - NSW-status (gerangschikt sinds jaartal — pak een mock jaartal)
  - Kadasterpercelen (aantal — mock "23 percelen")
- Card "Oppervlakteverdeling": bos / weiland / park / water als bar-chart (CSS bars, geen JS)
- Card "Objecten": tabel met Kasteel (1681), Hof van Gunterstein (boerderij), Klein Boomrijk, Koetshuis — kolommen: naam, type, monumentstatus, oppervlakte
- Card "Kadaster": tekst-blok met perceel-nummers (mock)

**Patterns to follow:** `.kpi-grid`, `.card`, `.grid-3-2` uit bestaande Overzicht (regel 561-687).

**Test scenarios:**
- Page rendert wanneer nav('landgoed') klikt
- KPI-grid responsive op smal scherm (zelfde gedrag als Overzicht)
- Tabel objecten leesbaar

**Verification:** Visueel klik door, vergelijk styling met Overzicht.

---

### U3. Nieuwe page: Financieel (Hugo's 5 KPIs + tabellen)

**Goal:** Financieel dashboard voor Lara — toont dat de rentmeester de admin kan voeren.

**Requirements:** R3, R7

**Dependencies:** U1

**Files:** `index.html` (nieuwe `<div class="page" id="page-financieel">`)

**Approach:**
- Page-header: "Financieel" / sub "Kasstroom, bank en debiteuren/crediteuren · Q2 2026"
- Info-strip bovenaan: "Banksaldo gesynchroniseerd via ING · laatst bijgewerkt 2u geleden" — geeft Lara hint dat dit live kan, zonder echte koppeling
- KPI-grid met 5 cards (gebruik bestaande `.kpi` styling, geen `.featured`):
  1. **Operationele kasstroom** — bv "€ +12.450" YTD met kleine trend (mock up/down)
  2. **Onderhoudskosten vs budget** — bv "€ 28k / € 45k" met % gevuld bar
  3. **Banksaldo** — bv "€ 87.320" (ING + Triodos uitgesplitst in sub-tekst)
  4. **Nog te betalen** — bv "€ 6.840" (3 facturen)
  5. **Nog te ontvangen** — bv "€ 14.200" (pacht + subsidievoorschot)
- Card "Crediteuren — openstaand": tabel met 3-5 regels (aannemer, hovenier, leverancier hooi, etc) — kolommen: leverancier, factuurnr, vervaldatum, bedrag, status-chip
- Card "Debiteuren — openstaand": tabel met 3-5 regels (pachter Hof van Gunterstein, jachthuurder, etc)
- Card "Onderhoudsbudget 2026": eenvoudige bar-list per gebouw (Kasteel / Koetshuis / Boerderij / Klein Boomrijk) met begroot vs werkelijk

**Patterns to follow:** `.kpi-grid`, `.card`, tabel-styling van Documenten of Subsidie tabs.

**Test scenarios:**
- Page rendert wanneer nav('financieel') klikt
- 5 KPI cards in grid, leesbaar op desktop
- Tabellen scrollbaar op smal scherm of stack
- Bedragen consistent geformatteerd (EUR, duizendtal-punt)

**Verification:** Visueel klik door. Check dat Hugo's 5 KPI's herkenbaar zijn.

---

### U4. Nieuwe page: Taken (filter per gebruiker + status)

**Goal:** Volledig takenoverzicht. Wordt belangrijke werkmodule voor rentmeester.

**Requirements:** R4

**Dependencies:** U1

**Files:** `index.html` (nieuwe `<div class="page" id="page-taken">`)

**Approach:**
- Page-header: "Taken & acties" / sub "Alle openstaande en afgeronde acties per landgoed"
- Page-actions: knop "Taak toevoegen" (button styling bestaand)
- Filter-strip: chips voor gebruiker (Iedereen / Lara / Reinoud / Hugo / Extern) + chips voor status (Open / In behandeling / Afgerond / Alle) — default actief: Reinoud + Open
- Taken-tabel of card-list met ~10 rijen, kolommen: titel, toegewezen aan (avatar + naam), categorie (Onderhoud/Pacht/Subsidie/Fiscaal/etc), deadline, prioriteit-chip, status-chip
- Mock-rijen kiezen uit context (MJOP dakinspectie, pachtcontract herziening, SIM-deadline, etc) — aansluitend bij bestaande Overzicht "Actie vereist" en "Recente activiteit"
- Filter-chips zijn klikbaar maar filter-logica mag dummy (geen JS implementatie, of simpele `.hidden` toggle als trivial). Doel = aantoonbare UX, niet functioneel filter

**Patterns to follow:** Tabel styling uit Documenten/Subsidie. Chip styling van filter-chips elders in repo (check Agenda regel 953+).

**Test scenarios:**
- Page rendert wanneer nav('taken') klikt
- Default-state toont Reinoud + Open taken
- Klik op gebruikersnaam-chip wisselt active state visueel
- Avatar-circle per gebruiker rendert met initialen (zelfde `.user-avatar` pattern, regel 75)

**Verification:** Visueel klik door. Check leesbaarheid op smal scherm.

---

### U5. Refit Overzicht (Hugo's hoofd-vraag)

**Goal:** Overzicht wordt operationeel dashboard. Hectare/monument KPI's eruit. Agenda + mijn-taken widgets erin. Kaart blijft. Recente activiteit blijft.

**Requirements:** R1, R5

**Dependencies:** U2 (omdat KPI's daarheen verhuizen)

**Files:** `index.html` regel 540-688 (`<div class="page active" id="page-overview">`)

**Approach:**
- Page-header behoud: "Landgoed Gunterstein" titel, page-sub mag korter ("Operationeel dagoverzicht — Breukelen, Stichtse Vecht") — geen "115 ha · NSW-gerangschikt · Rijksmonument 508234" meer (verhuist naar Landgoed tab)
- Alert-rood pachtcontract behoud (regel 556-559)
- **KPI-grid vervangen.** Nieuwe 4 KPI's gericht op dagelijks beheer:
  1. **Mijn open taken** "7" — sub "3 deze week, 1 urgent" (klikbaar → Taken tab)
  2. **Agenda vandaag/morgen** "2 items" — sub "NVR-bijeenkomst, dakinspectie" (klikbaar → Agenda tab)
  3. **Berichten ongelezen** "3" — sub "1 pachter, 2 advies" (klikbaar → Berichten)
  4. **Te betalen deze week** "€ 2.140" — sub "2 facturen" (klikbaar → Financieel)
- **`.grid-3-2` grid behoud:** linker grote card = kaart (huidige SVG behoud, regel 591-647). Rechts vervangt "Recente activiteit" door **twee** kleinere cards gestapeld:
  - **Mijn taken (top 3)** — 3 rijen met titel + deadline + prioriteit-dot. Link "Alle taken" → Taken-tab
  - **Agenda komende 7 dagen** — 3 rijen met datum + titel. Link "Volledige agenda" → Agenda-tab
- "Recente activiteit" card verdwijnt van Overzicht (kan eventueel terug onder de kaart, of weg — Hugo's punt was "alleen wat je nodig hebt voor dagelijks beheer", activiteit-log past daarbij maar is geen prioriteit). **Default: weg.**
- Page-actions: "Subsidieradar openen" behoud. "Taak toevoegen" knop blijft, opent Taken-tab in plaats van modal.
- Kaart-card krijgt extra note: "Interactieve versie volgt" als kleine tag rechtsboven — markeert dat dit nog komt zonder dat Lara denkt dat dit het eindproduct is

**Patterns to follow:** Bestaande Overzicht-structuur. Hergebruik `.kpi`, `.card`, `.row`, `.row-icon`, `.grid-3-2`.

**Test scenarios:**
- Overzicht laadt zonder hectare/monument KPI's
- 4 nieuwe KPI's klikbaar — navigeren naar juiste tabs
- Mijn-taken widget toont 3 rijen, "Alle taken" link werkt
- Agenda widget toont 3 rijen, "Volledige agenda" link werkt
- Kaart-SVG ongewijzigd, "Interactieve versie volgt" tag zichtbaar
- Alert pachtcontract blijft staan

**Verification:** Open de mockup → eerste indruk = werkdag, niet een statische landgoed-folder. Dat is de meta-eis van Hugo.

## Scope Boundaries

**In scope:**
- Alle 5 implementation units hierboven
- Mockdata alleen — geen API, geen backend, geen JSON-fetch
- Visuele consistentie met bestaande styling (Plus Jakarta Sans, kleurensysteem, `.kpi` / `.card` patterns)

**Niet in scope (deferred):**
- **Bankkoppeling (PSD2)** — vereist backend service (Node/Python) die OAuth + token refresh + transactie-sync doet. Aanbieders: GoCardless Bank Account Data (gratis ~50 acc/mnd), Tink (Visa), Yapily. Apart plan zodra backend-stack besloten is.
- **Interactieve kaart** — Hugo en Reinoud bespreken apart. Waarschijnlijk Leaflet of MapLibre met kadaster-laag + perceel-polygonen.
- **Echt taken-CRUD** — alleen visuele filter-chips, geen werkende toevoeg/bewerk/verwijder flow.
- **Authenticatie / multi-user** — "ingelogde gebruiker" is hardcoded Reinoud in de mock.
- **Documenten upload, AI-matching subsidies** — bestaande tabs blijven zoals ze zijn.

**Buiten product-identiteit:**
- Dit blijft een statische single-file demo voor Lara. Geen build step, geen frameworks.

## Open Questions

1. **Banksaldo info-strip op Financieel** — moet die "ING + Triodos uitgesplitst" zijn, of één samengevoegd saldo? Voorstel: uitgesplitst, want dat toont meerwaarde (multi-bank consolidatie is een verkoopargument).
2. **Taken-tab — categorieën** — komen die uit een vaste lijst (Onderhoud, Pacht, Subsidie, Fiscaal, Juridisch) of vrije tags? Voor mock: vaste lijst van 5.
3. **Landgoed-tab kadaster-percelen** — hebben we echte perceel-nummers van Gunterstein, of mock? Default: mock.

## Risks & Notes

- **Tone Lara-demo:** Hugo's punt over "alleen dagelijks beheer op Overzicht" raakt aan wat Lara als eerste ziet. Als die landingspagina nog vol statische feiten staat, denkt zij "dit is een digitale folder", niet "dit is een dagelijks werkinstrument". Refit op Overzicht is de hoogste-impact verandering — eerst doen.
- **Single file groeit:** `index.html` zit op 1173 regels. Na deze plan ~1800+. Nog beheersbaar, maar bij volgende ronde (interactieve kaart, taken-CRUD) is split naar `index.html` + `app.js` + `app.css` aan te bevelen. Niet nu.
- **Bank-info juridisch:** PSD2 access vereist dat Lara als rekeninghouder consent geeft. De rentmeester kan niet "namens" haar koppelen zonder expliciete TPP-consent flow. Bij echte koppeling: aparte juridische check.

## Sources & Research

- `index.html` regel 411-455 (nav structuur)
- `index.html` regel 540-688 (huidige Overzicht — wordt herzien in U5)
- `index.html` regel 953-1066 (Agenda — wordt gelinkt vanuit Overzicht widget)
- Hugo's feedback in `/ce-plan` invocatie (2026-06-02)
- PSD2 aggregator landschap: GoCardless Bank Account Data (voorheen Nordigen, gratis tier), Tink (Visa-eigendom, betaald), Yapily, Ponto/Isabel. Genoemd in KTD3 en Scope Boundaries.
