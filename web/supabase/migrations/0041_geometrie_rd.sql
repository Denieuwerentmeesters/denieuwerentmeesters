-- ============================================================
-- Omgevingsradar fase 0: rekengeometrie in RD (EPSG:28992)
--
-- De perceelvormen staan als GeoJSON in jsonb, in EPSG:3857 (Web Mercator).
-- Dat is prima om te tékenen — Leaflet/OpenLayers werken in Mercator — maar
-- je mag er niet in rékenen. Op 52° noorderbreedte is Mercator ~1,62x
-- uitgerekt in de lengte en dus ~2,62x in oppervlakte. Gemeten op de eigen
-- data (37 percelen Ter Hooge): 602.916 m2 volgens het Kadaster, 1.555.318
-- "m2" gerekend op geom_3857 — een factor 2,58 te groot, zonder dat er ooit
-- een foutmelding komt. Op afstanden hetzelfde beeld: een buffer van 500 m
-- in Mercator is in werkelijkheid ~310 m.
--
-- Daarom: één bron (geom_3857), twee representaties. De radar rekent
-- uitsluitend op geom_rd; de kaart tekent uitsluitend op geom_3857.
--
-- De RD-kolommen worden door een trigger onderhouden, niet eenmalig gevuld.
-- Dat is het verschil tussen een fundament en een momentopname: de kaart
-- schrijft geom_3857 bij elk nieuw geplaatst perceel, en een backfill zou
-- vanaf dat moment stil achterlopen.
--
-- Puur additief en idempotent.
-- ============================================================

set local search_path = public, extensions;

-- ------------------------------------------------------------
-- 1. Rekenkolommen
-- ------------------------------------------------------------
alter table kadastraal_perceel
  add column if not exists geom_rd extensions.geometry(MultiPolygon, 28992);

alter table beheerperceel_kadastraal
  add column if not exists deel_geom_rd extensions.geometry(MultiPolygon, 28992);

comment on column kadastraal_perceel.geom_rd is
  'Rekengeometrie in RD/EPSG:28992, automatisch afgeleid uit geom_3857 door trigger '
  'kadastraal_perceel_geom_rd_bij. Niet met de hand vullen. Alle ruimtelijke '
  'berekeningen (ST_Area, ST_DWithin, ST_Intersects) gaan over deze kolom — '
  'nooit over geom_3857, dat alleen dient om te tekenen.';

comment on column beheerperceel_kadastraal.deel_geom_rd is
  'Rekengeometrie van het deelvlak in RD/EPSG:28992, afgeleid uit deel_geom_3857. '
  'Leeg wanneer er geen splitsing is getekend; dan telt het hele perceel.';

-- ------------------------------------------------------------
-- 2. GeoJSON (3857) -> PostGIS (28992)
--
--    De GeoJSON draagt zelf geen CRS, dus de SRID moet expliciet gezet
--    worden vóór de transformatie — anders transformeert ST_Transform
--    vanuit SRID 0 en faalt hij (of erger: doet hij niets).
-- ------------------------------------------------------------
--    Defensief: levert de omzetting niets bruikbaars op (geen polygoon,
--    onparsebare GeoJSON), dan is het antwoord NULL en geen fout. De radar
--    mist dat perceel dan — zichtbaar via geometrie_controle.onvertaalbaar —
--    maar het inladen van bezit blijft werken. Andersom zou een trigger op
--    kadastraal_perceel de importflow van de kaart kunnen breken op iets wat
--    niets met de radar te maken heeft, en dat is de verkeerde ruil.
create or replace function geojson_3857_naar_rd(g jsonb)
returns extensions.geometry(MultiPolygon, 28992)
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  vorm extensions.geometry;
begin
  if g is null then
    return null;
  end if;

  vorm := extensions.st_setsrid(extensions.st_geomfromgeojson(g::text), 3857);

  -- Alleen vlakken zijn zinnig als perceelvorm; een punt of lijn zou hier
  -- toch stuklopen op het kolomtype.
  if extensions.st_geometrytype(vorm) not in ('ST_Polygon', 'ST_MultiPolygon') then
    return null;
  end if;

  return extensions.st_multi(extensions.st_transform(vorm, 28992));
exception
  when others then
    return null;
end;
$$;

comment on function geojson_3857_naar_rd(jsonb) is
  'Zet een GeoJSON-vlak in EPSG:3857 om naar een PostGIS-MultiPolygon in RD. '
  'Enige toegestane route van tekengeometrie naar rekengeometrie. Geeft NULL '
  'terug bij onbruikbare invoer in plaats van een fout, zodat een trigger op '
  'kadastraal_perceel nooit een schrijfactie van de kaart kan blokkeren.';

-- ------------------------------------------------------------
-- 3. Triggers — houden de RD-kolom synchroon met de bron
-- ------------------------------------------------------------
create or replace function kadastraal_perceel_geom_rd()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.geom_rd := geojson_3857_naar_rd(new.geom_3857);
  return new;
end;
$$;

drop trigger if exists kadastraal_perceel_geom_rd_bij on kadastraal_perceel;
create trigger kadastraal_perceel_geom_rd_bij
  before insert or update of geom_3857 on kadastraal_perceel
  for each row execute function kadastraal_perceel_geom_rd();

create or replace function beheerperceel_deel_geom_rd()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.deel_geom_rd := geojson_3857_naar_rd(new.deel_geom_3857);
  return new;
end;
$$;

drop trigger if exists beheerperceel_deel_geom_rd_bij on beheerperceel_kadastraal;
create trigger beheerperceel_deel_geom_rd_bij
  before insert or update of deel_geom_3857 on beheerperceel_kadastraal
  for each row execute function beheerperceel_deel_geom_rd();

-- ------------------------------------------------------------
-- 4. Backfill van wat er nu staat
-- ------------------------------------------------------------
update kadastraal_perceel
  set geom_rd = geojson_3857_naar_rd(geom_3857)
  where geom_3857 is not null and geom_rd is null;

update beheerperceel_kadastraal
  set deel_geom_rd = geojson_3857_naar_rd(deel_geom_3857)
  where deel_geom_3857 is not null and deel_geom_rd is null;

-- ------------------------------------------------------------
-- 5. Ruimtelijke indexen
--
--    Dit is de reden voor een echte kolom in plaats van
--    ST_GeomFromGeoJSON bij elke query: jsonb is niet ruimtelijk
--    indexeerbaar. Bij 51 percelen merk je dat niet, maar de ruimtelijke
--    poort draait straks dagelijks over duizenden berichten.
-- ------------------------------------------------------------
create index if not exists kadastraal_perceel_geom_rd_idx
  on kadastraal_perceel using gist (geom_rd);

create index if not exists beheerperceel_deel_geom_rd_idx
  on beheerperceel_kadastraal using gist (deel_geom_rd);

-- ------------------------------------------------------------
-- 6. Controle: RD-oppervlakte moet de kadastrale oppervlakte benaderen
--
--    Dit is de test die onmiddellijk faalt als iemand de transformatie
--    vergeet of terugdraait naar 3857 — dan loopt de afwijking naar +158%
--    in plaats van onder de 1%. Als view zodat hij op elk moment te
--    bevragen is, en direct hieronder als harde assertie zodat een foute
--    backfill niet gecommit wordt.
-- ------------------------------------------------------------
create or replace view geometrie_controle as
select
  k.landgoed_id,
  -- Percelen die meetellen in de vergelijking hieronder.
  count(*) filter (where k.meetbaar)                      as percelen,
  -- Percelen met wél een tekenvorm maar geen rekenvorm: onzichtbaar voor de
  -- radar. Hoort 0 te zijn; is het dat niet, dan levert de bron iets anders
  -- aan dan een vlak en slikt geojson_3857_naar_rd dat stil in.
  count(*) filter (
    where k.geom_3857 is not null and k.geom_rd is null
  )                                                       as onvertaalbaar,
  round(sum(k.oppervlakte_m2) filter (where k.meetbaar))   as kadaster_m2,
  -- ST_Area geeft double precision; round(double, int) bestaat niet in
  -- Postgres, vandaar de cast naar numeric.
  round(sum(k.rd_opp) filter (where k.meetbaar)::numeric)  as rd_m2,
  round(
    100 * abs(
      sum(k.rd_opp) filter (where k.meetbaar)::numeric
      - sum(k.oppervlakte_m2) filter (where k.meetbaar)
    ) / nullif(sum(k.oppervlakte_m2) filter (where k.meetbaar), 0)
  , 3)                                                    as afwijking_pct
from (
  select
    landgoed_id,
    geom_3857,
    geom_rd,
    oppervlakte_m2,
    extensions.st_area(geom_rd)                              as rd_opp,
    (geom_rd is not null and oppervlakte_m2 is not null)     as meetbaar
  from kadastraal_perceel
) k
group by k.landgoed_id;

comment on view geometrie_controle is
  'Vergelijkt de berekende RD-oppervlakte met de officiele kadastrale oppervlakte, '
  'per landgoed. Afwijking hoort ver onder 1% te blijven (gemeten 3 aug 2026: '
  '0,17% voor Ter Hooge, 0,04% voor de testcase). Loopt dit richting 158%, dan '
  'wordt er ergens op geom_3857 gerekend in plaats van op geom_rd. Kolom '
  'onvertaalbaar hoort 0 te zijn: alles daarboven is een perceel dat de radar '
  'niet ziet.';

do $$
declare
  ergste numeric;
  waar   uuid;
begin
  select afwijking_pct, landgoed_id into ergste, waar
  from geometrie_controle order by afwijking_pct desc nulls last limit 1;

  if ergste is not null and ergste > 1 then
    raise exception
      'Geometriecontrole faalt: landgoed % wijkt %%% af van de kadastrale oppervlakte '
      '(grens 1%%). De RD-transformatie klopt niet — niet doorvoeren.', waar, ergste;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 7. stamobject.geom — SRID vastleggen
--
--    De kolom is ongetypeerd (SRID 0) terwijl de inhoud in 3857 hoort te
--    staan. De tabel bevat op dit moment 0 rijen met geometrie, dus dit is
--    het goedkoopste moment om dat vast te zetten: later kost het een
--    datamigratie. Vlakken/lijnen/punten door elkaar, vandaar Geometry.
-- ------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from geometry_columns
    where f_table_schema = 'public' and f_table_name = 'stamobject'
      and f_geometry_column = 'geom' and srid = 0
  ) and not exists (select 1 from stamobject where geom is not null) then
    alter table stamobject
      alter column geom type extensions.geometry(Geometry, 3857)
      using extensions.st_setsrid(geom, 3857);
  end if;
end;
$$;
