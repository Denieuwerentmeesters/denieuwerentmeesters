# Fondsen — brondata voor de fondsenradar

Deze map bevat de bron en de afgeleide dataset voor de fondsenradar
(zie `Implementatieplan_Fondsenradar.md`, fase 1).

| Bestand | Wat het is |
| --- | --- |
| `Fondsenoverzicht_Landgoederen.xlsx` | Het origineel. Drie tabbladen. **De waarheid.** |
| `Fondsenoverzicht.csv` | Export van tabblad **Fondsenoverzicht** (205 fondsen, 12 kolommen). |
| `Sheet1_fondsen.csv` | Export van tabblad **Sheet1** (37 fondsen, 14 kolommen). |
| `fondsen.json` | Afgeleid, gegenereerd bestand (242 rijen). Niet met de hand bewerken. |

### De drie tabbladen

| Tabblad | Inhoud |
| --- | --- |
| `Uitleg` | Verantwoording, geen data. Wordt niet ingelezen. |
| `Fondsenoverzicht` | 205 fondsen, 12 kolommen. |
| `Sheet1` | 37 fondsen, 14 kolommen — dezelfde twaalf plus `Type aanvrager` en `Verdienmodel voor landgoed`. |

**De overlap tussen beide fondsentabbladen is nul**: geen enkele fondsnaam komt
in allebei voor. Het zijn twee losse onderzoeksronden met een verschillende
verificatiegraad. Daarom draagt elke rij in `fondsen.json` een veld `tabblad`
(in de database `regeling.bron_tabblad`), en bewaakt een test dat de overlap nul
blijft. De kolomkoppen verschillen licht tussen de tabbladen ("Regio /
provincie" vs. "Regio/provincie"); het converteerscript legt beide op één
interne set — nieuwe spellingvarianten voeg je toe in `INTERN` bovenin
`scripts/converteer-fondsen.mjs`.

## Bijwerken

1. Werk de Google Sheet / Excel bij.
2. Exporteer **beide** fondsentabbladen als CSV: `Fondsenoverzicht` naar
   `Fondsenoverzicht.csv` en `Sheet1` naar `Sheet1_fondsen.csv`.
3. Draai vanuit de repo-root:

   ```
   node scripts/converteer-fondsen.mjs
   ```

4. Importeer in de database (vanuit `web/`, met de service-role key in de omgeving):

   ```
   curl -X POST -H "x-import-secret: $SUBSIDIE_IMPORT_SECRET" \
        http://localhost:3000/api/fondsen/import
   ```

De import is idempotent: opnieuw draaien werkt bestaande rijen bij en maakt geen
duplicaten. Alles komt binnen als **voorstel** (`geaccordeerd = false`); een mens
accordeert.

## Kolommen die de export moet hebben

Deze twaalf kolomkoppen op **beide** tabbladen (spelling met of zonder spaties
rond de schuine streep mag), plus op `Sheet1` de twee extra kolommen uit de
tabel daaronder. Ontbreekt er één, dan stopt het converteerscript met een
foutmelding in plaats van te raden.

| # | Kolomkop | Gaat naar | Opmerking |
| --- | --- | --- | --- |
| 1 | `Naam fonds` | `regeling.naam` | Verplicht. Bepaalt ook de `sleutel` (slug), de idempotency-sleutel. |
| 2 | `Categorie` | `trefwoorden`, en afgeleid `soort_bron` + `rechtskarakter` | `(revolverend)` → `soort_bron = lening`. `Publiek/hybride` → `subsidie` + `rechtskarakter = gemengd`. Anders `fonds` + `privaatrechtelijk`. |
| 3 | `Regio / provincie` | `geo_niveau` + `geo_waarden` (+ `provincie`) | `Landelijk` → `landelijk`. Alleen provincienamen → `provincie`. Iets met `internationaal`/werelddelen → `internationaal` (**sluit uit**). Al het overige → `regio`, waarde als vrije tekst. |
| 4 | `Statutaire doelstelling (samenvatting)` | `regeling.samenvatting` | |
| 5 | `Doelgroep` | `doelgroepen` + één `regeling_criterium` op `rechtsvorm` | Zie hieronder. |
| 6 | `Relevant voor welk type landgoedplan` | `themas` + `plan_triggers` | Gesplitst op `;` en ` / `. |
| 7 | `Orde grootte bedrag` | `bedrag_indicatie` (letterlijk) + eventueel `bedrag_min`/`bedrag_max` | Getallen alleen bij een expliciete band (`€10.000 - €300.000`) of bij `max.`/`vanaf`. Eén los bedrag zonder richtingwoord blijft alleen indicatie. **Nooit een getal verzinnen.** |
| 8 | `Aanvraagprocedure / deadlines` | `benaderbaarheid` + `benaderwijze_notitie` | De notitie is het **letterlijke citaat** (procedure + status). |
| 9 | `Vereiste documenten voor aanvraag` | losse `regeling_bewijs`-rijen | Zie hieronder. |
| 10 | `Contact` | `regeling.contact` | Persoonsgegevens onder de AVG — intern gebruik, niet herpubliceren. |
| 11 | `Bron (URL)` | `regeling.bron_url` | |
| 12 | `Status / opmerking` | bepaalt `herkomst` | Woorden als "sitemap sweep", "sector-tag", "nog te verifiëren" → `afgeleid_tag`. "Aanvraagbaar"/"bevestigd" → `geverifieerd_bron`. Bij twijfel `afgeleid_tag`. |

### De twee extra kolommen van `Sheet1`

| Kolomkop | Gaat naar | Bronwaarden → waarde in de database |
| --- | --- | --- |
| `Type aanvrager` | `regeling.aanvrager_type` | `Landgoedeigenaar zelf` → `landgoedeigenaar` · `Derde partij op landgoed` → `derde_partij` · `Beide mogelijk` (of beide waarden in één cel) → `beide` · `N.v.t. (donatie-instrument / niet aanvraagbaar)` → `nvt` · leeg → `onbekend` |
| `Verdienmodel voor landgoed` | `regeling.verdienmodel` | `Directe subsidie aan landgoed` → `directe_subsidie` · `Locatievergoeding via begroting derde` → `locatievergoeding` · `Indirecte bezoekersinkomsten` → `indirecte_bezoekersinkomsten` · `Pacht/huur` → `pacht_huur` · `Geen — alleen maatschappelijke waarde` → `geen` · `N.v.t. — donatie-instrument` → `nvt` · leeg → `onbekend` |

De 205 fondsen van tabblad `Fondsenoverzicht` krijgen op beide velden
`onbekend`. Dat is geen omissie maar de eerlijke stand: die kolommen bestaan
daar niet, en een gok zou hier duur zijn.

**Waarom dit ertoe doet.** Fondsen als RCOAK, Kansfonds, FNO en Jeugdfonds Sport
& Cultuur geven **nooit** aan een landgoed. Ze geven aan een zorg- of
jeugdorganisatie, die vervolgens iets op het landgoed doet en de eigenaar uit
háár begroting een locatievergoeding betaalt. Zo'n bron is dus niet "geen
match" — er valt wel degelijk geld te verdienen — maar het handelingsperspectief
is een ander: niet *"schrijf een aanvraag"* maar *"zoek een partner die dit kan
aanvragen"*. In fase 2 gebruikt de poort `aanvrager_type` om die twee
verschillend te presenteren; `verdienmodel` zegt daarna wat het het landgoed
oplevert (rechtstreeks geld, een vergoeding uit andermans begroting, huur, of
alleen maatschappelijke waarde). `pacht_huur` staat bewust naast
`locatievergoeding`: een structurele huurrelatie is iets anders dan een post op
de projectbegroting van een derde.

### Doelgroep → rechtsvormcriterium (§9.1)

De rechtsvorm van de aanvrager is de grootste harde filter. Per fonds komt er
precies één criterium (`veld = 'rechtsvorm'`) met een **drie-waardige** uitkomst:

- `ja` — de bron zegt expliciet "organisaties/stichtingen", of "geen particulieren".
- `nee` — de bron noemt particulieren/eigenaren/bewoners expliciet als doelgroep.
- `onbekend` — de kolom zegt niets (`Niet gepubliceerd`, `N.v.t.`, leeg).

`onbekend` is geen "mag wel". Het levert straks een navraag-actie op.

### Vereiste documenten → `regeling_bewijs` (§4)

De cel is vrije tekst en wordt **deterministisch** gesplitst op herkenbare
termen (projectplan, begroting, dekkingsplan, offerte, kostenraming,
jaarrekening, jaarverslag, statuten, KvK, ANBI, bankgegevens, eigendomsbewijs,
vergunning, monumentgegevens, beheerplan, foto's, steunbrief,
aanvraagformulier). Wat niet betrouwbaar te splitsen is, wordt **één** rij met
`vereiste_type = 'overig'` en de originele tekst. Er wordt niets gegokt; op
elke rij staat de brontekst in `bron_tekst`.

Per rij wordt ook `zelf_op_te_stellen` gezet: `true` voor stukken die het
platform maakt (projectplan, begroting, dekkingsplan, aanvraagbrief, foto's),
`false` voor stukken die de gebruiker extern moet regelen (offerte, vergunning,
jaarrekening, KvK), `null` als dat niet vaststaat. Bij externe stukken staat waar
mogelijk een `doorlooptijd_indicatie` — een omgevingsvergunning duurt maanden en
bepaalt daarmee vaak de haalbaarheid.

## Schema van `fondsen.json`

```jsonc
{
  "_schema": "kennisbank/Fondsen/README.md",
  "aantal": 242,
  "per_tabblad": { "Fondsenoverzicht": 205, "Sheet1": 37 },
  "fondsen": [
    {
      "sleutel": "m-a-o-c-gravin-van-bylandt-stichting", // stabiel, uniek
      "naam": "M.A.O.C. Gravin van Bylandt Stichting",
      "tabblad": "Fondsenoverzicht",      // Fondsenoverzicht | Sheet1
      "categorie": "Landelijk vermogensfonds",
      "samenvatting": "…",
      "bron_url": "https://…",
      "contact": "info@… , 070-…",
      "themas": ["Restauratie & onderhoud van landgoedgebouwen"],
      "plan_triggers": ["…"],
      "doelgroepen": ["Organisaties/stichtingen (geen particulieren)"],
      "soort_bron": "fonds",              // fonds | lening | subsidie | fiscaal | eigen_bijdrage
      "rechtskarakter": "privaatrechtelijk",
      "benaderbaarheid": "open_met_drempel", // poort, §3
      "benaderwijze_notitie": "<letterlijk citaat>",
      "geo_niveau": "landelijk",          // landelijk|provincie|regio|gemeente|plaats|internationaal|null
      "geo_waarden": [],
      "provincie": null,
      "budget_indicatie": "<letterlijke tekst>",
      "bedrag_min": null,
      "bedrag_max": null,
      "cooldown_maanden": null,
      "aanvrager_type": "onbekend",       // alleen Sheet1 vult dit
      "verdienmodel": "onbekend",         // alleen Sheet1 vult dit
      "status_opmerking": "Aanvraagbaar. …",
      "herkomst": "geverifieerd_bron",    // handmatig|afgeleid_tag|geverifieerd_bron|ai_voorstel
      "criteria": [ /* regeling_criterium, met uitkomst ja|nee|onbekend */ ],
      "bewijs":   [ /* regeling_bewijs, met vereiste_type en zelf_op_te_stellen */ ]
    }
  ]
}
```

`bestuurslaag` staat er bewust **niet** in en mag er ook niet in: dat veld gaat
over welke overheidslaag verstrekt, en "privaat" daarin proppen is een
categoriefout (§1). Het importscript weigert een rij die het toch bevat.

## Wat er nog niet in zit

- **`regio_alias`** — regionamen ("Kennemerland", "Groot-Rijnmond", "Noord-Oost
  Veluwe") zijn nog niet naar gemeenten vertaald. De tabel bestaat, maar is leeg;
  vullen gebeurt in fase 2 (de poort). Tot die tijd is de geografische toets voor
  die bronnen **onbekend**, niet "voldoet niet".
- **`regeling_bronlezing`** — welke stukken per fonds gelezen zijn (website,
  beleidsplan, jaarverslag + jaar). Tabel bestaat, wordt gevuld bij de
  verdiepingsslag.
- **Bedragbanden** — voor het overgrote deel van de fondsen publiceert de bron
  geen bedragen. Dat blijft leeg.
