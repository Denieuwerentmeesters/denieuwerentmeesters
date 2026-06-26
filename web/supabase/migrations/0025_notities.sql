-- ============================================================
-- Notities — losse tekst per taak of agendapunt, met auteur
-- ============================================================

create table notitie (
  id            uuid        primary key default gen_random_uuid(),
  object_type   text        not null check (object_type in ('taak', 'agenda_item')),
  object_id     uuid        not null,
  landgoed_id   uuid        not null references landgoed(id) on delete cascade,
  tekst         text        not null,
  geschreven_door uuid      references profiel(id) on delete set null,
  aangemaakt_op timestamptz not null default now()
);

alter table notitie enable row level security;

create policy "notitie lezen"
  on notitie for select
  using (is_lid_van(landgoed_id) or is_admin());

create policy "notitie aanmaken"
  on notitie for insert
  with check (is_lid_van(landgoed_id) or is_admin());

create policy "notitie verwijderen"
  on notitie for delete
  using (geschreven_door = auth.uid() or is_admin());

create index notitie_object_idx on notitie (object_type, object_id);
