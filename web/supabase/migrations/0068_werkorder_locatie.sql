-- Werkorders: locatie bij een melding.
--
-- Mobiel is dit het belangrijkst: je staat bij het kapotte hek en wilt niet
-- eerst het juiste object opzoeken. Twee vormen, allebei optioneel en naast
-- elkaar bruikbaar:
--   * locatie_omschrijving — vrije tekst ("achter de schuur, bij de derde paal")
--   * punt_rd              — een GPS-punt van het toestel
--
-- SRID: het toestel levert WGS84 (4326), maar dit project rekent in RD (28992)
-- omdat afstanden in 3857 stelselmatig verkeerd uitvallen (zie 0041 en
-- tests/geo-srid.test.ts). Daarom transformeren bij het wegschrijven, net als
-- omgevingspublicatie.punt_rd (0049). Zo kunnen klussen later zonder correctie
-- op de kaart en in nabijheidsvragen mee.

alter table werkorder add column if not exists locatie_omschrijving text;
alter table werkorder add column if not exists punt_rd extensions.geometry(Point, 28992);
-- De ruwe meting van het toestel blijft ook staan: PostGIS-geometrie komt niet
-- bruikbaar terug via PostgREST, en de brongegevens bewaren is sowieso zuiverder
-- dan terugrekenen uit een transformatie. punt_rd is de afgeleide kolom.
alter table werkorder add column if not exists lat double precision;
alter table werkorder add column if not exists lon double precision;

create index if not exists werkorder_punt_rd_idx on werkorder using gist (punt_rd);

-- Zet een GPS-punt (WGS84 van het toestel) op een werkorder. Als functie omdat
-- PostgREST zelf geen geometrie kan schrijven, en zo staat de transformatie op
-- één plek in plaats van verspreid over aanroepers.
create or replace function werkorder_punt_zetten(
  p_werkorder_id uuid,
  p_lat double precision,
  p_lon double precision
)
returns void
language plpgsql security invoker  -- RLS op werkorder blijft gewoon gelden
set search_path = public
as $$
begin
  if p_lat is null or p_lon is null then
    update werkorder set punt_rd = null, lat = null, lon = null where id = p_werkorder_id;
    return;
  end if;
  -- Buiten Nederland heeft RD geen betekenis; dan liever niets dan een
  -- getransformeerd punt dat nergens op slaat.
  if p_lat < 50 or p_lat > 54 or p_lon < 3 or p_lon > 8 then
    return;
  end if;
  update werkorder
     set lat = p_lat,
         lon = p_lon,
         punt_rd = extensions.st_transform(
           extensions.st_setsrid(extensions.st_makepoint(p_lon, p_lat), 4326), 28992)
   where id = p_werkorder_id;
end;
$$;

revoke execute on function werkorder_punt_zetten(uuid, double precision, double precision) from public;
grant execute on function werkorder_punt_zetten(uuid, double precision, double precision) to authenticated;

-- De publieke meldlink krijgt locatie mee. Oude signatuur eerst weg: anders
-- ontstaat een overload en blijft de parameterloze variant bestaan.
drop function if exists meld_werkorder_publiek(text, text, text, text, text);

create or replace function meld_werkorder_publiek(
  p_token text,
  p_titel text,
  p_omschrijving text,
  p_melder_naam text,
  p_melder_email text,
  p_locatie text default null,
  p_lat double precision default null,
  p_lon double precision default null
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  doel_landgoed uuid;
  nieuw_id uuid;
begin
  if coalesce(trim(p_titel), '') = '' then
    raise exception 'Titel is verplicht';
  end if;
  if p_token !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Ongeldige meldlink';
  end if;

  select id into doel_landgoed from landgoed where meld_token = p_token::uuid;
  if doel_landgoed is null then
    raise exception 'Ongeldige meldlink';
  end if;

  insert into werkorder (
    landgoed_id, titel, omschrijving, status, melder_naam, melder_email,
    locatie_omschrijving,
    lat, lon,
    punt_rd
  ) values (
    doel_landgoed, trim(p_titel), nullif(trim(coalesce(p_omschrijving, '')), ''),
    'gemeld', nullif(trim(coalesce(p_melder_naam, '')), ''), nullif(trim(coalesce(p_melder_email, '')), ''),
    nullif(trim(coalesce(p_locatie, '')), ''),
    case when p_lat between 50 and 54 and p_lon between 3 and 8 then p_lat else null end,
    case when p_lat between 50 and 54 and p_lon between 3 and 8 then p_lon else null end,
    case
      when p_lat is null or p_lon is null then null
      when p_lat < 50 or p_lat > 54 or p_lon < 3 or p_lon > 8 then null
      else extensions.st_transform(
             extensions.st_setsrid(extensions.st_makepoint(p_lon, p_lat), 4326), 28992)
    end
  ) returning id into nieuw_id;

  return nieuw_id;
end;
$$;

grant execute on function meld_werkorder_publiek(text, text, text, text, text, text, double precision, double precision) to anon, authenticated;

-- De uitvoerder staat straks ter plekke: die heeft de locatie het hardst nodig.
-- Signatuur uitgebreid, dus eerst de oude weg (anders een overload).
drop function if exists klus_ophalen(text);

create or replace function klus_ophalen(p_token text)
returns table (
  titel text,
  omschrijving text,
  status text,
  deadline date,
  prioriteit text,
  fotos_voor text[],
  locatie_omschrijving text,
  lat double precision,
  lon double precision
)
language plpgsql security definer
set search_path = public
as $$
declare
  doel uuid;
begin
  doel := klus_werkorder_voor_token(p_token);
  if doel is null then
    return;
  end if;
  return query
    select w.titel, w.omschrijving, w.status, w.deadline, w.prioriteit, w.fotos_voor,
           w.locatie_omschrijving, w.lat, w.lon
      from werkorder w where w.id = doel;
end;
$$;

revoke execute on function klus_ophalen(text) from public;
grant execute on function klus_ophalen(text) to anon, authenticated;
