# Landgoedplatform — Kennisbank

**De Nieuwe Rentmeesters** · Opzet van de kennisbank · versie 1.0 · juni 2026

Dit document beschrijft hoe we de kennis organiseren waaruit de AI-laag put — in het bijzonder de Documentmodule (visievorming) en de radars. Het gaat over twee soorten kennis: kennis die voor **alle landgoederen** geldt (nationaal: wetgeving, subsidies, regelingen) en kennis die bij **één individueel landgoed** hoort (documenten, vergaderingen, percelen, verordeningen). De leidende keuze in deze eerste versie is bewust **eenvoud**: documenten plus AI-samenvattingen, geen zware zoekmachine. Dit document legt uit hoe dat werkt, waar de grens ligt, en wanneer je naar een volgende trede gaat.

## 1. Waarom een kennisbank

De AI-laag kan alleen synthetiseren — een visie opstellen, een subsidie matchen, een concept onderbouwen — als de onderliggende kennis goed geordend en vindbaar is. Zonder structuur krijg je een AI die plausibel klinkt maar nergens op stoelt. De kennisbank is dus geen aparte feature met een eigen scherm; het is het **fundament onder de AI-laag**. Voor de gebruiker is het grotendeels onzichtbaar: hij ziet documenten, notulen en radars — niet de structuur eronder.

Twee eisen sturen het ontwerp:

- **Herleidbaarheid.** Als de AI een concept opstelt, moet zichtbaar zijn waarop het gebaseerd is (welke notulen, welk document, welke wet). Dat is vertrouwen, en het is wat een expert nodig heeft om verder te kunnen.
- **Scheiding.** Nationale kennis is gedeeld; landgoed-kennis is strikt afgeschermd (ditzelfde RLS-principe als de rest van het platform). De kennisbank mag die scheiding nooit doorbreken.

## 2. Twee lagen: nationaal en per landgoed

### Nationale kennis (voor alle landgoederen)

Dit is de gedeelde basis die voor elk landgoed relevant kan zijn:

- **Wetgeving en kaders** — Natuurschoonwet (NSW), Pachtwet/pachtnormen, Omgevingswet, Erfgoedwet, Wet natuurbescherming, fiscale regelingen.
- **Subsidies en regelingen** — landelijke regelingen (SNL, ANLb, SIM), provinciale regelingen, carbon-/groenblauwe regelingen.
- **Standaarden en normen** — NEN 2767 (conditiemeting), VTA (boomveiligheid), taxatiekaders.
- **Referentie- en sjabloonmateriaal** — voorbeeldstructuren voor een beheervisie, een onderbouwing richting provincie, een pachtcontract.

Deze kennis leeft als `document` met `scope = 'nationaal'` (en, voor subsidies, in de `subsidie`-tabel). Eén exemplaar, zichtbaar voor alle landgoederen, alleen door ons (admin) te beheren. Dit bestaat al in het datamodel; de kennisbank voegt vooral **discipline en structuur** toe in hoe we het vullen en ordenen.

### Kennis per landgoed (individueel)

Dit is alles wat bij één specifiek landgoed hoort en strikt afgeschermd blijft:

- **Documenten** — visiestukken, contracten, beheerplannen, vergunningen, taxaties, correspondentie.
- **Vergaderingen** — transcripties en notulen: wat er in het bestuur speelt en besloten is.
- **Lokale regelgeving** — gemeentelijke verordeningen, bestemmings-/omgevingsplan, Natura 2000-aanwijzing voor dít gebied.
- **Objectkennis** — percelen, gebouwen, hun status, contracten en subsidies (uit de betreffende modules).
- **Omgevingsberichten** — relevante bijeenkomsten en regelwijzigingen die de omgevingsradar heeft binnengehaald.

Deze kennis leeft als `document` met `scope = 'landgoed'` en in de module-tabellen (`perceel`, `object`, `vergadering`, `omgevingsbericht`), allemaal met `landgoed_id` en het bekende RLS-patroon.

## 3. De kern: documenten + samenvattingen (v1.0)

De gekozen aanpak voor de eerste versie is zo simpel mogelijk en leunt volledig op wat het platform al heeft.

**Elk document krijgt een AI-samenvatting.** Bij het uploaden (of genereren) van een document maakt de Claude API een gestructureerde samenvatting: waar gaat het over, wat zijn de kernpunten, welke data/bedragen/termijnen staan erin. Die samenvatting wordt opgeslagen in het `samenvatting`-veld dat al op de `document`-tabel zit.

**De samenvattingen zijn de kennisbank.** Wanneer de AI context nodig heeft (voor de Documentmodule, een subsidie-match, een onderbouwing), werkt hij met de **samenvattingen**, niet met de volledige bestanden. Dat heeft drie voordelen: het token-budget blijft laag (cruciaal voor de kosten en snelheid), de relevante kern komt bovendrijven, en het is precies genoeg voor synthese op conceptniveau.

**Selectie op metadata, niet op betekenis.** Welke documenten meegaan in een context bepaal je in v1.0 met eenvoudige filters: landgoed-id, `doc_type`, `scope`, recentheid, en eventueel een handmatige categorie/tag. Geen semantische zoekmachine — je selecteert op kenmerken, niet op inhoudelijke gelijkenis. Voor de omvang van een individueel landgoed (tientallen tot enkele honderden documenten) is dat ruim voldoende.

### Een lichte ordening die nu al loont

Om de selectie scherp te houden, voeg je een minimale categorisering toe — geen zware taxonomie, maar net genoeg om gericht te kunnen filteren:

```sql
-- Lichte categorisering op documenten t.b.v. gerichte contextselectie
alter table document add column categorie text;     -- bv. 'visie','contract','vergunning',
                                                     -- 'beheerplan','verordening','taxatie','correspondentie'
alter table document add column trefwoorden text[];  -- AI-gegenereerde trefwoorden bij de samenvatting
alter table document add column brondatum date;      -- datum van het stuk zelf (niet de uploaddatum)
```

De AI kan bij het samenvatten meteen de `categorie` voorstellen en `trefwoorden` genereren. Zo ontstaat ordening zonder handwerk, en kun je later (bij semantisch zoeken) op deze velden voortbouwen.

## 4. Hoe de Documentmodule de kennisbank gebruikt

Concreet, voor een visie-concept (zie het technische document, Documentmodule):

1. De gebruiker geeft een richting en kiest `doc_type = 'visie'`.
2. De serverroute selecteert context op metadata: recente notulen van dit landgoed, landgoed-documenten met passende `categorie`, nationale documenten die bij `visie` horen, en lokale verordeningen.
3. Van elk geselecteerd stuk gaat de **samenvatting** (niet het volledige bestand) de prompt in, met bronvermelding.
4. Elke meegenomen bron wordt vastgelegd in `document_bron`, zodat het concept een herleidbare "gebaseerd op"-lijst krijgt.

De kwaliteit van de kennisbank zit hier dus volledig in de **kwaliteit van de samenvattingen** en de **juistheid van de categorisering**. Daar ligt de aandacht in v1.0 — niet in zoektechnologie.

## 5. Opslag: waar staat wat

| Soort kennis | Waar | Scope/afscherming |
|---|---|---|
| Wetgeving, kaders, normen | `document` (scope nationaal) + bestand in Supabase Storage | Gedeeld; admin beheert |
| Subsidies/regelingen | `subsidie` (+ nationaal `document`) | Gedeeld; admin beheert |
| Sjablonen/referentie | `document` (scope nationaal) | Gedeeld; admin beheert |
| Landgoed-documenten | `document` (scope landgoed) + Storage | Afgeschermd via RLS op `landgoed_id` |
| Vergaderingen/notulen | `vergadering`/`transcript` | Afgeschermd via RLS |
| Lokale verordeningen | `document` (categorie 'verordening') | Afgeschermd via RLS |
| Percelen/gebouwen | `perceel`/`object` | Afgeschermd via RLS |
| Omgevingsberichten | `omgevingsbericht` | Afgeschermd via RLS |
| Samenvattingen/trefwoorden | velden op de bovenstaande tabellen | Erven de afscherming van hun tabel |

De **bestanden zelf** staan in Supabase Storage, gescheiden per landgoed via mappen/buckets; de **kennis erover** (samenvatting, categorie, trefwoorden) staat in de database bij het document. De AI raakt in v1.0 vooral de database-kennis aan, niet de ruwe bestanden — dat is goedkoper, sneller en privacy-vriendelijker.

> **Privacy-principe.** Landgoed-kennis verlaat de afgeschermde omgeving nooit. Bij een AI-aanroep gaan alleen de samenvattingen van dít landgoed (plus de gedeelde nationale kennis) mee — nooit kennis van een ander landgoed. Dit is dezelfde RLS-grens als in de rest van het platform, nu toegepast op de contextopbouw van de AI.

## 6. De grens van v1.0 — en wanneer je verder gaat

De simpele aanpak (samenvattingen + metadata-selectie) is bewust gekozen en voor nu ruim voldoende. Het is goed om te weten waar de grens ligt, zodat de keuze bewust blijft.

**Wanneer metadata-selectie gaat knellen:**

- Als één landgoed honderden tot duizenden documenten krijgt en "het juiste stuk" niet meer met categorie + recentheid te vinden is.
- Als je wilt zoeken op *betekenis* in plaats van op kenmerk — "alle stukken die iets zeggen over waterberging", ook als dat woord er niet letterlijk in staat.
- Als de Documentmodule zo veel gebruikt wordt dat de contextselectie scherper en automatischer moet.

**De volgende trede: semantisch zoeken (vector/embeddings).** Supabase ondersteunt dit met de `pgvector`-extensie. Je berekent per document(samenvatting) een embedding en zoekt op inhoudelijke gelijkenis. Het mooie: dit is **additief** — je gooit niets weg. De samenvattingen, categorieën en trefwoorden die je nu opbouwt blijven bruikbaar; je voegt er een vector-kolom en een zoekindex aan toe.

```sql
-- LATERE UITBREIDING (niet nu): semantisch zoeken via pgvector
-- create extension if not exists vector;
-- alter table document add column embedding vector(1536);
-- ... index + similarity-query bij de contextopbouw
```

De aanbeveling: **begin simpel, meet waar het knelt.** Zolang de samenvattingen goed zijn en de categorisering klopt, levert semantisch zoeken weinig extra; zodra het volume of de zoekvraag het rechtvaardigt, zet je de stap zonder herbouw.

## 7. Wat dit betekent voor de bouw

- **Geen nieuwe grote module.** De kennisbank is grotendeels het *gedisciplineerd vullen* van bestaande tabellen, plus drie lichte velden (`categorie`, `trefwoorden`, `brondatum`) op `document`.
- **De AI-samenvatting bij upload is de spil.** Zorg dat elk document bij binnenkomst een goede, gestructureerde samenvatting én een categorie/trefwoorden krijgt. Dat is de belangrijkste bouwsteen.
- **Nationale kennis bijhouden is ons werk.** Het vullen en actueel houden van wetgeving, regelingen en sjablonen (scope nationaal) is een doorlopende taak voor ons (admin) — en tegelijk een onderscheidende waarde van het platform.
- **De grens bewaken.** Bij elke AI-aanroep geldt: alleen nationale kennis + de kennis van dít landgoed. Nooit daarbuiten.

### Claude Code-prompt (kennis bij upload)

> Breid de documenten-upload van de landgoedbeheer-app uit met automatische kennisopbouw. Wanneer een document wordt geüpload (of door de AI gegenereerd), roep de Claude API aan om: (1) een gestructureerde **samenvatting** te maken (onderwerp, kernpunten, relevante data/bedragen/termijnen), (2) een **categorie** voor te stellen uit een vaste lijst (visie, contract, vergunning, beheerplan, verordening, taxatie, correspondentie, overig), en (3) een handvol **trefwoorden** te genereren. Sla deze op in de velden `samenvatting`, `categorie` en `trefwoorden` op de `document`-rij; vul `brondatum` als die uit het stuk blijkt. Toon de gebruiker de voorgestelde categorie en samenvatting ter bevestiging/bijstelling. Nederlandse interface. Vertrouw op RLS; verwerk alleen documenten van het landgoed waartoe de gebruiker toegang heeft.

---

*Dit document hoort bij het technische document (v1.3) en het algemene plan (v1.2). Het beschrijft de eerste, bewust eenvoudige opzet van de kennisbank; het semantische-zoek-spoor (pgvector) is benoemd als latere, additieve uitbreiding.*
