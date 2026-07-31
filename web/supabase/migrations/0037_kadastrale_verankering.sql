-- ============================================================
-- Stamgegevens stap 1: kadastrale verankering
--
-- "Wat je bezit" (kadastrale percelen, van het Kadaster) wordt een eigen
-- registratie, gescheiden van "wat je beheert" (beheerpercelen = stamobjecten).
-- Besluit 31-07-2026 (besluitenlogboek gap-analyse): veel-op-veel-koppeling
-- met dekking volledig/gedeeltelijk — deelpacht en de kloof tussen gebruiks-
-- en kadastrale grenzen zijn staande NL-praktijk (RVO/BRP).
--
-- Puur additief + idempotent. De bestaande kenmerken-json blijft (transitie);
-- de backfill hieronder zet de al geplaatste kaart-percelen automatisch over.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Kadastrale percelen — de juridische registratie (bron: Kadaster/PDOK)
-- ------------------------------------------------------------
create table if not exists kadastraal_perceel (
  id                    uuid        primary key default gen_random_uuid(),
  landgoed_id           uuid        not null references landgoed(id) on delete cascade,
  kadastrale_gemeente   text        not null,
  sectie                text        not null,
  perceelnummer         text        not null,
  -- weergavelabel, bv. "Middelburg B 1234"
  kadastrale_aanduiding text        not null,
  oppervlakte_m2        numeric,
  bron                  text        not null default 'pdok_brk',
  -- externe identificatie uit de bronregistratie (BRK lokaalID)
  bron_identificatie    text,
  opgehaald_op          timestamptz,
  aangemaakt_op         timestamptz not null default now(),
  -- de officiële aanduiding is uniek — hetzelfde perceel kan niet twee keer
  unique (landgoed_id, kadastrale_gemeente, sectie, perceelnummer)
);

create index if not exists kadastraal_perceel_landgoed_idx on kadastraal_perceel (landgoed_id);

-- ------------------------------------------------------------
-- 2. Koppeling beheerperceel (stamobject) <-> kadastraal perceel (N:M)
--    Eén weiland kan meerdere kadastrale nummers beslaan, en andersom.
-- ------------------------------------------------------------
create table if not exists beheerperceel_kadastraal (
  id                    uuid        primary key default gen_random_uuid(),
  landgoed_id           uuid        not null references landgoed(id) on delete cascade,
  stamobject_id         uuid        not null references stamobject(id) on delete cascade,
  kadastraal_perceel_id uuid        not null references kadastraal_perceel(id) on delete cascade,
  -- beslaat het beheerperceel dit kadastrale perceel helemaal of deels?
  dekking               text        not null default 'volledig'
                          check (dekking in ('volledig', 'gedeeltelijk')),
  aangemaakt_op         timestamptz not null default now(),
  unique (stamobject_id, kadastraal_perceel_id)
);

create index if not exists beheerperceel_kadastraal_landgoed_idx  on beheerperceel_kadastraal (landgoed_id);
create index if not exists beheerperceel_kadastraal_perceel_idx   on beheerperceel_kadastraal (kadastraal_perceel_id);
create index if not exists beheerperceel_kadastraal_stamobj_idx   on beheerperceel_kadastraal (stamobject_id);

-- ------------------------------------------------------------
-- 3. RLS — zelfde model als stamobject/verband (0006)
-- ------------------------------------------------------------
alter table kadastraal_perceel       enable row level security;
alter table beheerperceel_kadastraal enable row level security;

drop policy if exists "kadastraal perceel zien"    on kadastraal_perceel;
drop policy if exists "kadastraal perceel beheren" on kadastraal_perceel;
create policy "kadastraal perceel zien" on kadastraal_perceel for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "kadastraal perceel beheren" on kadastraal_perceel for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

drop policy if exists "perceelkoppeling zien"    on beheerperceel_kadastraal;
drop policy if exists "perceelkoppeling beheren" on beheerperceel_kadastraal;
create policy "perceelkoppeling zien" on beheerperceel_kadastraal for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "perceelkoppeling beheren" on beheerperceel_kadastraal for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

-- ------------------------------------------------------------
-- 4. Backfill: bestaande kaart-percelen (kenmerken-json) overzetten.
--    Alleen rijen met een complete kadastrale aanduiding; de kenmerken-json
--    blijft staan (transitie). Idempotent via on conflict / not exists.
-- ------------------------------------------------------------
insert into kadastraal_perceel
  (landgoed_id, kadastrale_gemeente, sectie, perceelnummer, kadastrale_aanduiding,
   oppervlakte_m2, bron_identificatie, opgehaald_op)
select distinct on (s.landgoed_id, s.kenmerken->>'kadastrale_gemeente', s.kenmerken->>'sectie', s.kenmerken->>'perceelnummer')
  s.landgoed_id,
  s.kenmerken->>'kadastrale_gemeente',
  s.kenmerken->>'sectie',
  s.kenmerken->>'perceelnummer',
  coalesce(
    nullif(s.kenmerken->>'kadastrale_aanduiding', ''),
    concat_ws(' ', s.kenmerken->>'kadastrale_gemeente', s.kenmerken->>'sectie', s.kenmerken->>'perceelnummer')
  ),
  nullif(s.kenmerken->>'oppervlakte_m2', '')::numeric,
  nullif(s.kenmerken->>'identificatie', ''),
  s.aangemaakt_op
from stamobject s
where s.categorie = 'pachtperceel'
  and nullif(s.kenmerken->>'kadastrale_gemeente', '') is not null
  and nullif(s.kenmerken->>'sectie', '') is not null
  and nullif(s.kenmerken->>'perceelnummer', '') is not null
on conflict (landgoed_id, kadastrale_gemeente, sectie, perceelnummer) do nothing;

insert into beheerperceel_kadastraal (landgoed_id, stamobject_id, kadastraal_perceel_id)
select s.id_landgoed, s.id_stam, k.id
from (
  select st.landgoed_id as id_landgoed, st.id as id_stam,
         st.kenmerken->>'kadastrale_gemeente' as gem,
         st.kenmerken->>'sectie' as sec,
         st.kenmerken->>'perceelnummer' as nr
  from stamobject st
  where st.categorie = 'pachtperceel'
    and nullif(st.kenmerken->>'kadastrale_gemeente', '') is not null
    and nullif(st.kenmerken->>'sectie', '') is not null
    and nullif(st.kenmerken->>'perceelnummer', '') is not null
) s
join kadastraal_perceel k
  on k.landgoed_id = s.id_landgoed
 and k.kadastrale_gemeente = s.gem
 and k.sectie = s.sec
 and k.perceelnummer = s.nr
on conflict (stamobject_id, kadastraal_perceel_id) do nothing;
