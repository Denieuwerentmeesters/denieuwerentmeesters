# De Nieuwe Rentmeesters — landgoedplatform

## Wat dit is

Multi-tenant SaaS voor het beheer van (NSW-)landgoederen: stamgegevens, percelen en kaart,
contracten (o.a. pacht), regelingen en subsidies met matchmotor, taken en agenda, en
vergaderingen met AI-transcriptie. Stack: Next.js 16 + React 19, Supabase (Postgres met
RLS, multi-tenant via `landgoed_id` + lidmaatschap-rollen), deploy op Vercel. AI via de
Anthropic SDK (en Groq voor transcriptie). Domeintaal, UI en code-commentaar zijn Nederlands.

## Structuur

- Repo-root: git en CI (`.github/workflows/ci.yml`, check heet "Typecheck en tests").
- `web/` — de Next.js-app. **Alle npm-commando's draaien vanuit `web/`.**
- `web/supabase/migrations/` — de enige waarheid voor het databaseschema.
- `web/tests/` — vitest-tests.

## Commando's (vanuit `web/`)

- `npm run dev` — app lokaal op http://localhost:3000
- `npm run typecheck` — moet stil/schoon zijn
- `npm test` — alle tests moeten slagen

Draai typecheck en tests altijd vóór het pushen.

## Werkwijze (verplicht)

- Nooit rechtstreeks op `main` werken of committen. Eén klus = één `feat/...`-branch = één PR.
- **Begin elke klus met een verse branch vanaf de actuele `main`** — zie het blok hieronder.
- Mergen kan alleen als de check "Typecheck en tests" groen is; merge als **squash and merge**.
- Databasewijzigingen alléén via een nieuw migratiebestand in `web/supabase/migrations/`
  (nooit rechtstreeks in de live database) — en benoem het expliciet in de PR zodat de
  ander meekijkt vóór de merge. Zie het aparte blok hieronder voor het toepassen op live.
- Secrets nooit in code, commits, logs of chat; environment-variabelen via Vercel.
- GitHub Issues in deze repo zijn de gezamenlijke takenlijst: werk per issue en verwijs
  ernaar in de PR ("Closes #…").

### Branches: altijd vers vanaf `main` (verplicht)

Begin **elke** klus zo, vóór de eerste wijziging:

```
git fetch origin
git checkout -b feat/<korte-omschrijving> origin/main
```

- **Eerst `fetch`, dan pas aftakken.** Een verouderde lokale `main` geeft een conflicterende PR.
  En let op het stille gevolg: bij `mergeStateStatus: DIRTY` draait GitHub Actions niet meer,
  want het `pull_request`-event kan de merge-commit niet bouwen. De check "Typecheck en tests"
  verdwijnt dan uit beeld in plaats van rood te worden.
- **Nooit doorwerken op een branch waarvan de PR al gemerged is.** Wij mergen met **squash**;
  daarbij worden de losse commits van de branch géén ancestors van `main`. Zo'n branch loopt
  dus "vooruit" en nieuw werk hangt eraan zonder PR. Dat is stil: Vercel bouwt een preview per
  branch — ook zonder PR — dus het lijkt alsof er iets is doorgevoerd terwijl er in GitHub
  niets te mergen staat. Is de PR gemerged en komt er nieuw werk? Nieuwe branch vanaf `main`.
- **Alleen doorwerken op een bestaande branch** als het over hetzelfde onderwerp gaat én de PR
  nog openstaat.
- **Ruim gemergede branches op** (lokaal en op de remote), zodat er geen restanten blijven staan.

### Databasemigraties: van repo naar live (verplicht, één vaste weg)

De repo is de **enige waarheid** voor het schema. Eerder liepen repo en live-database uit
elkaar doordat de stap "toepassen op live" niet was vastgelegd. Daarom, zonder uitzondering:

- **Nooit** rechtstreeks in het Supabase-dashboard het schema aanpassen (geen ad-hoc SQL,
  geen kolommen/policies met de hand) — ook niet "even snel". Elke wijziging is een migratie.
- **Migraties zijn idempotent**: `create table if not exists`, `add column if not exists`,
  `drop policy if exists` vóór `create policy`. Zo is (opnieuw) draaien altijd veilig.
- **Mergen ≠ toegepast.** Een gemergede migratie-PR staat alleen in de code, nog niet in de
  database.
- **Wie de migratie-PR merget, past 'm meteen toe op live** via één vaste methode:
  Supabase → **SQL Editor** → de SQL van het nieuwe migratiebestand plakken → **Run**.
  (De migratie is idempotent, dus dit kan geen kwaad, ook niet als een deel al bestond.)
- **Meng geen tools.** Gebruik altijd deze SQL-Editor-route; geen `supabase db push` ertussen
  — juist dat door elkaar gebruiken veroorzaakte de scheefgroei tussen repo en live.

## Kwaliteitsregels

- Elke Supabase-call: `error` controleren en afhandelen — nooit stil laten mislukken.
- API-routes met een secret zijn fail-closed: ontbreekt het secret in de omgeving, dan
  weigeren — zie het goede patroon in `web/app/api/subsidie/import/route.ts`.
- AI-uitvoer is altijd een vóórstel: `herkomst='ai'`, `geaccordeerd=false`. Nooit
  AI-resultaat direct als vaststaand feit wegschrijven.
- Geen nieuwe `(supabase as any)`-casts toevoegen; los het onderliggende typeprobleem op.
- Externe bronnen (PDOK, RCE, ANLb, KOOP): fetch met timeout, en toon fouten aan de
  gebruiker — "bron niet bereikbaar" is iets anders dan "geen resultaat".
- Multi-tenant discipline: elke query en server action begrensd op `landgoed_id` met
  lidmaatschapscheck; storage-paden beginnen met `{landgoed_id}/`.

## Context

Het bouwplan en het code-reviewrapport staan in Dropbox (map "1. Bouwspecs"). De
verhardingsklussen daaruit (Fase V) staan als open GitHub-issues in deze repo — dat is
de actuele prioriteitenlijst.
