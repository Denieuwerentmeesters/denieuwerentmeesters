-- ============================================================
-- Lek dichten: audio-opnames-bucket + RLS
-- De bucket 'audio-opnames' werd door de app gebruikt maar was
-- nergens in een migratie aangemaakt en had geen RLS-policies —
-- iedere ingelogde gebruiker kon zo bij audio van elk landgoed.
--
-- Zelfde pad-conventie als 0005: eerste mapsegment = landgoed_id.
--   {landgoed_id}/{gesprek_id}/...   (bestaande gesprekken)
--   {landgoed_id}/nieuw/...          (opname vóór het gesprek bestaat)
-- ============================================================

insert into storage.buckets (id, name, public)
values ('audio-opnames', 'audio-opnames', false)
on conflict (id) do nothing;

-- Idempotent: policies opnieuw opbouwen (ook als ze ooit handmatig zijn gezet).
drop policy if exists "audio zien" on storage.objects;
drop policy if exists "audio uploaden" on storage.objects;
drop policy if exists "audio wijzigen" on storage.objects;
drop policy if exists "audio verwijderen" on storage.objects;

create policy "audio zien" on storage.objects for select to authenticated
  using (
    bucket_id = 'audio-opnames'
    and is_lid_van(((storage.foldername(name))[1])::uuid)
  );

create policy "audio uploaden" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'audio-opnames'
    and rol_op(((storage.foldername(name))[1])::uuid) in ('eigenaar', 'rentmeester')
  );

create policy "audio wijzigen" on storage.objects for update to authenticated
  using (
    bucket_id = 'audio-opnames'
    and rol_op(((storage.foldername(name))[1])::uuid) in ('eigenaar', 'rentmeester')
  );

create policy "audio verwijderen" on storage.objects for delete to authenticated
  using (
    bucket_id = 'audio-opnames'
    and rol_op(((storage.foldername(name))[1])::uuid) in ('eigenaar', 'rentmeester')
  );
