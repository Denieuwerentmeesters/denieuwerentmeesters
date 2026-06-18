-- ============================================================
-- Fase 1B: Storage-buckets + RLS
-- Pad-conventie: eerste mapsegment = landgoed_id.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('documenten','documenten', false), ('vergaderingen','vergaderingen', false)
on conflict (id) do nothing;

create policy "opslag zien" on storage.objects for select to authenticated
  using (
    bucket_id in ('documenten','vergaderingen')
    and is_lid_van(((storage.foldername(name))[1])::uuid)
  );

create policy "opslag uploaden" on storage.objects for insert to authenticated
  with check (
    bucket_id in ('documenten','vergaderingen')
    and rol_op(((storage.foldername(name))[1])::uuid) in ('eigenaar','rentmeester')
  );

create policy "opslag wijzigen" on storage.objects for update to authenticated
  using (
    bucket_id in ('documenten','vergaderingen')
    and rol_op(((storage.foldername(name))[1])::uuid) in ('eigenaar','rentmeester')
  );

create policy "opslag verwijderen" on storage.objects for delete to authenticated
  using (
    bucket_id in ('documenten','vergaderingen')
    and rol_op(((storage.foldername(name))[1])::uuid) in ('eigenaar','rentmeester')
  );
