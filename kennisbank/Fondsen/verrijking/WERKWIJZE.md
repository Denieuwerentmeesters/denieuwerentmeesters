# Werkwijze verrijking fondsen

Doel: het **beleid** van elk fonds vastleggen, zodat later semantisch gematcht kan worden
tussen een landgoedplan ("de laan herstellen", "het koetshuis herbestemmen", "een poel
aanleggen") en wat dit fonds wil bereiken. Niet alleen velden invullen — de beleidstekst
zelf is het product.

Deze werkwijze is geschreven na een pilot van 20 fondsen. Elke regel hieronder is een
les uit die pilot, geen theorie.

## Volgorde van bronnen

1. **De eigen website is de hoofdbron.** Bij alle 20 pilotfondsen leverde de eigen site
   meer bruikbaar materiaal dan fondseninnederland.nl. Zoek de pagina's "aanvragen",
   "voorwaarden", "criteria", "richtlijnen", "beleidsplan", "ANBI".
2. **fondseninnederland.nl (FIN) is aanvulling, geen hoofdbron.** Van de 20 stond er 8 op;
   5 daarvan hadden geen enkele beleidstekst op hun pagina. Maar: soms hangt daar de enige
   vindplaats van een beleidsplan-PDF. Altijd even proberen, nooit op leunen.
   - Slug is onvoorspelbaar: probeer `<naam>`, `stichting-<naam>`, en zonder lidwoord.
     Voorbeelden uit de pilot: `stichting-fonds-1819` (niet `fonds-1819`), `dullertsstichting`
     (niet `de-dullertsstichting`), `stichting-ars-donandi` (niet `ars-donandi`).
   - De zoekfunctie werkt niet via querystring; alleen paginering.
   - **De doelstelling zit in een `read-more text="..."` HTML-attribuut**, niet in de
     zichtbare tekst. Een naïeve tekstscraper mist die volledig.
3. **Aggregatorpagina's zijn geen bron.** Een regel op een verzamelsite (fondsenwerving-
   nederland.nl, skbl.nl, landschapnoordholland.nl) is niet het beleid van het fonds. Zoek
   de eigen vindplaats. Hun statusvermelding ("gesloten") is niet betrouwbaar.

## Trucs die in de pilot werkten

- **Lege pagina? Probeer de WordPress-API:** `<site>/wp-json/wp/v2/pages?per_page=100`.
  Bij Ars Donandi gaf de gewone pagina een lege Vue-app terug en leverde de API de
  volledige inhoud van 52 onderliggende fondsen.
- **Alleen een woord op de pagina? Kijk in `data-page`.** Inertia/Vue-sites zetten de
  volledige paginatekst als JSON in het `data-page`-attribuut van de root-div; in de
  zichtbare HTML staat vrijwel niets. Zo kwam de inhoud van TriArcus binnen. Naïeve
  scrapers missen dit volledig.
- **Dood domein? Wayback Machine.** Bij Bolhuisfonds was het eigen domein gekaapt door een
  casinosite; `web.archive.org` leverde de complete richtlijnen inclusief uitsluitingen.
- **Bijlagen zijn niet altijd PDF.** Bij Stichting de Boom was het beleidsplan een DOCX —
  `pdftotext` faalt daar *stil* op. Controleer het bestandstype; een DOCX lees je uit met
  `python3` + `zipfile` (word/document.xml).
- **PDF naar tekst:** `curl -sL "<url>" -o /tmp/<uniek>.pdf && /opt/homebrew/bin/pdftotext -layout /tmp/<uniek>.pdf -`
  Gebruik een unieke bestandsnaam per agent, anders overschrijven jullie elkaar.
- **Koepels uitklappen.** Staat er "fondsen op naam", "koepelstichting" of "beheert
  meerdere fondsen"? Haal de onderliggende fondsen op en noteer welke landgoed-relevant
  zijn, in het JSON-veld `onderliggende_fondsen`. Zo vonden we het Mevrouw A.Th. Vogler
  fonds ("behoud van en onderwijs over landgoederen en natuurschoon") dat in de hele
  bronnenlijst van 242 ontbrak.

## Twee bestanden per fonds

Schrijf naar `kennisbank/Fondsen/verrijking/`. **Bestaat `<slug>.json` al, sla het fonds
over** — dan is het in de pilot al gedaan.

**A. `<slug>.md`** — de beleidstekst integraal en onbewerkt, met bovenaan bron-URL en
ophaaldatum. Niet samenvatten, niet inkorten: dit is het ruwe materiaal voor de
semantische laag. Meerdere bronnen onder eigen kopjes.

**B. `<slug>.json`**

```json
{
  "naam": "...",
  "bronnen": [{"soort":"website|beleidsplan|jaarverslag|anbi_publicatie|aanvraagvoorwaarden","url":"...","jaar":2024,"gelezen":true}],
  "doelstelling": "in de woorden van het fonds",
  "benaderbaarheid": "open|open_met_drempel|via_intermediair|op_uitnodiging|gesloten|onbekend",
  "benaderwijze_notitie": "LETTERLIJK citaat waarop dat berust",
  "aanvrager_type": "landgoedeigenaar|derde_partij|beide|nvt|onbekend",
  "geo_niveau": "landelijk|provincie|regio|gemeente|plaats|internationaal|null",
  "geo_waarden": ["..."],
  "bedrag_min": null, "bedrag_max": null, "bedrag_indicatie": "letterlijke tekst of null",
  "cofinanciering_vereist": true,
  "uitsluitingen": ["wat het fonds expliciet NIET financiert"],
  "kostensoort": ["investering|restauratie|regulier_onderhoud|exploitatie|personeel|onderzoek"],
  "landgoed_relevantie": {
    "route": "zelf|via_partner|niet_relevant|onbekend",
    "onderbouwing": "waarom, met een citaat uit het beleid",
    "partnertype": "bij via_partner: wat voor organisatie moet aanvragen"
  },
  "onderliggende_fondsen": [{"naam":"...","relevant":true,"reden":"..."}],
  "niet_gevonden": ["wat je zocht maar niet vond, en waar je keek"]
}
```

## Harde regels

- **Alleen wat de bron letterlijk zegt.** Niet gepubliceerd = `null` of `"onbekend"`,
  nooit een schatting. Een leeg veld is een eerlijk antwoord; een verzonnen getal is een
  fout die later niet meer te herkennen is.
- **`benaderwijze_notitie` en `onderbouwing` bevatten een echt citaat**, geen parafrase.
- **Tegenstrijdigheden niet oplossen maar dubbel citeren.** In de pilot: Ars Donandi zegt
  op de site max €15.000 en in het beleidsplan max €10.000; Ribbink van den Hoek heeft een
  contactpagina "(DO NOT) CONTACT US" én een beleidsplan met aanvraagprocedure. Dat zijn
  vragen voor een telefoontje, geen keuzes voor jou.
- **Bij `landgoed_relevantie`: bij twijfel `via_partner` of `onbekend`, nooit
  `niet_relevant`.** Wat weggegooid is, ziet niemand meer terug. `niet_relevant` alleen
  als er geen enkele denkbare route naar een landgoed bestaat (bijvoorbeeld: "bij dit
  fonds kunnen geen aanvragen worden ingediend" én het fonds wordt opgeheven).
- **Ken de partnerroute.** Veel sociale fondsen (ouderen, jeugd, welzijn) geven nooit aan
  een landgoed, maar wél aan een zorg- of welzijnsorganisatie die dagbesteding of een
  programma op een landgoed organiseert; het landgoed komt dan als locatiepost in háár
  begroting. Dat is een geldige route, geen "niet relevant".
- **Let op de breuklijn onderhoud/restauratie.** Bij erfgoedfondsen staat regulier
  onderhoud en exploitatie bijna altijd op de uitsluitingslijst terwijl restauratie juist
  wél gefinancierd wordt — maar niet overal: BNG Cultuurfonds sluit restauratie óók uit.
  Leg het per fonds exact vast; dit bepaalt of het systeem een onderhoudsvraag moet
  herkaderen.
- **AVG:** geen namen van bestuursleden overnemen. Alleen algemene contactgegevens
  (info@, algemeen telefoonnummer).
- **Niet naar de database schrijven** en niet buiten de verrijkingsmap schrijven.
