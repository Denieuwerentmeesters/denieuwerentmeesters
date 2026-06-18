-- ============================================================
-- Fase 1B/1C: financieel, omgevingsradar, vergaderingen
-- (datamodel uit docs/technisch.md Deel III)
-- ============================================================

-- ===== FINANCIEEL =====
create table financiele_bron (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  type text not null check (type in ('bank_import','moneybird','exact','eboekhouden','bank_aggregator','handmatig')),
  naam text,
  externe_referentie text,
  laatst_gesynct timestamptz,
  actief boolean default true,
  aangemaakt_op timestamptz default now()
);

create table transactie (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  bron_id uuid references financiele_bron(id) on delete set null,
  datum date not null,
  bedrag numeric not null,
  omschrijving text,
  tegenpartij text,
  categorie text,
  richting text generated always as (case when bedrag >= 0 then 'in' else 'uit' end) stored,
  perceel_id uuid references perceel(id) on delete set null,
  object_id uuid references object(id) on delete set null,
  contract_id uuid references contract(id) on delete set null,
  extern_id text,
  aangemaakt_op timestamptz default now(),
  unique (bron_id, extern_id)
);

-- ===== OMGEVINGSRADAR =====
create table omgevingsbron (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  type text not null check (type in ('mail','rss')),
  naam text,
  adres text,
  actief boolean default true,
  aangemaakt_op timestamptz default now()
);

create table omgeving_profiel (
  landgoed_id uuid primary key references landgoed(id) on delete cascade,
  provincie text,
  gemeenten text[],
  themas text[],
  trefwoorden text[],
  drempel int default 60
);

create table omgevingsbericht (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  bron_id uuid references omgevingsbron(id) on delete set null,
  titel text,
  samenvatting text,
  originele_tekst text,
  url text,
  bericht_datum date,
  relevantie_score int,
  relevant boolean,
  motivering text,
  thema text,
  status text default 'nieuw' check (status in ('nieuw','gezien','gearchiveerd','omgezet')),
  agenda_item_id uuid references agenda_item(id) on delete set null,
  taak_id uuid references taak(id) on delete set null,
  aangemaakt_op timestamptz default now()
);

-- ===== VERGADERINGEN =====
create table vergadering (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  titel text not null,
  datum date not null default current_date,
  audio_pad text,
  transcript text,
  notulen text,
  samenvatting text,
  status text default 'opgenomen' check (status in ('opgenomen','getranscribeerd','verwerkt')),
  aangemaakt_door uuid references profiel(id),
  aangemaakt_op timestamptz default now()
);

create table vergadering_deelnemer (
  id uuid primary key default gen_random_uuid(),
  vergadering_id uuid not null references vergadering(id) on delete cascade,
  gebruiker_id uuid references profiel(id),
  externe_naam text,
  spreker_label text
);

create table vergadering_besluit (
  id uuid primary key default gen_random_uuid(),
  vergadering_id uuid not null references vergadering(id) on delete cascade,
  tekst text not null
);

alter table taak add column vergadering_id uuid references vergadering(id) on delete set null;

-- ===== RLS =====
alter table financiele_bron        enable row level security;
alter table transactie             enable row level security;
alter table omgevingsbron          enable row level security;
alter table omgeving_profiel       enable row level security;
alter table omgevingsbericht       enable row level security;
alter table vergadering            enable row level security;
alter table vergadering_deelnemer  enable row level security;
alter table vergadering_besluit    enable row level security;

create policy "fin bron zien" on financiele_bron for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "fin bron beheren" on financiele_bron for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

create policy "transactie zien" on transactie for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "transactie beheren" on transactie for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

create policy "omg bron zien" on omgevingsbron for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "omg bron beheren" on omgevingsbron for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

create policy "omg profiel zien" on omgeving_profiel for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "omg profiel beheren" on omgeving_profiel for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

create policy "omg bericht zien" on omgevingsbericht for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "omg bericht beheren" on omgevingsbericht for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

create policy "vergadering zien" on vergadering for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "vergadering beheren" on vergadering for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

create policy "verg deelnemer zien" on vergadering_deelnemer for select
  using (exists (select 1 from vergadering v where v.id = vergadering_id and (is_lid_van(v.landgoed_id) or is_admin())));
create policy "verg deelnemer beheren" on vergadering_deelnemer for all
  using (exists (select 1 from vergadering v where v.id = vergadering_id and (rol_op(v.landgoed_id) in ('eigenaar','rentmeester') or is_admin())))
  with check (exists (select 1 from vergadering v where v.id = vergadering_id and (rol_op(v.landgoed_id) in ('eigenaar','rentmeester') or is_admin())));

create policy "verg besluit zien" on vergadering_besluit for select
  using (exists (select 1 from vergadering v where v.id = vergadering_id and (is_lid_van(v.landgoed_id) or is_admin())));
create policy "verg besluit beheren" on vergadering_besluit for all
  using (exists (select 1 from vergadering v where v.id = vergadering_id and (rol_op(v.landgoed_id) in ('eigenaar','rentmeester') or is_admin())))
  with check (exists (select 1 from vergadering v where v.id = vergadering_id and (rol_op(v.landgoed_id) in ('eigenaar','rentmeester') or is_admin())));
