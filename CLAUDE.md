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
- Mergen kan alleen als de check "Typecheck en tests" groen is; merge als **squash and merge**.
- Databasewijzigingen alléén via een nieuw migratiebestand in `web/supabase/migrations/`
  (nooit rechtstreeks in de live database) — en benoem het expliciet in de PR zodat de
  ander meekijkt vóór de merge.
- Secrets nooit in code, commits, logs of chat; environment-variabelen via Vercel.
- GitHub Issues in deze repo zijn de gezamenlijke takenlijst: werk per issue en verwijs
  ernaar in de PR ("Closes #…").

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
