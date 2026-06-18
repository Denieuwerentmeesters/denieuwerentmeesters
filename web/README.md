# Landgoedplatform — webapp

De Nieuwe Rentmeesters. Next.js 16 (App Router) + Supabase. Zie `../docs/technisch.md` voor de architectuur en `../docs/brand-guide.md` voor de stijl.

## Stack

- **Frontend + server-routes:** Next.js 16 op Vercel
- **Datalaag:** Supabase (Postgres + Auth + Storage + RLS) — project `Landgoedplatform` (`enpcykpvaejkxoghglci`)
- **Backend/workers (later, fase 2+):** Railway — voor e-mail, bankpolling, factuurscan, AI

## Lokaal draaien

1. `npm install`
2. Kopieer `.env.local.example` naar `.env.local` en vul de Supabase-sleutels in (Settings → API). Voor dit project staan ze al in `.env.local`.
3. `npm run dev` → http://localhost:3000

## Database

De migraties staan in `supabase/migrations/` en zijn al toegepast op het project:

- `0001_fundament.sql` — tabellen, RLS-helpers, policies, registratie-trigger
- `0002_provisioning.sql` — `landgoed_aanmaken()` (zelf een landgoed aanmaken als eigenaar)
- `0003_functie_rechten.sql` — EXECUTE-rechten op de SECURITY DEFINER-functies aanscherpen

Bij wijzigingen: nieuwe migratie toevoegen, niet bestaande aanpassen.

## Inloggen / eerste gebruiker

Registreren kan op `/login`. **Let op:** e-mailbevestiging staat aan in Supabase — je krijgt een bevestigingsmail en moet die link openen vóór je kunt inloggen. Voor wrijvingsloos ontwikkelen kun je dit uitzetten in het Supabase-dashboard (Auth → Providers → Email → "Confirm email" uit).

Jezelf admin maken (optioneel, voor nationale documenten e.d.): zie sectie 7.6 onderaan `0001_fundament.sql`.

## Wat werkt (Fase 0 — fundament)

- Inloggen/registreren (Supabase Auth)
- Multi-tenant: elk landgoed strikt gescheiden via Row Level Security
- Rollen: admin / eigenaar / rentmeester / kijker
- Landgoederen-overzicht + zelf een landgoed aanmaken
- Beveiligde routes via `proxy.ts` (Next.js 16: opvolger van `middleware.ts`)

Fase 1 (documenten, taken, contracten, licht financieel inzicht) komt hierna — zie `../docs/plan.md`.
