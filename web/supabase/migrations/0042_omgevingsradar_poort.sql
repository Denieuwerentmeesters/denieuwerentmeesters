-- ============================================================
-- Omgevingsradar fase 1: invloedsgebied, thema's en de ruimtelijke poort
--
-- Fase 0 (0041) gaf de radar een stelsel om in te rekenen. Deze migratie
-- geeft hem de vraag: welk deel van de omgeving telt, en vanaf welke afstand?
--
-- Drie stukken:
--   1. omgeving_thema        — de afstandstabel als data, niet als code
--   2. omgeving_invloedsgebied — de ringen die niet uit het kadaster komen
--   3. omgeving_poort()      — de ruimtelijke toets als SQL-functie
-- plus de velden op omgevingsbericht/omgevingsbron die de uitkomst dragen.
--
-- Puur additief en idempotent.
-- ============================================================

set local search_path = public, extensions;

-- ------------------------------------------------------------
-- 1. De afstandstabel als data
--
--    Afstand is geen instelling maar een eigenschap van het thema: een
--    windturbine hindert op 2 km, een bouwvergunning van de buurman op 150 m.
--    Deze getallen worden geijkt terwijl de module draait, dus ze horen in de
--    database en niet als constante in code.
--
--    Drie soorten toets, en "aangrenzend" is er géén van. ST_Touches faalt
--    twee kanten op: te streng (een zonnepark aan de overkant van de weg
--    deelt geen grens maar raakt je wel) en te ruim (één grens delen met een
--    perceel van 40 km zegt niets).
-- ------------------------------------------------------------
create table if not exists omgeving_thema (
  code           text        primary key,
  label          text        not null,
  -- overlap   = ligt op mijn grond          (ST_Intersects)
  -- nabijheid = ligt binnen X meter         (ST_DWithin)
  -- omvatting = ik lig erin                 (ST_Contains)
  test           text        not null check (test in ('overlap', 'nabijheid', 'omvatting')),
  afstand_m      integer,
  -- 1 = altijd tonen, 5 = alleen bij een sterke inhoudelijke match
  basis_urgentie integer     not null default 3 check (basis_urgentie between 1 and 5),
  toelichting    text,
  actief         boolean     not null default true,
  -- Alleen nabijheid heeft een afstand; overlap en omvatting per definitie niet.
  constraint omgeving_thema_afstand_past_bij_test check (
    (test = 'nabijheid' and afstand_m is not null and afstand_m > 0)
    or (test <> 'nabijheid' and afstand_m is null)
  )
);

comment on table omgeving_thema is
  'Afstandstabel van de omgevingsradar. Vastgelegd op 3 augustus 2026, voordat '
  'de eerste blinde toets op Ter Hooge is gedraaid — verschuiven na die toets '
  'hoort een zichtbare tweede ronde te zijn, geen stille bijstelling.';

insert into omgeving_thema (code, label, test, afstand_m, basis_urgentie, toelichting) values
  ('omgevingsplan',    'Omgevingsplan of verordening', 'overlap',   null, 1,
   'Raakt rechtstreeks wat er mag op de eigen grond.'),
  ('natuurbeheerplan', 'Natuurbeheerplan / SNL',       'overlap',   null, 1,
   'Een gewijzigd beheertype op eigen perceel is direct geld.'),
  ('monument',         'Monument of beschermd gezicht','overlap',   null, 2,
   'Aanwijzing of wijziging van status raakt vergunningplicht.'),
  ('bouwvergunning',   'Bouwvergunning buurman',       'nabijheid',  150, 3,
   'Klein van schaal; alleen vlak over de erfgrens relevant.'),
  ('kap_aanleg',       'Kap- en aanlegvergunning',     'nabijheid',  250, 3,
   'Raakt landschapsbeeld en houtopstanden.'),
  ('zonnepark',        'Zonnepark',                    'nabijheid',  500, 2,
   'Raakt uitzicht, waarde en soms grondpositie.'),
  ('kabeltrace',       'Hoogspanning of kabeltrace',   'nabijheid',  500, 2,
   'Langgerekt; de afstand geldt tot het trace, niet tot een punt.'),
  ('woningbouw',       'Woningbouw of bedrijventerrein','nabijheid', 750, 2,
   'Raakt ontsluiting, druk en waarde.'),
  ('infrastructuur',   'Weg en infrastructuur',        'nabijheid', 1000, 2,
   'Geluid en doorsnijding reiken ver.'),
  ('windturbine',      'Windturbine (hinder)',         'nabijheid', 2000, 2,
   'Slagschaduw en geluid.'),
  ('windturbine_zicht','Windturbine (zicht)',          'nabijheid', 5000, 3,
   'Grondgebonden is niet hetzelfde als zichtgebonden: een buitenplaats heeft '
   'een landschappelijke setting die verder reikt dan zijn kadastrale grens.'),
  ('peilbesluit',      'Peilbesluit of watergang',     'omvatting', null, 1,
   'Een peilbesluit stroomopwaarts raakt de vijvers; een buffer vindt dat nooit.'),
  ('stikstof_n2000',   'Stikstof en Natura 2000',      'omvatting', null, 1,
   'Depositierelatie, geen afstandsrelatie.'),
  ('gebiedsproces',    'Gebiedsproces of programma',   'omvatting', null, 2,
   'Zit ik aan tafel? De uitnodiging komt zelden rechtstreeks.')
on conflict (code) do nothing;

-- ------------------------------------------------------------
-- 2. Invloedsgebied — alleen de ringen die niet uit het kadaster komen
--
--    Ring 1 (eigendom) is kadastraal_perceel.geom_rd; die kopiëren we niet.
--    Ring 3 (nabijheid) is afgeleid: een buffer per thema, niet opgeslagen.
--    Hier staan ring 2 (belang) en ring 4 (invloedssfeer).
--
--    Ring 4 is de minst voor de hand liggende en vaak de belangrijkste, en
--    deels handwerk: de eigenaar weet beter dan een algoritme waar hij op
--    uitkijkt.
-- ------------------------------------------------------------
create table if not exists omgeving_invloedsgebied (
  id             uuid        primary key default gen_random_uuid(),
  landgoed_id    uuid        not null references landgoed(id) on delete cascade,
  ring           text        not null check (ring in ('belang', 'invloedssfeer')),
  naam           text        not null,
  geom_rd        extensions.geometry(MultiPolygon, 28992) not null,
  herkomst       text        not null default 'handmatig'
                   check (herkomst in ('handmatig', 'afgeleid')),
  -- Waar dit gebied vandaan komt als het is afgeleid: een contract, een
  -- peilvak, een N2000-gebied. Geen foreign key: het doel staat in
  -- wisselende tabellen.
  bron_soort     text,
  bron_id        uuid,
  toelichting    text,
  actief         boolean     not null default true,
  aangemaakt_op  timestamptz not null default now(),
  bijgewerkt_op  timestamptz not null default now()
);

create index if not exists omgeving_invloedsgebied_landgoed_idx
  on omgeving_invloedsgebied (landgoed_id);
create index if not exists omgeving_invloedsgebied_geom_idx
  on omgeving_invloedsgebied using gist (geom_rd);

comment on table omgeving_invloedsgebied is
  'Ringen 2 (belang) en 4 (invloedssfeer) van het invloedsgebied. Ring 1 komt '
  'uit kadastraal_perceel.geom_rd en wordt hier niet gedupliceerd; ring 3 '
  '(nabijheid) is een afgeleide buffer per thema en wordt niet opgeslagen.';

-- ------------------------------------------------------------
-- 3. Bronnen — afleidbaar per landgoed
--
--    De bestaande tabel kende alleen 'mail' en 'rss' en werd nergens gebruikt.
--    Een nieuw landgoed hoort geen bronconfiguratie te kosten: welke
--    bestuursorganen het raken volgt uit waar de percelen liggen.
-- ------------------------------------------------------------
alter table omgevingsbron add column if not exists soort             text;
alter table omgevingsbron add column if not exists herkomst          text not null default 'handmatig';
alter table omgevingsbron add column if not exists organisatiecode   text;
alter table omgevingsbron add column if not exists bestuurslaag      text;
alter table omgevingsbron add column if not exists configuratie      jsonb;
alter table omgevingsbron add column if not exists laatste_run_op    timestamptz;
alter table omgevingsbron add column if not exists laatste_run_status text;

-- De oude constraint liet alleen mail/rss toe. Verruimen, want de radar haalt
-- straks bij SRU en DSO op.
alter table omgevingsbron drop constraint if exists omgevingsbron_type_check;
alter table omgevingsbron add constraint omgevingsbron_type_check
  check (type in ('mail', 'rss', 'sru', 'dso', 'ibabs', 'notubiz', 'kaartlaag'));

alter table omgevingsbron drop constraint if exists omgevingsbron_herkomst_check;
alter table omgevingsbron add constraint omgevingsbron_herkomst_check
  check (herkomst in ('handmatig', 'afgeleid'));

alter table omgevingsbron drop constraint if exists omgevingsbron_bestuurslaag_check;
alter table omgevingsbron add constraint omgevingsbron_bestuurslaag_check
  check (bestuurslaag is null or bestuurslaag in
    ('gemeente', 'buurgemeente', 'provincie', 'waterschap', 'omgevingsdienst', 'rijk'));

-- Eén bron per organisatie per type per landgoed. Voorkomt dat een
-- herafleiding dubbele rijen aanmaakt.
create unique index if not exists omgevingsbron_uniek_idx
  on omgevingsbron (landgoed_id, type, coalesce(organisatiecode, ''));

comment on column omgevingsbron.herkomst is
  'afgeleid = door de radar bepaald uit de perceelgeometrie; handmatig = door '
  'de gebruiker toegevoegd of aangepast. Een herafleiding raakt handmatige '
  'rijen nooit aan — anders overschrijft de automaat stilzwijgend het oordeel '
  'van de eigenaar.';

-- ------------------------------------------------------------
-- 4. Berichten — de uitkomst van de poort dragen
-- ------------------------------------------------------------
alter table omgevingsbericht add column if not exists werkingsgebied  extensions.geometry(Geometry, 28992);
alter table omgevingsbericht add column if not exists geo_niveau      integer;
alter table omgevingsbericht add column if not exists geo_relatie     text;
alter table omgevingsbericht add column if not exists geo_status      text;
alter table omgevingsbericht add column if not exists afstand_m       numeric;
alter table omgevingsbericht add column if not exists geraakt_object_id uuid;
alter table omgevingsbericht add column if not exists termijn_soort   text;
alter table omgevingsbericht add column if not exists termijn_einddatum date;
alter table omgevingsbericht add column if not exists bestuursorgaan  text;
alter table omgevingsbericht add column if not exists externe_id      text;
alter table omgevingsbericht add column if not exists leidt_naar_regeling_id uuid;
alter table omgevingsbericht add column if not exists oordeel_gebruiker text;

alter table omgevingsbericht drop constraint if exists omgevingsbericht_geo_niveau_check;
alter table omgevingsbericht add constraint omgevingsbericht_geo_niveau_check
  check (geo_niveau is null or geo_niveau between 1 and 6);

alter table omgevingsbericht drop constraint if exists omgevingsbericht_geo_relatie_check;
alter table omgevingsbericht add constraint omgevingsbericht_geo_relatie_check
  check (geo_relatie is null or geo_relatie in ('overlap', 'nabij', 'omvat', 'geen'));

-- geo_status is de bak "niet te plaatsen" uit het moduleplan. Zonder dit veld
-- bestaat die bak alleen in proza en is hij niet op te vragen — dan is hij
-- precies zo onzichtbaar als stilzwijgend weggooien.
alter table omgevingsbericht drop constraint if exists omgevingsbericht_geo_status_check;
alter table omgevingsbericht add constraint omgevingsbericht_geo_status_check
  check (geo_status is null or geo_status in ('geplaatst', 'onplaatsbaar', 'geen_locatie'));

alter table omgevingsbericht drop constraint if exists omgevingsbericht_termijn_soort_check;
alter table omgevingsbericht add constraint omgevingsbericht_termijn_soort_check
  check (termijn_soort is null or termijn_soort in ('zienswijze', 'bezwaar', 'beroep', 'inspraak', 'geen'));

alter table omgevingsbericht drop constraint if exists omgevingsbericht_oordeel_check;
alter table omgevingsbericht add constraint omgevingsbericht_oordeel_check
  check (oordeel_gebruiker is null or oordeel_gebruiker in ('nuttig', 'overbodig'));

create index if not exists omgevingsbericht_werkingsgebied_idx
  on omgevingsbericht using gist (werkingsgebied);

-- Dedup op de externe identificatie van de bron: dezelfde bekendmaking mag
-- niet twee keer binnenkomen als de dagelijkse run overlapt.
create unique index if not exists omgevingsbericht_extern_uniek_idx
  on omgevingsbericht (landgoed_id, externe_id) where externe_id is not null;

create index if not exists omgevingsbericht_termijn_idx
  on omgevingsbericht (landgoed_id, termijn_einddatum)
  where termijn_einddatum is not null;

-- ------------------------------------------------------------
-- 5. Logboek per ophaalronde
--
--    Lijkt overbodig, is het niet: zonder trechtercijfers per run is niet
--    vast te stellen of het filter te streng of te ruim staat, en dan wordt
--    de drempel op gevoel gezet.
-- ------------------------------------------------------------
create table if not exists omgeving_run (
  id                uuid        primary key default gen_random_uuid(),
  landgoed_id       uuid        not null references landgoed(id) on delete cascade,
  bron_id           uuid        references omgevingsbron(id) on delete set null,
  gestart_op        timestamptz not null default now(),
  geeindigd_op      timestamptz,
  aantal_opgehaald  integer     not null default 0,
  aantal_door_poort integer     not null default 0,
  aantal_relevant   integer     not null default 0,
  aantal_onplaatsbaar integer   not null default 0,
  fout              text
);

create index if not exists omgeving_run_landgoed_idx on omgeving_run (landgoed_id, gestart_op desc);

comment on table omgeving_run is
  'Trechtercijfers per ophaalronde: opgehaald -> door de ruimtelijke poort -> '
  'relevant bevonden. Dit is de enige manier om te zien of het filter te streng '
  'staat. Let op: het meet alleen wat er binnenkwam — wat de radar nooit heeft '
  'gezien telt nergens mee, en daarvoor is een blinde steekproef nodig.';

-- ------------------------------------------------------------
-- 6. RLS — zelfde model als de rest van het platform
-- ------------------------------------------------------------
alter table omgeving_invloedsgebied enable row level security;
alter table omgeving_run            enable row level security;
alter table omgeving_thema          enable row level security;

drop policy if exists "invloedsgebied zien"    on omgeving_invloedsgebied;
drop policy if exists "invloedsgebied beheren" on omgeving_invloedsgebied;
create policy "invloedsgebied zien" on omgeving_invloedsgebied for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "invloedsgebied beheren" on omgeving_invloedsgebied for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

drop policy if exists "omgeving run zien" on omgeving_run;
create policy "omgeving run zien" on omgeving_run for select
  using (is_lid_van(landgoed_id) or is_admin());

-- De thema-tabel is een gedeelde catalogus zonder landgoed_id: iedere
-- ingelogde gebruiker mag hem lezen, niemand mag hem via de app wijzigen
-- (dat gaat via een migratie, zodat een ijking zichtbaar blijft).
drop policy if exists "thema zien" on omgeving_thema;
create policy "thema zien" on omgeving_thema for select
  using (auth.role() = 'authenticated');

-- ------------------------------------------------------------
-- 7. Het invloedsgebied als één vorm
--
--    Ter Hooge is één aaneengesloten cluster van 60,3 ha; de omhullende is
--    125 ha, ruim genoeg om als één gebied te behandelen. Splitsen per cluster
--    pas wanneer een landgoed met echt verspreide percelen zich aandient — en
--    dan meten in plaats van aannemen.
-- ------------------------------------------------------------
create or replace function omgeving_invloedsgebied_vorm(p_landgoed_id uuid)
returns extensions.geometry(MultiPolygon, 28992)
language sql
stable
set search_path = public, extensions
as $$
  select extensions.st_multi(extensions.st_union(vorm))
  from (
    select k.geom_rd as vorm
      from kadastraal_perceel k
     where k.landgoed_id = p_landgoed_id and k.geom_rd is not null
    union all
    select i.geom_rd
      from omgeving_invloedsgebied i
     where i.landgoed_id = p_landgoed_id and i.actief
  ) alles;
$$;

comment on function omgeving_invloedsgebied_vorm(uuid) is
  'Ring 1 (eigendom, uit het kadaster) plus ring 2 en 4 (uit '
  'omgeving_invloedsgebied), samengevoegd tot één vorm in RD.';

-- ------------------------------------------------------------
-- 8. De ruimtelijke poort
--
--    Geeft per landgoed terug óf een werkingsgebied raakt, hoe, en op welke
--    afstand. Drie toetsen in volgorde van hardheid: overlap gaat altijd voor
--    nabijheid, want "het ligt op mijn grond" is iets anders dan "het ligt
--    vlakbij".
--
--    Geen treffer -> relatie 'geen'. De aanroeper beslist wat daarmee gebeurt;
--    de vangnetregel (harde termijn + treffer op ring 1 of 2 komt altijd door,
--    ook onder de drempel) hoort in de laag erboven, niet hier.
-- ------------------------------------------------------------
create or replace function omgeving_poort(
  p_landgoed_id     uuid,
  p_werkingsgebied  extensions.geometry,
  p_thema           text default null
)
returns table (
  geo_relatie text,
  afstand_m   numeric,
  thema       text,
  urgentie    integer
)
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  mijn   extensions.geometry;
  gebied extensions.geometry;
  t      omgeving_thema%rowtype;
begin
  if p_werkingsgebied is null then
    return query select 'geen'::text, null::numeric, p_thema, null::integer;
    return;
  end if;

  -- Alles naar RD; een werkingsgebied uit een externe bron kan in 4326 of
  -- 3857 binnenkomen en dan zou ST_DWithin in graden rekenen.
  gebied := case
    when extensions.st_srid(p_werkingsgebied) = 28992 then p_werkingsgebied
    when extensions.st_srid(p_werkingsgebied) = 0
      then extensions.st_setsrid(p_werkingsgebied, 28992)
    else extensions.st_transform(p_werkingsgebied, 28992)
  end;

  mijn := omgeving_invloedsgebied_vorm(p_landgoed_id);
  if mijn is null then
    -- Geen enkele geometrie bekend: dan kan de poort niets zeggen, en dat is
    -- iets anders dan "raakt niet".
    return query select null::text, null::numeric, p_thema, null::integer;
    return;
  end if;

  select * into t from omgeving_thema where code = p_thema and actief;

  -- Omvatting eerst, en alleen voor thema's die zo werken. Een gebied dat mij
  -- omvat snijdt mij per definitie ook, dus als overlap eerder getoetst wordt
  -- is 'omvat' onbereikbaar en komt een peilbesluit over de hele polder terug
  -- als "ligt op uw grond". Dat is misleidend: bij omvatting is het gebied
  -- juist veel groter dan het landgoed.
  if t.test = 'omvatting' then
    if extensions.st_contains(gebied, mijn) then
      return query select 'omvat'::text, 0::numeric, p_thema,
                          coalesce(t.basis_urgentie, 2);
    elsif extensions.st_intersects(mijn, gebied) then
      -- Deels: een deel van het landgoed ligt in het peilvak/gebied. Nog
      -- steeds relevant, maar het is geen volledige omvatting.
      return query select 'overlap'::text, 0::numeric, p_thema,
                          coalesce(t.basis_urgentie, 2);
    else
      return query select 'geen'::text,
                          round(extensions.st_distance(mijn, gebied)::numeric, 1),
                          p_thema, null::integer;
    end if;
    return;
  end if;

  -- 1. Overlap — ligt op mijn grond. Altijd de zwaarste uitkomst.
  if extensions.st_intersects(mijn, gebied) then
    return query select 'overlap'::text, 0::numeric, p_thema,
                        coalesce(t.basis_urgentie, 1);
    return;
  end if;

  -- 2. Nabijheid — de buurman. "Aangrenzend" is hierin gewoon afstand 0; een
  --    bijzonder geval, niet het uitgangspunt.
  if t.test = 'nabijheid'
     and extensions.st_dwithin(mijn, gebied, t.afstand_m) then
    return query select 'nabij'::text,
                        round(extensions.st_distance(mijn, gebied)::numeric, 1),
                        p_thema,
                        coalesce(t.basis_urgentie, 3);
    return;
  end if;

  return query select 'geen'::text,
                      round(extensions.st_distance(mijn, gebied)::numeric, 1),
                      p_thema, null::integer;
end;
$$;

comment on function omgeving_poort(uuid, extensions.geometry, text) is
  'Ruimtelijke poort van de omgevingsradar. Toetst een werkingsgebied tegen het '
  'invloedsgebied van een landgoed en geeft relatie (overlap|omvat|nabij|geen), '
  'afstand in meters en urgentie terug. Rekent altijd in RD; een gebied in een '
  'ander stelsel wordt eerst getransformeerd. NULL als relatie betekent "geen '
  'geometrie bekend" en is iets anders dan "raakt niet".';
