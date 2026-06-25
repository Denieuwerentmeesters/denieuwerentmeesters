-- ============================================================
-- Contactenmodule (v1)
-- Uitbreiding van bestaande relatie-tabel + rol_type + contact_rol
-- ============================================================

-- ── 1. Bestaande relatie-tabel uitbreiden ──
alter table relatie
  add column if not exists organisatie       text,
  add column if not exists email             text,
  add column if not exists telefoon          text,
  add column if not exists verantwoordelijkheden text,
  add column if not exists omschrijving      text,
  add column if not exists status            text not null default 'actief'
                                             check (status in ('actief','latent','gearchiveerd')),
  add column if not exists bron              text,
  add column if not exists aangemaakt_op     timestamptz not null default now();

-- ── 2. rol_type ──
create table rol_type (
  id          uuid    primary key default gen_random_uuid(),
  naam        text    not null,
  groep       text    not null,
  koppelbaar_aan text[] not null default '{}',
  systeem     boolean not null default false,
  tenant_id   uuid    references landgoed(id) on delete cascade
);

-- ── 3. contact_rol (koppeltabel) ──
create table contact_rol (
  id           uuid primary key default gen_random_uuid(),
  contact_id   uuid not null references relatie(id) on delete cascade,
  rol_type_id  uuid not null references rol_type(id) on delete cascade,
  notitie      text,
  unique (contact_id, rol_type_id)
);

-- ── 4. RLS ──
alter table rol_type    enable row level security;
alter table contact_rol enable row level security;

-- rol_type: systeemrollen leesbaar voor iedereen, tenant-rollen alleen eigen landgoed
create policy "rol_type lezen"
  on rol_type for select
  using (systeem = true or tenant_id is null or is_lid_van(tenant_id) or is_admin());

create policy "rol_type aanmaken"
  on rol_type for insert
  with check (systeem = false and (is_lid_van(tenant_id) or is_admin()));

create policy "rol_type bewerken"
  on rol_type for update
  using (systeem = false and (is_lid_van(tenant_id) or is_admin()));

create policy "rol_type verwijderen"
  on rol_type for delete
  using (systeem = false and (is_lid_van(tenant_id) or is_admin()));

create policy "contact_rol lezen"
  on contact_rol for select
  using (
    exists (
      select 1 from relatie r
      where r.id = contact_rol.contact_id
        and (is_lid_van(r.landgoed_id) or is_admin())
    )
  );

create policy "contact_rol aanmaken"
  on contact_rol for insert
  with check (
    exists (
      select 1 from relatie r
      where r.id = contact_rol.contact_id
        and (is_lid_van(r.landgoed_id) or is_admin())
    )
  );

create policy "contact_rol bewerken"
  on contact_rol for update
  using (
    exists (
      select 1 from relatie r
      where r.id = contact_rol.contact_id
        and (is_lid_van(r.landgoed_id) or is_admin())
    )
  );

create policy "contact_rol verwijderen"
  on contact_rol for delete
  using (
    exists (
      select 1 from relatie r
      where r.id = contact_rol.contact_id
        and (is_lid_van(r.landgoed_id) or is_admin())
    )
  );

-- ── 5. Seed: standaard rol_types ──
insert into rol_type (naam, groep, koppelbaar_aan, systeem) values
  -- groep: relatie
  ('Bestuur',    'relatie', '{}',                  true),
  ('Familielid', 'relatie', '{}',                  true),
  ('Pachter',    'relatie', array['contract'],      true),
  ('Huurder',    'relatie', array['contract'],      true),
  -- groep: dienstverlener
  ('Rentmeester',           'dienstverlener', '{}',                   true),
  ('Beheerder / tuinman',   'dienstverlener', array['werkorder'],      true),
  ('Onderhoud',             'dienstverlener', array['werkorder'],      true),
  ('Specialist',            'dienstverlener', array['dossier'],        true),
  ('Vrijwilliger',          'dienstverlener', '{}',                   true),
  -- groep: instantie
  ('Gemeente / Provincie',  'instantie', array['vergunning','subsidie'], true);
