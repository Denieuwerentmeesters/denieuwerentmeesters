-- ============================================================
-- Landgoedplatform — Fase 0: Fundament
-- Bron: docs/technisch.md sectie 7 (v1.5)
-- Voer dit uit in de Supabase SQL-editor (of via supabase db push).
-- ============================================================

-- ------------------------------------------------------------
-- 7.2 Tabellen (eerst aangemaakt: de SQL-functies hieronder
--     verwijzen naar lidmaatschap en worden bij CREATE gevalideerd,
--     dus de tabellen moeten al bestaan)
-- ------------------------------------------------------------

create table profiel (
  id uuid primary key references auth.users(id) on delete cascade,
  naam text,
  email text,
  aangemaakt_op timestamptz default now()
);

create table landgoed (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  gemeente text,
  provincie text,
  hectare numeric,
  nsw_status text,
  eigendomsvorm text,
  beschrijving text,
  aangemaakt_op timestamptz default now()
);

create table lidmaatschap (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  gebruiker_id uuid not null references profiel(id) on delete cascade,
  rol text not null check (rol in ('admin','eigenaar','rentmeester','kijker')),
  aangemaakt_op timestamptz default now(),
  unique (landgoed_id, gebruiker_id)
);

create table module_instelling (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  module text not null,
  actief boolean not null default true,
  unique (landgoed_id, module)
);

create table document_type (
  id uuid primary key default gen_random_uuid(),
  naam text not null
);

create table document (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid references landgoed(id) on delete cascade,
  scope text not null default 'landgoed' check (scope in ('nationaal','landgoed')),
  titel text not null,
  bestand_pad text,
  type_id uuid references document_type(id),
  samenvatting text,
  geupload_door uuid references profiel(id),
  aangemaakt_op timestamptz default now()
);

create table perceel (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  kadastrale_gemeente text,
  sectie text,
  nummer text,
  oppervlakte numeric,
  gebruik text
);

create table object (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  naam text not null,
  type text,
  bouwjaar int,
  monument_status text,
  beschrijving text
);

create table relatie (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  naam text not null,
  type text,
  contact text
);

create table contract (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  titel text not null,
  type text,                      -- 'pacht','erfpacht','huur','beheer'
  partij text,
  bedrag numeric,
  ingangsdatum date,
  einddatum date,
  status text,
  indexatie_type text,
  indexatie_percentage numeric,
  laatste_indexatie date,
  volgende_indexatie date,
  servicekosten numeric,
  notitie text
);

create table subsidie (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid references landgoed(id) on delete cascade,
  scope text not null default 'landgoed' check (scope in ('nationaal','landgoed')),
  naam text not null,
  organisatie text,
  categorie text default 'subsidie'
    check (categorie in ('subsidie','carbon','groenblauw','regeling')),
  bedrag_indicatie text,
  status text,
  match_score int,
  redenering text,
  deadline date
);

create table taak (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  titel text not null,
  omschrijving text,
  prioriteit text,
  status text default 'open',
  deadline date,
  toegewezen_aan uuid references profiel(id)
);

create table agenda_item (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  titel text not null,
  datum date not null,
  tijd text,
  locatie text,
  categorie text
);

-- ------------------------------------------------------------
-- 7.1 Hulpfuncties (SECURITY DEFINER -> draaien buiten RLS,
--     daarom geen recursie op de lidmaatschap-policies)
-- ------------------------------------------------------------

create or replace function is_admin()
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from lidmaatschap
    where gebruiker_id = auth.uid()
      and rol = 'admin'
  );
$$;

create or replace function is_lid_van(doel_landgoed uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from lidmaatschap
    where gebruiker_id = auth.uid()
      and landgoed_id = doel_landgoed
  );
$$;

create or replace function rol_op(doel_landgoed uuid)
returns text
language sql security definer stable
set search_path = public
as $$
  select rol from lidmaatschap
  where gebruiker_id = auth.uid()
    and landgoed_id = doel_landgoed
  limit 1;
$$;

-- ------------------------------------------------------------
-- 7.3 Row Level Security aanzetten
-- ------------------------------------------------------------

alter table profiel            enable row level security;
alter table landgoed           enable row level security;
alter table lidmaatschap       enable row level security;
alter table module_instelling  enable row level security;
alter table document           enable row level security;
alter table document_type      enable row level security;
alter table perceel            enable row level security;
alter table object             enable row level security;
alter table relatie            enable row level security;
alter table contract           enable row level security;
alter table subsidie           enable row level security;
alter table taak               enable row level security;
alter table agenda_item        enable row level security;

-- ------------------------------------------------------------
-- 7.4 Policies
-- ------------------------------------------------------------

create policy "eigen profiel zien" on profiel for select
  using (id = auth.uid() or is_admin());
create policy "eigen profiel wijzigen" on profiel for update
  using (id = auth.uid());
create policy "eigen profiel aanmaken" on profiel for insert
  with check (id = auth.uid());

create policy "landgoed zien" on landgoed for select
  using (is_lid_van(id) or is_admin());
create policy "landgoed beheren" on landgoed for all
  using (is_admin()) with check (is_admin());

create policy "lidmaatschap zien" on lidmaatschap for select
  using (gebruiker_id = auth.uid() or is_lid_van(landgoed_id) or is_admin());
create policy "lidmaatschap beheren" on lidmaatschap for all
  using (is_admin() or rol_op(landgoed_id) = 'eigenaar')
  with check (is_admin() or rol_op(landgoed_id) = 'eigenaar');

create policy "modules zien" on module_instelling for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "modules beheren" on module_instelling for all
  using (is_admin() or rol_op(landgoed_id) = 'eigenaar')
  with check (is_admin() or rol_op(landgoed_id) = 'eigenaar');

create policy "document zien" on document for select
  using (scope = 'nationaal' or is_lid_van(landgoed_id) or is_admin());
create policy "document uploaden" on document for insert
  with check (
    (scope = 'nationaal' and is_admin())
    or (scope = 'landgoed' and (is_lid_van(landgoed_id) or is_admin()))
  );
create policy "document beheren" on document for update
  using (
    (scope = 'nationaal' and is_admin())
    or (scope = 'landgoed' and (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin()))
  );
create policy "document verwijderen" on document for delete
  using (
    (scope = 'nationaal' and is_admin())
    or (scope = 'landgoed' and (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin()))
  );

create policy "documenttype zien" on document_type for select using (true);
create policy "documenttype beheren" on document_type for all
  using (is_admin()) with check (is_admin());

create policy "perceel zien" on perceel for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "perceel beheren" on perceel for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

create policy "object zien" on object for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "object beheren" on object for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

create policy "relatie zien" on relatie for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "relatie beheren" on relatie for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

create policy "contract zien" on contract for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "contract beheren" on contract for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

create policy "subsidie zien" on subsidie for select
  using (scope = 'nationaal' or is_lid_van(landgoed_id) or is_admin());
create policy "subsidie beheren" on subsidie for all
  using (
    (scope = 'nationaal' and is_admin())
    or (scope = 'landgoed' and (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin()))
  )
  with check (
    (scope = 'nationaal' and is_admin())
    or (scope = 'landgoed' and (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin()))
  );

create policy "taak zien" on taak for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "taak beheren" on taak for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

create policy "agenda zien" on agenda_item for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "agenda beheren" on agenda_item for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

-- ------------------------------------------------------------
-- 7.5 Automatisch profiel aanmaken bij registratie
-- ------------------------------------------------------------

create or replace function handle_nieuwe_gebruiker()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into profiel (id, email, naam)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'naam', new.email));
  return new;
end;
$$;

create trigger op_nieuwe_gebruiker
  after insert on auth.users
  for each row execute function handle_nieuwe_gebruiker();

-- ------------------------------------------------------------
-- 7.6 Jezelf admin maken (NA registratie, los uitvoeren)
-- ------------------------------------------------------------
-- insert into landgoed (naam, beschrijving)
--   values ('Systeem', 'Technisch landgoed voor admin-rechten') returning id;
-- insert into lidmaatschap (landgoed_id, gebruiker_id, rol)
--   select '<<LANDGOED-ID>>', id, 'admin' from profiel where email = 'jouw@email.nl';
