-- ============================================================
-- Publicaties één keer ophalen, per landgoed matchen
--
-- De ingest deed alles per landgoed: ophalen, geocoderen én matchen. Dat werkt
-- bij één landgoed en schaalt daarna verkeerd, want twee dingen zijn niet
-- landgoed-afhankelijk:
--
--   - de publicatie zelf (titel, datum, besluitsoort, termijn)
--   - waar hij ligt (het geocodeerde punt)
--
-- Tien landgoederen in Middelburg haalden dus tien keer dezelfde 1231
-- publicaties op en geocodeerden ze tien keer. De kosten schaalden met het
-- aantal klanten terwijl het werk identiek was, en de dagelijkse ronde liep
-- in één functie-aanroep over alle landgoederen — bij ongeveer 35 landgoederen
-- zou die stilletjes op de tijdslimiet stuklopen.
--
-- Voortaan gescheiden:
--
--   omgevingspublicatie   gedeeld, één rij per bekendmaking, mét coördinaat
--   omgevingsbericht      per landgoed, de uitkomst van de ruimtelijke toets
--
-- Ophalen en geocoderen kost nu per bestuursorgaan in plaats van per landgoed.
-- Matchen is puur SQL tegen een GIST-index: milliseconden per landgoed.
--
-- Additief en idempotent. De bestaande omgevingsbericht-rijen blijven staan;
-- publicatie_id is optioneel.
-- ============================================================

set local search_path = public, extensions;

-- ------------------------------------------------------------
-- 1. De gedeelde publicatie
--
--    Bewust géén landgoed_id: dit is openbare overheidsinformatie die voor
--    elk landgoed hetzelfde is. Dat is precies waarom hij gedeeld kan worden.
-- ------------------------------------------------------------
create table if not exists omgevingspublicatie (
  id                uuid        primary key default gen_random_uuid(),
  -- dcterms:identifier, bv. "gmb-2026-371513". Uniek over het hele stelsel.
  externe_id        text        not null unique,
  bestuursorgaan    text        not null,
  organisatiecode   text,
  bestuurslaag      text,
  titel             text        not null,
  rubriek           text,
  bericht_datum     date,
  url               text,
  thema             text,

  -- Uitkomst van het geocoderen. Eén keer bepaald, voor alle landgoederen.
  geo_status        text        not null default 'geen_locatie'
                      check (geo_status in ('geplaatst', 'onplaatsbaar', 'geen_locatie')),
  punt_rd           extensions.geometry(Point, 28992),
  geo_niveau        integer,
  geo_weergavenaam  text,
  geo_zekerheid     numeric,
  geo_zoekterm      text,

  -- Termijn volgt uit besluitsoort en titel; rekenwerk, geen AI.
  termijn_soort     text,
  termijn_einddatum date,

  opgehaald_op      timestamptz not null default now()
);

create index if not exists omgevingspublicatie_punt_idx
  on omgevingspublicatie using gist (punt_rd);
create index if not exists omgevingspublicatie_orgaan_idx
  on omgevingspublicatie (bestuursorgaan, bericht_datum desc);
create index if not exists omgevingspublicatie_datum_idx
  on omgevingspublicatie (bericht_datum desc);

comment on table omgevingspublicatie is
  'Bekendmakingen zoals ze zijn gepubliceerd, één keer opgehaald en één keer '
  'geocodeerd, gedeeld door alle landgoederen. Bevat bewust geen landgoed_id: '
  'de publicatie is voor iedereen dezelfde. Wat per landgoed verschilt — raakt '
  'het mijn grond, hoe ver weg — staat in omgevingsbericht.';

-- ------------------------------------------------------------
-- 2. Het bericht verwijst naar de publicatie
-- ------------------------------------------------------------
alter table omgevingsbericht
  add column if not exists publicatie_id uuid references omgevingspublicatie(id) on delete cascade;

create index if not exists omgevingsbericht_publicatie_idx
  on omgevingsbericht (publicatie_id);

-- Eén bericht per landgoed per publicatie.
create unique index if not exists omgevingsbericht_landgoed_publicatie_idx
  on omgevingsbericht (landgoed_id, publicatie_id) where publicatie_id is not null;

-- ------------------------------------------------------------
-- 3. RLS
--
--    Publicaties zijn openbare overheidsinformatie: ieder ingelogd lid mag ze
--    lezen. Schrijven gebeurt alleen door de ophaalronde (service-role), die
--    RLS omzeilt — dus geen schrijf-policy.
-- ------------------------------------------------------------
alter table omgevingspublicatie enable row level security;

drop policy if exists "publicatie zien" on omgevingspublicatie;
create policy "publicatie zien" on omgevingspublicatie for select
  using (auth.role() = 'authenticated');

-- ------------------------------------------------------------
-- 4. Matchen: van gedeelde publicaties naar berichten voor één landgoed
--
--    Dit is wat vroeger per publicatie een HTTP-aanroep en drie RPC's kostte.
--    Nu één set-based query tegen een GIST-index.
--
--    Het invloedsgebied wordt één keer berekend, niet per rij — dat was de
--    andere reden dat de oude opzet traag was.
-- ------------------------------------------------------------
create or replace function omgeving_match_landgoed(
  p_landgoed_id uuid,
  p_sinds       date default null
)
returns table (nieuw integer, doorgelaten integer, weggefilterd integer)
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  mijn      extensions.geometry;
  v_nieuw   integer := 0;
  v_door    integer := 0;
  v_weg     integer := 0;
begin
  mijn := omgeving_invloedsgebied_vorm(p_landgoed_id);
  if mijn is null then
    -- Geen geometrie bekend: dan kan er niets gematcht worden, en dat is iets
    -- anders dan "niets gevonden".
    return query select 0, 0, 0;
    return;
  end if;

  with kandidaat as (
    select
      p.*,
      t.test        as thema_test,
      t.afstand_m   as thema_afstand,
      -- Een publicatie van een provincie of waterschap zonder eigen locatie
      -- geldt voor het hele gebied — en daar ligt dit landgoed in.
      (p.bestuurslaag in ('provincie', 'waterschap', 'rijk')
        and p.geo_status <> 'geplaatst')                         as overal_geldig
    from omgevingspublicatie p
    left join omgeving_thema t on t.code = p.thema and t.actief
    where (p_sinds is null or p.bericht_datum >= p_sinds)
      and not exists (
        select 1 from omgevingsbericht b
         where b.landgoed_id = p_landgoed_id and b.publicatie_id = p.id)
  ),
  beoordeeld as (
    select
      k.*,
      case
        when k.overal_geldig then 'omvat'
        when k.punt_rd is null then null
        when extensions.st_intersects(mijn, k.punt_rd) then 'overlap'
        when k.thema_test = 'nabijheid'
         and extensions.st_dwithin(mijn, k.punt_rd, k.thema_afstand) then 'nabij'
        else 'geen'
      end                                                        as relatie,
      -- De vangnetregel: iets wat we niet konden plaatsen maar waarvoor de
      -- zienswijzetermijn nog loopt, komt tóch door. Een gemiste zienswijze is
      -- onherstelbaar; een overbodig bericht is alleen irritant. Bewust smal —
      -- alleen zienswijzen, en alleen zolang de termijn loopt.
      -- coalesce, want zonder termijn is `termijn_soort = 'zienswijze'` NULL
      -- en niet false. In de case hieronder valt NULL toevallig de goede kant
      -- op, maar dat moet niemand hoeven narekenen.
      coalesce(
        k.geo_status <> 'geplaatst'
          and k.termijn_soort = 'zienswijze'
          and k.termijn_einddatum >= current_date,
        false)                                                   as vangnet,
      case when k.punt_rd is null then null
           else round(extensions.st_distance(mijn, k.punt_rd)::numeric, 1)
      end                                                        as afstand
    from kandidaat k
  ),
  ingevoegd as (
    insert into omgevingsbericht (
      landgoed_id, publicatie_id, externe_id, titel, url, bericht_datum,
      bestuursorgaan, thema, geo_niveau, geo_relatie, geo_status, afstand_m,
      termijn_soort, termijn_einddatum, motivering, status, weggefilterd_reden)
    select
      p_landgoed_id, b.id, b.externe_id, b.titel, b.url, b.bericht_datum,
      b.bestuursorgaan, b.thema,
      case when b.geo_status = 'geplaatst' then b.geo_niveau else 5 end,
      b.relatie, b.geo_status, b.afstand,
      b.termijn_soort, b.termijn_einddatum,
      case
        when b.overal_geldig
          then 'Geldt voor het hele gebied van ' || b.bestuursorgaan ||
               ' — daar ligt dit landgoed in.'
        when b.vangnet
          then 'Locatie onbekend, maar de zienswijzetermijn loopt nog — daarom '
               'toch getoond.'
        when b.geo_status = 'geplaatst'
          then coalesce(b.geo_weergavenaam, b.titel) ||
               ' (' || coalesce(b.geo_niveau::text, '?') || ')' ||
               case when b.afstand is not null
                    then ' — ' || b.afstand::text || ' m van het landgoed' else '' end
        when b.geo_status = 'onplaatsbaar'
          then 'Locatie "' || coalesce(b.geo_zoekterm, b.titel) || '" niet te plaatsen.'
        else 'Geen locatie in de tekst gevonden.'
      end,
      -- Doorlaten, of bewaren met de reden waarom niet?
      case when b.relatie in ('overlap', 'nabij', 'omvat') or b.vangnet
           then 'nieuw' else 'weggefilterd' end,
      case
        when b.relatie in ('overlap', 'nabij', 'omvat') or b.vangnet then null
        when b.geo_status = 'geplaatst' then 'te_ver'
        when b.geo_status = 'onplaatsbaar' then 'niet_te_plaatsen'
        else 'geen_locatie'
      end
    from beoordeeld b
    on conflict do nothing
    returning status
  )
  select
    count(*)::integer,
    count(*) filter (where status = 'nieuw')::integer,
    count(*) filter (where status = 'weggefilterd')::integer
  into v_nieuw, v_door, v_weg
  from ingevoegd;

  return query select v_nieuw, v_door, v_weg;
end;
$$;

comment on function omgeving_match_landgoed(uuid, date) is
  'Legt de gedeelde publicaties naast het invloedsgebied van één landgoed en '
  'maakt daar omgevingsbericht-rijen van. Vervangt de oude aanpak waarin elke '
  'publicatie per landgoed opnieuw werd opgehaald en geocodeerd.';

-- ------------------------------------------------------------
-- 5. Het geocodeerde punt vastleggen
--
--    De REST-laag kan geen PostGIS-waarde doorgeven; daarom deze ingang.
-- ------------------------------------------------------------
create or replace function omgevingspublicatie_zet_punt(
  p_externe_id text,
  p_x          double precision,
  p_y          double precision
)
returns void
language sql
volatile
set search_path = public, extensions
as $$
  update omgevingspublicatie
     set punt_rd = extensions.st_setsrid(extensions.st_makepoint(p_x, p_y), 28992)
   where externe_id = p_externe_id;
$$;
