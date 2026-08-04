-- ============================================================
-- Omgevingsradar: de ingest kunnen aansturen vanuit de app
--
-- 0042 gaf de poort als SQL-functie, maar die neemt een PostGIS-geometrie aan
-- en dat is vanuit de applicatielaag niet door te geven. Deze migratie voegt
-- twee dingen toe:
--
--   1. rubriek -> thema: het documenttype van een bekendmaking
--      (OVERHEIDop.Rubriek) koppelen aan een radarthema, zodat de juiste
--      afstand gepakt wordt. Als data, net als de afstandstabel zelf.
--   2. Twee RPC-functies die de app wél kan aanroepen: de omhullende van het
--      invloedsgebied opvragen, en een punt door de poort halen.
--
-- Puur additief en idempotent.
-- ============================================================

set local search_path = public, extensions;

-- ------------------------------------------------------------
-- 1. Van documenttype naar thema
--
--    De bron noemt het een "omgevingsvergunning"; de radar moet weten dat
--    daar 150 m bij hoort. Meerdere rubrieken kunnen op hetzelfde thema
--    uitkomen.
-- ------------------------------------------------------------
alter table omgeving_thema add column if not exists rubrieken text[];

comment on column omgeving_thema.rubrieken is
  'Documenttypen (OVERHEIDop.Rubriek) uit de officiele bekendmakingen die op '
  'dit thema uitkomen. Leeg = niet automatisch te herkennen; dan valt het '
  'bericht terug op het standaardthema.';

update omgeving_thema set rubrieken = v.r from (values
  ('bouwvergunning',  array['omgevingsvergunning','omgevingsmelding','andere vergunning','andere melding']),
  ('kap_aanleg',      array['kapvergunning','aanlegvergunning']),
  ('infrastructuur',  array['verkeersbesluit of -mededeling','verkeersbesluit']),
  ('omgevingsplan',   array['omgevingsplan','bestemmingsplan','omgevingsverordening','verordeningen','beleidsregel']),
  ('peilbesluit',     array['peilbesluit','waterschapsverordening']),
  ('gebiedsproces',   array['participatie','overige overheidsinformatie'])
) as v(code, r) where omgeving_thema.code = v.code;

-- ------------------------------------------------------------
-- 2. Welk thema hoort bij een rubriek?
--
--    Geen treffer -> 'bouwvergunning' als voorzichtigste standaard: de
--    kleinste afstand (150 m), dus het minst ruis. Een bericht dat op de
--    eigen grond ligt komt sowieso door, ongeacht thema.
-- ------------------------------------------------------------
create or replace function omgeving_thema_voor_rubriek(p_rubriek text)
returns text
language sql
stable
set search_path = public, extensions
as $$
  select coalesce(
    (select code from omgeving_thema
      where actief and rubrieken is not null and p_rubriek = any(rubrieken)
      order by basis_urgentie limit 1),
    'bouwvergunning');
$$;

-- ------------------------------------------------------------
-- 3. De omhullende van het invloedsgebied
--
--    De app heeft dit nodig om te weten welke bestuursorganen te bevragen.
--    Als json, want een PostGIS-box komt niet door de REST-laag.
-- ------------------------------------------------------------
create or replace function omgeving_invloedsgebied_vak(p_landgoed_id uuid)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  select case when vorm is null then null else jsonb_build_object(
    'xmin', floor(extensions.st_xmin(vorm)),
    'ymin', floor(extensions.st_ymin(vorm)),
    'xmax', ceil(extensions.st_xmax(vorm)),
    'ymax', ceil(extensions.st_ymax(vorm))
  ) end
  from (select omgeving_invloedsgebied_vorm(p_landgoed_id) as vorm) s;
$$;

-- ------------------------------------------------------------
-- 4. Een punt door de poort
--
--    Bekendmakingen leveren een punt op (geocodeerd adres), geen vlak. Deze
--    wrapper is wat de ingest aanroept.
-- ------------------------------------------------------------
create or replace function omgeving_poort_punt(
  p_landgoed_id uuid,
  p_x           double precision,
  p_y           double precision,
  p_thema       text
)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'geo_relatie', p.geo_relatie,
    'afstand_m',   p.afstand_m,
    'thema',       p.thema,
    'urgentie',    p.urgentie)
  from omgeving_poort(
    p_landgoed_id,
    extensions.st_setsrid(extensions.st_makepoint(p_x, p_y), 28992),
    p_thema) p;
$$;

comment on function omgeving_poort_punt(uuid, double precision, double precision, text) is
  'Applicatie-ingang op omgeving_poort voor een geocodeerd punt in RD. Geeft '
  'relatie, afstand en urgentie terug als jsonb.';

-- ------------------------------------------------------------
-- 5. Het werkingsgebied van een bericht vastleggen
--
--    De app kan geen PostGIS-waarde schrijven via de REST-laag; deze functie
--    zet het geocodeerde punt op het bericht.
-- ------------------------------------------------------------
create or replace function omgevingsbericht_zet_punt(
  p_bericht_id uuid,
  p_x          double precision,
  p_y          double precision
)
returns void
language sql
volatile
set search_path = public, extensions
as $$
  update omgevingsbericht
     set werkingsgebied = extensions.st_setsrid(extensions.st_makepoint(p_x, p_y), 28992)
   where id = p_bericht_id;
$$;
