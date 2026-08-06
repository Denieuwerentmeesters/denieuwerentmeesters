-- ============================================================
-- Contracten-keten plak 1: het contractdossier-fundament (issue #143)
--
-- Hugo module 6 (v0.2): het contract is de hoofdregistratie van een
-- dossier — met échte partijen (relaties, met rol) en échte objecten
-- (kadastrale percelen, beheerpercelen/gebouwen, gebruikseenheden).
-- De bestaande kiem (contract-tabel uit 0001) blijft en groeit mee;
-- het vrije partij-tekstveld blijft staan als transitie.
--
-- Puur additief + idempotent. Geen check-constraint op de bestaande
-- status-kolom (daar kan van alles in staan); de app bewaakt de
-- waarden. Prijsafspraken met historie volgen in plak 2.
-- ============================================================

alter table contract add column if not exists contractnummer text;
-- juridische pachtvorm (alleen bij type 'pacht'; de gebruiker legt vast,
-- het systeem velt geen juridisch oordeel — kernregel Hugo 6.2)
alter table contract add column if not exists pachtvorm text
  check (pachtvorm is null or pachtvorm in
    ('reguliere_pacht','geliberaliseerde_pacht','teeltpacht','natuurpacht','overig'));
alter table contract add column if not exists looptijd_type text
  check (looptijd_type is null or looptijd_type in ('bepaald','onbepaald'));

-- ------------------------------------------------------------
-- Partijen: wie zit er aan het contract (N:M met rol).
-- ------------------------------------------------------------
create table if not exists contract_partij (
  id            uuid        primary key default gen_random_uuid(),
  landgoed_id   uuid        not null references landgoed(id) on delete cascade,
  contract_id   uuid        not null references contract(id) on delete cascade,
  relatie_id    uuid        not null references relatie(id) on delete cascade,
  rol           text        not null default 'partij'
                  check (rol in ('verpachter','pachter','verhuurder','huurder','partij')),
  aangemaakt_op timestamptz not null default now(),
  unique (contract_id, relatie_id, rol)
);

create index if not exists contract_partij_landgoed_idx on contract_partij (landgoed_id);
create index if not exists contract_partij_contract_idx on contract_partij (contract_id);
create index if not exists contract_partij_relatie_idx  on contract_partij (relatie_id);

-- ------------------------------------------------------------
-- Objecten: waar rust het contract op. Polymorf (zoals verband):
-- 'kadastraal_perceel' → kadastraal_perceel.id (pacht rust juridisch
-- op kadastrale nummers), 'stamobject' → beheerperceel of gebouw,
-- 'gebruikseenheid' → verhuurbare eenheid binnen een gebouw (huur).
-- ------------------------------------------------------------
create table if not exists contract_object (
  id            uuid        primary key default gen_random_uuid(),
  landgoed_id   uuid        not null references landgoed(id) on delete cascade,
  contract_id   uuid        not null references contract(id) on delete cascade,
  object_type   text        not null
                  check (object_type in ('kadastraal_perceel','stamobject','gebruikseenheid')),
  object_id     uuid        not null,
  aangemaakt_op timestamptz not null default now(),
  unique (contract_id, object_type, object_id)
);

create index if not exists contract_object_landgoed_idx on contract_object (landgoed_id);
create index if not exists contract_object_contract_idx on contract_object (contract_id);
create index if not exists contract_object_object_idx   on contract_object (object_type, object_id);

-- ------------------------------------------------------------
-- RLS — zelfde model als contract (0001): leden lezen,
-- eigenaar/rentmeester schrijven.
-- ------------------------------------------------------------
alter table contract_partij enable row level security;
alter table contract_object enable row level security;

drop policy if exists "contractpartij zien"    on contract_partij;
drop policy if exists "contractpartij beheren" on contract_partij;
create policy "contractpartij zien" on contract_partij for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "contractpartij beheren" on contract_partij for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

drop policy if exists "contractobject zien"    on contract_object;
drop policy if exists "contractobject beheren" on contract_object;
create policy "contractobject zien" on contract_object for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "contractobject beheren" on contract_object for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());
