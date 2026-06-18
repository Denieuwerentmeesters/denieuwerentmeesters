# Kennisbank: Provinciale Omgevingsverordeningen

Omgezet naar **Markdown** op 24 maart 2026 — alle 12 provincies beschikbaar als `.md` kennisdocument.
Bedoeld als RAG-kennisbank voor de **Boer Transitie Scanner** (Fase 3+).

> De originele PDF-bestanden zijn bewaard als archief. De `.md` bestanden zijn de actieve bron voor RAG-indexering — ze zijn lichter, sneller te indexeren en gericht op de thema's die relevant zijn voor stoppende en transiterende boeren.

---

## Provinciale kennisdocumenten (.md)

| Provincie | Bestand | Grootte | CVDR-bron |
|-----------|---------|---------|-----------|
| Drenthe | drenthe_omgevingsverordening.md | 744 KB | [CVDR705506](https://lokaleregelgeving.overheid.nl/CVDR705506/) |
| Flevoland | flevoland_omgevingsverordening.md | 704 KB | [CVDR706275](https://lokaleregelgeving.overheid.nl/CVDR706275/) |
| Friesland | friesland_omgevingsverordening.md | 965 KB | [CVDR703647](https://lokaleregelgeving.overheid.nl/CVDR703647/) |
| Gelderland | gelderland_omgevingsverordening.md | 677 KB | [CVDR705323](https://lokaleregelgeving.overheid.nl/CVDR705323/) |
| Groningen | groningen_omgevingsverordening.md | 536 KB | [CVDR706194](https://lokaleregelgeving.overheid.nl/CVDR706194/) |
| Limburg | limburg_omgevingsverordening.md | 424 KB | [CVDR705183](https://lokaleregelgeving.overheid.nl/CVDR705183/) |
| Noord-Brabant | noord_brabant_omgevingsverordening.md | 1.1 MB | [CVDR743334](https://lokaleregelgeving.overheid.nl/CVDR743334/) |
| Noord-Holland | noord_holland_omgevingsverordening.md | 3.6 MB | [CVDR703568](https://lokaleregelgeving.overheid.nl/CVDR703568/) |
| Overijssel | overijssel_omgevingsverordening.md | 919 KB | [CVDR706717](https://lokaleregelgeving.overheid.nl/CVDR706717/) |
| Utrecht | utrecht_omgevingsverordening.md | 999 KB | [CVDR704250](https://lokaleregelgeving.overheid.nl/CVDR704250/) |
| Zeeland | zeeland_omgevingsverordening.md | 781 KB | [CVDR709135](https://lokaleregelgeving.overheid.nl/CVDR709135/) |
| Zuid-Holland | zuid_holland_omgevingsverordening.md | 1.6 MB | [CVDR730926](https://lokaleregelgeving.overheid.nl/CVDR730926/) |

---

## Nationale kennisdocumenten (.md)

Locatie: `kennisbank/nationaal/`

| Document | Bestand | Inhoud |
|----------|---------|--------|
| Beëindigingsregelingen | beeindigingsregelingen.md | Lbv, Lbv-plus, brede beëindigingsregeling, fiscale aspecten |
| Fiscaal agrarisch | fiscaal_agrarisch.md | Landbouwvrijstelling, WEVAB, stakingswinst, FOR, BOR |
| Natuurschoonwet | natuurschoonwet_NSW.md | NSW-rangschikking, fiscale voordelen, vereisten |
| Pachtrecht | pachtrecht.md | Reguliere en geliberaliseerde pacht, pachtnormen 2025 |
| VAB en rood-voor-rood | vab_rood_voor_rood.md | VAB-beleid, sloopbonus per provincie, asbestregels |

---

## Handreikingen overheid nationaal (.md)

Locatie: `kennisbank/Handreikingen overheid nationaal/`

| Document | Bestand | Inhoud |
|----------|---------|--------|
| Overgangsgebieden in transitie | overgangsgebieden_transitie.md | Transitiepaden, stikstof, uitkoop, subsidies per pad |
| Nieuwe Natuur en Klein Wonen | nieuwe_natuur_klein_wonen.md | Tiny houses, natuur-inclusief wonen, financieel model |
| Planologische concepten erftransformatie | planologische_concepten_erftransformatie.md | 6 transformatieconcepten, erfanalyse, financiële kengetallen |

---

## Thema's en zoektermen

| Thema | Sleutelwoorden |
|-------|----------------|
| VAB — Vrijkomende Agrarische Bebouwing | vrijkomende agrarische bebouwing, VAB, functieverandering, herbestemming |
| Rood-voor-rood / Ruimte-voor-ruimte | rood voor rood, ruimte voor ruimte, sloopbonus, sloopmeters |
| Landgoedvorming (NSW) | nieuw landgoed, NSW, Natuurschoonwet, landgoederen, 5 hectare, rangschikking |
| NNN — Natuur Netwerk Nederland | NNN, natuur netwerk, ecologische hoofdstructuur, EHS, nee tenzij |
| Beëindiging veehouderij | Lbv, Lbv-plus, stoppersregeling, uitkoop, piekbelaster |
| Fiscaal | landbouwvrijstelling, WEVAB, stakingswinst, FOR, BOR, overdrachtsbelasting |
| Pacht | reguliere pacht, geliberaliseerde pacht, pachtnorm, verpachten |
| Erftransformatie | erftransformatie, erf, tiny house, klein wonen, sloop, herbestemming |
| KGO (Overijssel) | kwaliteitsimpuls groene omgeving, KGO |

---

## RAG-implementatie

### Indexering uitvoeren
```bash
cd kennisbank
python3 indexeer_kennisbank.py --reset   # alles opnieuw indexeren
```

Het script verwerkt automatisch:
1. Alle `*_omgevingsverordening.md` bestanden in `omgevingsverordeningen/`
2. Alle `.md` bestanden in `nationaal/`
3. Alle `.md` bestanden in `Handreikingen overheid nationaal/`

### Query in Supabase
```sql
SELECT tekst, provincie, thema, document
FROM kennisbank_chunks
WHERE provincie = 'Gelderland'
ORDER BY embedding <=> query_embedding
LIMIT 5;
```

### Supabase RPC functie
```javascript
const { data } = await supabase.rpc('zoek_kennisbank', {
  query_embedding: embedding,
  filter_provincie: 'Gelderland',
  match_threshold: 0.4,
  match_count: 5
})
```

---

## Update-beleid

Omgevingsverordeningen worden jaarlijks gewijzigd (soms vaker).
- Controleer elk kwartaal de CVDR-links op "Geldend van ... t/m heden"
- Bij nieuwe versie: `.md` kennisdocument bijwerken + `--reset` uitvoeren
- Noord-Brabant en Gelderland wijzigen het meest frequent (actief stikstofbeleid)
- Handreikingen: controleer RVO-website en IPLO voor nieuwe versies

---

*Kennisbank bijgewerkt voor Boer Transitie Scanner — Reinoud ten Cate — 24 maart 2026*
