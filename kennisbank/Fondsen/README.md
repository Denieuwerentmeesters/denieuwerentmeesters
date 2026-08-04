# Fondsen — brondata voor de fondsenradar

Deze map bevat de bron en de afgeleide dataset voor de fondsenradar
(zie `Implementatieplan_Fondsenradar.md`, fase 1).

| Bestand | Wat het is |
| --- | --- |
| `Fondsenoverzicht.csv` | Export van het tabblad **Fondsenoverzicht** uit `Fondsenoverzicht_Landgoederen.xlsx` (205 fondsen). **De waarheid.** |
| `fondsen.json` | Afgeleid, gegenereerd bestand. Niet met de hand bewerken. |

## Bijwerken

1. Werk de Google Sheet / Excel bij.
2. Exporteer het tabblad **Fondsenoverzicht** als CSV en overschrijf `Fondsenoverzicht.csv`.
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

Exact deze twaalf kolomkoppen, in deze volgorde. Ontbreekt er één, dan stopt het
converteerscript met een foutmelding in plaats van te raden.

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
  "aantal": 205,
  "fondsen": [
    {
      "sleutel": "m-a-o-c-gravin-van-bylandt-stichting", // stabiel, uniek
      "naam": "M.A.O.C. Gravin van Bylandt Stichting",
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
