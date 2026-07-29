-- ============================================================
-- Schema-verzoening (#3)
--
-- De code gebruikt tabellen/kolommen die in GEEN migratie stonden, waardoor
-- de database niet reproduceerbaar was vanuit de repo (blokkeert staging,
-- nieuwe tenants, CI). Deze migratie brengt het schema in lijn met wat de
-- code al verwacht.
--
-- Uitgangspunten:
--  * Puur additief en idempotent (create/add ... if not exists, constraint
--    verbreden nooit versmallen). Draait 'ie op de bestaande live-database
--    (die deze objecten al kent), dan is het grotendeels een no-op; op een
--    verse database wordt het schema eindelijk compleet.
--  * NIET verwijderd: het oude `vergadering`-schema (0004) — dat wordt nog
--    gelezen in overzicht/page.tsx. Opruimen kan pas na migratie van dat scherm.
--
-- LET OP (te verifiëren tegen de live-DB vóór definitief toepassen): de RLS-
-- policies hieronder zijn gereconstrueerd naar het model van `vergadering`
-- (0004) en `notitie` (0025). Bestaan er op live al policies met andere namen,
-- controleer dan of ze naast deze blijven bestaan.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Vergadermodule: prompt_sjabloon + gesprek*
--    (prompt_sjabloon eerst: gesprek_bewerking verwijst ernaar)
-- ------------------------------------------------------------

-- Globale catalogus met AI-promptsjablonen (geen landgoed_id — gedeeld).
-- NB: de inhoud (de sjablonen zelf) is content; die hoort in een seed/import-
-- pad, net als de kennisbank (0026). Deze migratie maakt alleen de structuur.
create table if not exists prompt_sjabloon (
  id           uuid        primary key default gen_random_uuid(),
  titel        text        not null,
  prompttekst  text        not null,
  output_type  text        not null default 'tekst',
  volgorde     int         not null default 0,
  zichtbaar    boolean     not null default true,
  aangemaakt_op timestamptz default now()
);

-- Een gesprek/vergadering met transcriptie en AI-bewerkingen.
create table if not exists gesprek (
  id           uuid        primary key default gen_random_uuid(),
  landgoed_id  uuid        not null references landgoed(id) on delete cascade,
  titel        text        not null,
  datum        date,
  status       text        not null default 'nieuw'
                 check (status in ('nieuw','getranscribeerd','verwerkt','opgeruimd')),
  aangemaakt_op timestamptz default now()
);

-- Transcript van een gesprek (1-op-1).
create table if not exists gesprek_transcript (
  id           uuid        primary key default gen_random_uuid(),
  gesprek_id   uuid        not null references gesprek(id) on delete cascade,
  tekst        text,
  bewaren      boolean     not null default true,
  aangemaakt_op timestamptz default now(),
  unique (gesprek_id)
);

-- Resultaat van een prompt toegepast op een transcript.
create table if not exists gesprek_bewerking (
  id                 uuid        primary key default gen_random_uuid(),
  gesprek_id         uuid        not null references gesprek(id) on delete cascade,
  prompt_sjabloon_id uuid        references prompt_sjabloon(id) on delete set null,
  output_tekst       text,
  status             text        not null default 'concept',
  aangemaakt_op      timestamptz default now()
);

-- Voorgestelde actiepunten uit een gesprek (AI-voorstel; mens accordeert).
create table if not exists gesprek_actie_voorstel (
  id                        uuid        primary key default gen_random_uuid(),
  gesprek_id                uuid        not null references gesprek(id) on delete cascade,
  omschrijving              text        not null,
  bron_citaat               text,
  contact_id                uuid        references relatie(id) on delete set null,
  match_status              text,
  match_kandidaten          jsonb,
  deadline                  date,
  deadline_is_interpretatie boolean     default false,
  status                    text        not null default 'voorgesteld'
                              check (status in ('voorgesteld','bevestigd','afgewezen')),
  aangemaakt_op             timestamptz default now()
);

create index if not exists gesprek_landgoed_idx           on gesprek (landgoed_id);
create index if not exists gesprek_bewerking_gesprek_idx  on gesprek_bewerking (gesprek_id);
create index if not exists gesprek_actie_gesprek_idx      on gesprek_actie_voorstel (gesprek_id);

-- ------------------------------------------------------------
-- 2. RLS voor de vergadermodule
--    parent (gesprek) op landgoed_id; children via het bovenliggende gesprek.
--    drop-if-exists maakt het herdraaibaar.
-- ------------------------------------------------------------

alter table prompt_sjabloon        enable row level security;
alter table gesprek                enable row level security;
alter table gesprek_transcript     enable row level security;
alter table gesprek_bewerking      enable row level security;
alter table gesprek_actie_voorstel enable row level security;

-- prompt_sjabloon: gedeelde catalogus — lezen voor ingelogden, beheren = admin.
drop policy if exists "prompt sjabloon zien"    on prompt_sjabloon;
drop policy if exists "prompt sjabloon beheren" on prompt_sjabloon;
create policy "prompt sjabloon zien" on prompt_sjabloon for select to authenticated
  using (true);
create policy "prompt sjabloon beheren" on prompt_sjabloon for all
  using (is_admin()) with check (is_admin());

-- gesprek: zien = lid; beheren = eigenaar/rentmeester (zoals vergadering).
drop policy if exists "gesprek zien"    on gesprek;
drop policy if exists "gesprek beheren" on gesprek;
create policy "gesprek zien" on gesprek for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "gesprek beheren" on gesprek for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

-- gesprek_transcript: rechten volgen het bovenliggende gesprek.
drop policy if exists "transcript zien"    on gesprek_transcript;
drop policy if exists "transcript beheren" on gesprek_transcript;
create policy "transcript zien" on gesprek_transcript for select
  using (exists (
    select 1 from gesprek g
    where g.id = gesprek_transcript.gesprek_id
      and (is_lid_van(g.landgoed_id) or is_admin())
  ));
create policy "transcript beheren" on gesprek_transcript for all
  using (exists (
    select 1 from gesprek g
    where g.id = gesprek_transcript.gesprek_id
      and (rol_op(g.landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  ))
  with check (exists (
    select 1 from gesprek g
    where g.id = gesprek_transcript.gesprek_id
      and (rol_op(g.landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  ));

-- gesprek_bewerking: idem via het gesprek.
drop policy if exists "bewerking zien"    on gesprek_bewerking;
drop policy if exists "bewerking beheren" on gesprek_bewerking;
create policy "bewerking zien" on gesprek_bewerking for select
  using (exists (
    select 1 from gesprek g
    where g.id = gesprek_bewerking.gesprek_id
      and (is_lid_van(g.landgoed_id) or is_admin())
  ));
create policy "bewerking beheren" on gesprek_bewerking for all
  using (exists (
    select 1 from gesprek g
    where g.id = gesprek_bewerking.gesprek_id
      and (rol_op(g.landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  ))
  with check (exists (
    select 1 from gesprek g
    where g.id = gesprek_bewerking.gesprek_id
      and (rol_op(g.landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  ));

-- gesprek_actie_voorstel: idem via het gesprek.
drop policy if exists "actievoorstel zien"    on gesprek_actie_voorstel;
drop policy if exists "actievoorstel beheren" on gesprek_actie_voorstel;
create policy "actievoorstel zien" on gesprek_actie_voorstel for select
  using (exists (
    select 1 from gesprek g
    where g.id = gesprek_actie_voorstel.gesprek_id
      and (is_lid_van(g.landgoed_id) or is_admin())
  ));
create policy "actievoorstel beheren" on gesprek_actie_voorstel for all
  using (exists (
    select 1 from gesprek g
    where g.id = gesprek_actie_voorstel.gesprek_id
      and (rol_op(g.landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  ))
  with check (exists (
    select 1 from gesprek g
    where g.id = gesprek_actie_voorstel.gesprek_id
      and (rol_op(g.landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  ));

-- ------------------------------------------------------------
-- 3. Ontbrekende kolommen op bestaande tabellen
-- ------------------------------------------------------------

-- regeling: gebruikt in subsidies/matching.ts en de subsidie-pagina's.
alter table regeling add column if not exists doelgroep_type text;
alter table regeling add column if not exists categorie_ui   text;
alter table regeling add column if not exists is_standaard   boolean not null default false;

-- landgoed: geo-verrijking uit kaart/acties.ts (Bodemkaart + ANLb).
alter table landgoed add column if not exists ligt_op_veengrond        boolean;
alter table landgoed add column if not exists bodemkaart_bodemcode     text;
alter table landgoed add column if not exists veengrond_gecontroleerd_op timestamptz;
alter table landgoed add column if not exists anlb_leefgebied_code     text;
alter table landgoed add column if not exists anlb_leefgebied_naam     text;
alter table landgoed add column if not exists anlb_gebied              text;
alter table landgoed add column if not exists anlb_gecontroleerd_op    timestamptz;

-- ------------------------------------------------------------
-- 4. Constraint-drift: subsidie.soort
--    matching.ts schrijft/leest 'info' (standaard-regelingen), maar de check
--    in 0012 kende alleen 'lopend'/'kans'. Verbreden (nooit versmallen).
-- ------------------------------------------------------------
alter table subsidie drop constraint if exists subsidie_soort_check;
alter table subsidie add constraint subsidie_soort_check
  check (soort in ('lopend','kans','info'));

-- ------------------------------------------------------------
-- Bewust NIET in deze migratie (zie PR-omschrijving):
--  * stamobject.categorie 'perceel' — alleen een leesfilter, wordt nergens
--    geschreven; constraint ongemoeid gelaten (open vraag: legacy-data of
--    dode filtercode?).
--  * vergadering*/taak.vergadering_id droppen — vergadering wordt nog gebruikt.
-- ------------------------------------------------------------
