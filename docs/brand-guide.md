# Brand Guide — De Nieuwe Rentmeesters

**Landgoedplatform · versie 1.0 · juni 2026**

Dit document is de visuele leidraad voor het platform. Het is rechtstreeks afgeleid van de goedgekeurde mockup (`index.html`, het Gunterstein-dashboard) en geldt als bron-van-waarheid voor kleur, typografie, vormtaal en componenten. Bouw je een nieuw scherm of component, dan begin je hier.

---

## 1. Merkkarakter

Het platform brengt rust in iets dat nu versnipperd is. De vormtaal moet dat uitstralen: **kalm, betrouwbaar, professioneel, eenvoudig**. Geen drukte, geen overdaad aan knoppen, geen schreeuwerige accenten. De groene basiskleur verwijst naar landschap en continuïteit; het lichtgrijze canvas houdt schermen luchtig.

Drie ontwerpprincipes, in volgorde van belang:

1. **Eenvoud is de voorwaarde, niet de voorkeur.** De doelgroep haakt af bij een vol scherm. Witruimte en weglaten gaan vóór compleetheid.
2. **Hiërarchie door rust.** Eén duidelijk accent (groen), verder zachte grijzen. Kleur betekent iets — niet decoratie.
3. **Voorspelbaar.** Dezelfde radius, dezelfde schaduw, dezelfde knopvorm overal. Herkenning verlaagt cognitieve last.

---

## 2. Kleur

### Kernpalet

| Token | Hex | Gebruik |
|---|---|---|
| `--bg` | `#F1F3F6` | App-achtergrond (canvas) |
| `--white` | `#FFFFFF` | Kaarten, sidebar, topbar |
| `--primary` | `#1B3A28` | Primair groen — knoppen, actieve nav, logo, accenten |
| `--primary-mid` | `#2A5C3F` | Hover-staat van primair, focus-borders |
| `--primary-light` | `#EAF0EC` | Zachte groene vlakken, ghost-knop hover |
| `--primary-muted` | `#C8D9CC` | Subtiele groene randen/vullingen |

### Tekstkleuren

| Token | Hex | Gebruik |
|---|---|---|
| `--text` | `#111827` | Primaire tekst, koppen |
| `--text-2` | `#6B7280` | Secundaire tekst, bijschriften |
| `--text-3` | `#9CA3AF` | Tertiair — labels, placeholders, nav-labels |
| `--border` | `#E5E7EB` | Randen, scheidingslijnen |

### Statuskleuren

Elke statuskleur heeft een donkere variant (tekst/icoon) en een lichte variant (achtergrond). Gebruik ze **alleen voor betekenis**, nooit decoratief.

| Betekenis | Donker | Licht | Voorbeeld |
|---|---|---|---|
| Urgent / vervallen | `--red` `#DC2626` | `--red-light` `#FEF2F2` | Vervallen pacht, deadline gemist |
| Aandacht / bijna | `--amber` `#B45309` | `--amber-light` `#FFFBEB` | Bijna vervallen, aanmanen |
| Informatie / verwacht | `--blue` `#1E40AF` | `--blue-light` `#EFF6FF` | Subsidies, verwachte inkomsten |
| Goed / in termijn | `--primary` `#1B3A28` | `--primary-light` `#EAF0EC` | In termijn, bestuur, afgerond |

**Regel:** groen = goed/op koers, amber = let op, rood = nu actie nodig, blauw = neutrale info. Verzin geen extra kleuren.

---

## 3. Typografie

**Font:** [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) — gewichten 400, 500, 600, 700. Eén font voor alles. Geen tweede tekstfont.

Basis-`font-size` is `14px`. De schaal uit de mockup:

| Rol | Grootte | Gewicht | Kleur |
|---|---|---|---|
| Paginatitel | 22px | 700 | `--text` |
| Sectiekop / kaarttitel | 15–16px | 700 | `--text` |
| Body | 13–14px | 400–500 | `--text` |
| Bijschrift / sub | 12.5–13px | 400–500 | `--text-2` |
| Nav-item | 13.5px | 500 | `--text-2` (actief: wit) |
| Label (uppercase) | 10–11px | 700 | `--text-3`, `letter-spacing:1px`, `text-transform:uppercase` |
| Badge / tag | 11.5px | 600 | per statuskleur |

Koppen zijn bold (700), nooit zwaarder. Labels zijn klein, hoofdletters, gespatieerd — dat is het enige "uppercase"-patroon.

---

## 4. Vorm & ruimte

| Token | Waarde | Gebruik |
|---|---|---|
| `--radius` | `14px` | Kaarten, grote panelen |
| `--radius-sm` | `8px` | Inputs, kleine knoppen |
| Knop-radius | `9px` | Knoppen, nav-items, icon-buttons |
| Tag-radius | `20px` | Pill-vormige tags/badges |

**Schaduw (alleen op kaarten, subtiel):**

- Rust: `--card-shadow` → `0 1px 3px rgba(0,0,0,.06), 0 2px 8px rgba(0,0,0,.04)`
- Hover: `--card-shadow-hover` → `0 4px 12px rgba(0,0,0,.1)`

**Spacing:** content-padding `28px`, kaart-padding ~`16–24px`, gaps tussen elementen `10–16px`. Houd het ruim.

**Transitie:** `all .15s` op interactieve elementen. Snel, niet zweverig.

---

## 5. Componenten

### Knoppen

```
.btn          padding:9px 16px · radius:9px · font:13px/600 · gap:7px
.btn-primary  bg:--primary · tekst wit       → hover: bg:--primary-mid
.btn-ghost    transparant · border:1.5px --border · tekst:--text
              → hover: border:--primary · tekst:--primary · bg:--primary-light
.btn-sm       padding:7px 13px · font:12px
```

Eén primaire knop per scherm-context. De rest is ghost. Knoppen mogen een icoon links hebben (18px, `gap:7px`).

### Tags / badges

Pill-vorm (`radius:20px`), `padding:3px 9px`, `font:11.5px/600`. Varianten volgen de statuskleuren: `tag-green`, `tag-amber`, `tag-red`, `tag-blue`, `tag-gray`, en `tag-white` (voor op donkere/groene vlakken).

### Kaarten

Witte achtergrond, `radius:14px`, `--card-shadow`, `1px` border `--border`. Lift naar `--card-shadow-hover` bij interactie. Dit is de bouwsteen van elk scherm.

### Navigatie (sidebar)

- Breedte `240px`, witte achtergrond, rechterrand `--border`.
- Nav-item: `radius:9px`, default `--text-2`; hover `#F9FAFB`; **actief = `--primary` met witte tekst**.
- Nav-labels (sectiekoppen): 10px, uppercase, `--text-3`, gespatieerd.
- Badges in nav: grijze pill; urgente telling in rood (`#FEE2E2` / `--red`).

### Iconen

Lijn-iconen (SVG, stroke-stijl), `18px` in nav, `~16–18px` inline. Default `opacity:.7`, vol bij actief/hover. Houd één icon-set aan voor consistentie.

---

## 6. Logo

In de mockup: een groen vierkant "mark" (`34px`, `--primary`, `radius:9px`) met daarnaast de naam in 15px/700 en een subregel in 11px/`--text-2`. Voor het echte product hoort hier een definitief woord-/beeldmerk te komen — dit is een placeholder. **Open punt:** definitief logo ontwerpen/aanleveren.

---

## 7. Toon van tekst (microcopy)

De interface spreekt **gewone taal**, Nederlands, geen jargon. Kort, rustig, behulpzaam. Het principe uit het plan — *"liever een gat dan een aanname"* — geldt ook visueel: laat liever iets leeg of toon "onbekend" dan een verzonnen waarde. Statuslabels zijn één of twee woorden ("In termijn", "Bijna vervallen", "Vervallen").

---

## 8. Wat je niet doet

- Geen extra accentkleuren naast het palet hierboven.
- Geen tweede font.
- Geen zware schaduwen, gradients of glas-effecten.
- Geen vol scherm — bij twijfel iets weglaten.
- Kleur nooit puur decoratief; kleur = betekenis.

---

*Bron: `denieuwerentmeesters/index.html` (Gunterstein-mockup). Bij wijzigingen aan de mockup: dit document bijwerken.*
