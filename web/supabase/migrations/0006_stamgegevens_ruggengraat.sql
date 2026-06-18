-- ============================================================
-- Stamgegevens-ruggengraat (v1.6)
-- Bron: docs/technisch.md sectie 3 + 7 (v1.6)
--
-- Vervangt de smalle 'object'-tabel (alleen gebouwen) door de brede
-- registratie 'stamobject' voor ALLE fysieke/ruimtelijke objecten,
-- en voegt de polymorfe koppellaag 'verband' toe (AI stelt voor,
-- gebruiker accordeert).
--
-- Veilig idempotent waar mogelijk; voer eenmalig uit (supabase db push).
-- ============================================================

-- ------------------------------------------------------------
-- 1. PostGIS — nu aanzetten, 'geom' pas vullen in Fase 2 (kaart).
--    In schema 'extensions' (Supabase-conventie; niet in public).
-- ------------------------------------------------------------
create extension if not exists postgis with schema extensions;

-- ------------------------------------------------------------
-- 2. STAMOBJECT — de brede registratie
-- ------------------------------------------------------------
create table stamobject (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  categorie text not null check (categorie in (
    'gebouw','woning','opstal',                                       -- rood / bouwwerken
    'pachtperceel','natuurbeheertype','onderhoudszone','risicoplek',  -- vlakken / zones
    'wandelroute','weg_pad','bomenlaan','kabel_leiding','waterloop',  -- lijnen
    'brug','hek','vijver_sloot','overig'                              -- punten / overig
  )),
  geometrie_type text not null default 'geen'
    check (geometrie_type in ('punt','lijn','vlak','geen')),
  naam text not null,
  code text,                                    -- eigen referentie/nummer
  status text,                                  -- bv. 'actief','buiten gebruik'
  beschrijving text,
  kenmerken jsonb not null default '{}'::jsonb, -- categorie-specifiek: bouwjaar, monument_status, boomsoort, materiaal...
  perceel_id uuid references perceel(id) on delete set null,          -- op welk kadastraal perceel het ligt
  bovenliggend_id uuid references stamobject(id) on delete set null,  -- hierarchie: woning in gebouw, opstal op erf
  geom extensions.geometry,                     -- PostGIS; optioneel, gevuld zodra de kaart aan gaat
  aangemaakt_op timestamptz default now()
);
create index on stamobject (landgoed_id);
create index on stamobject (landgoed_id, categorie);
create index on stamobject using gist (geom);

-- ------------------------------------------------------------
-- 3. Bestaande 'object'-rijen (gebouwen) migreren naar stamobject.
--    id behouden, zodat bestaande FK-verwijzingen geldig blijven.
--    De smalle kolommen type/bouwjaar/monument_status verhuizen
--    naar kenmerken (jsonb); lege waarden weggelaten.
-- ------------------------------------------------------------
insert into stamobject (id, landgoed_id, categorie, geometrie_type, naam, beschrijving, kenmerken, aangemaakt_op)
select
  o.id,
  o.landgoed_id,
  'gebouw',
  'geen',
  o.naam,
  o.beschrijving,
  coalesce(
    jsonb_strip_nulls(jsonb_build_object(
      'type',            o.type,
      'bouwjaar',        o.bouwjaar,
      'monument_status', o.monument_status
    )),
    '{}'::jsonb
  ),
  now()
from object o;

-- ------------------------------------------------------------
-- 4. VERBAND — de koppellaag (koppelt elk record aan elk record)
--    N.B. naam 'verband' om verwarring met de integratie-'koppeling'
--    (Deel V) te vermijden.
-- ------------------------------------------------------------
create table verband (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,  -- voor RLS
  bron_type text not null,        -- bv. 'contract','relatie','taak','document','subsidie'
  bron_id   uuid not null,
  doel_type text not null,        -- meestal 'stamobject', soms 'perceel','relatie'
  doel_id   uuid not null,
  rol text,                       -- 'huurder_van','betreft','gelegen_op','inspectie_van',...
  status text not null default 'geaccordeerd'
    check (status in ('voorgesteld','geaccordeerd','afgewezen')),
  voorstel_reden text,            -- leesbare AI-onderbouwing bij status='voorgesteld'
  aangemaakt_door uuid references profiel(id),
  aangemaakt_op timestamptz default now(),
  unique (bron_type, bron_id, doel_type, doel_id, rol)
);
create index on verband (landgoed_id);
create index on verband (doel_type, doel_id);
create index on verband (bron_type, bron_id);

-- ------------------------------------------------------------
-- 5. Bestaande FK naar 'object' ompunten naar 'stamobject'.
--    Tot nu toe verwijst alleen transactie.object_id (0004) naar object.
--    Rijen hebben dezelfde id, dus de waarden blijven geldig.
-- ------------------------------------------------------------
alter table transactie rename column object_id to stamobject_id;
alter table transactie drop constraint transactie_object_id_fkey;
alter table transactie add constraint transactie_stamobject_id_fkey
  foreign key (stamobject_id) references stamobject(id) on delete set null;

-- ------------------------------------------------------------
-- 6. Oude 'object'-tabel verwijderen (RLS-policies vallen mee weg).
-- ------------------------------------------------------------
drop table object;

-- ------------------------------------------------------------
-- 7. Row Level Security — zelfde patroon als de overige tabellen
--    (leden lezen; eigenaar/rentmeester/admin beheren)
-- ------------------------------------------------------------
alter table stamobject enable row level security;
alter table verband    enable row level security;

create policy "stamobject zien" on stamobject for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "stamobject beheren" on stamobject for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

-- VERBAND: leden lezen (ook AI-voorstellen, zodat ze geaccordeerd kunnen worden);
-- eigenaar/rentmeester/admin beheren. Elk verband draagt landgoed_id.
create policy "verband zien" on verband for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "verband beheren" on verband for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());
