-- 0035 — Deelnemers die de AI uit het transcript herkent.
--
-- De AI mag deelnemers voorstellen, maar een voorstel is geen feit: `bevestigd` blijft
-- false tot een mens erop klikt. Handmatig toegevoegde deelnemers staan meteen op
-- herkomst 'handmatig' + bevestigd true.
--
-- Idempotent: add column if not exists.

alter table gesprek_deelnemer
  add column if not exists herkomst text not null default 'handmatig';

alter table gesprek_deelnemer
  add column if not exists bevestigd boolean not null default true;

alter table gesprek_deelnemer
  add column if not exists bron_citaat text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'gesprek_deelnemer_herkomst_check'
  ) then
    alter table gesprek_deelnemer
      add constraint gesprek_deelnemer_herkomst_check
      check (herkomst in ('ai', 'handmatig'));
  end if;
end $$;
