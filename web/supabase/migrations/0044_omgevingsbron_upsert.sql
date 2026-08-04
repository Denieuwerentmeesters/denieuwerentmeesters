-- ============================================================
-- Fix: "Bronnen afleiden" faalde met 42P10
--
-- 0042 legde de uniciteit van een bron vast als expressie-index:
--
--   create unique index ... on omgevingsbron (landgoed_id, type, coalesce(organisatiecode, ''))
--
-- De server action doet een upsert met onConflict op de kolomnamen
-- (landgoed_id, type, organisatiecode). Postgres matcht een ON CONFLICT-lijst
-- alleen tegen een index op precies díe kolommen — een index op een expressie
-- telt niet mee. Resultaat: 42P10 "there is no unique or exclusion constraint
-- matching the ON CONFLICT specification", en de hele actie brak af.
--
-- De coalesce zat er om rijen zonder organisatiecode toch uniek te houden:
-- in een gewone unique index zijn twee NULLs niet gelijk aan elkaar, dus die
-- zouden ongemerkt dubbel kunnen komen. Dat probleem wordt hier opgelost bij
-- de bron in plaats van in de index: organisatiecode krijgt een default van ''
-- en wordt not null. Dan kan de index op gewone kolommen staan en matcht de
-- upsert wel.
--
-- Idempotent.
-- ============================================================

set local search_path = public, extensions;

-- Bestaande rijen zonder code gelijktrekken vóór de not-null.
update omgevingsbron set organisatiecode = '' where organisatiecode is null;

alter table omgevingsbron alter column organisatiecode set default '';
alter table omgevingsbron alter column organisatiecode set not null;

-- De expressie-index vervangen door een index op de kolommen zelf.
drop index if exists omgevingsbron_uniek_idx;
create unique index if not exists omgevingsbron_uniek_idx
  on omgevingsbron (landgoed_id, type, organisatiecode);

comment on column omgevingsbron.organisatiecode is
  'Officiele code van het bestuursorgaan (GM0687, provinciecode, '
  'waterbeheerdercode). Leeg voor bronnen zonder code — nooit NULL, want dan '
  'zou de unieke index dubbele rijen doorlaten en zou de upsert in '
  'leidBronnenAf niet matchen.';

-- ------------------------------------------------------------
-- Tweede fout van dezelfde soort: omgeving_run kreeg in 0042 alleen een
-- SELECT-policy, terwijl haalBerichtenOp er een rij in schrijft en die na
-- afloop bijwerkt met de trechtercijfers. Met RLS aan en geen INSERT/UPDATE
-- policy weigert Postgres dat, en dan breekt de hele ophaalronde af nog
-- voordat er één publicatie is opgehaald.
--
-- Schrijven mag door ieder lid van het landgoed: een ronde starten is geen
-- beheerhandeling, en de tabel bevat alleen tellingen.
-- ------------------------------------------------------------
drop policy if exists "omgeving run schrijven"  on omgeving_run;
drop policy if exists "omgeving run bijwerken"  on omgeving_run;

create policy "omgeving run schrijven" on omgeving_run for insert
  with check (is_lid_van(landgoed_id) or is_admin());

create policy "omgeving run bijwerken" on omgeving_run for update
  using (is_lid_van(landgoed_id) or is_admin())
  with check (is_lid_van(landgoed_id) or is_admin());
