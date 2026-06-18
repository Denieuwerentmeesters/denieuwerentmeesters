-- ============================================================
-- Stamgegevens als AI-onboarding (v1)
-- - stamobject krijgt een "voorgesteld"-staat zodat AI objecten kan
--   voorstellen die de gebruiker accordeert (verband had die staat al).
-- - extractie_run: licht logboek per AI-extractie (traceerbaarheid in review-UI).
-- - 'stamgegevens' als basismodule in de provisioning-RPC.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Voorstel-staat op stamobject
-- ------------------------------------------------------------
alter table stamobject
  add column herkomst text not null default 'handmatig'
    check (herkomst in ('handmatig','ai'));
alter table stamobject add column voorstel_reden text;     -- AI-onderbouwing bij herkomst='ai'
alter table stamobject add column geaccordeerd boolean not null default true;  -- AI-voorstel = false
alter table stamobject add column bron_document_id uuid references document(id) on delete set null;

-- Review-query: alle nog te accorderen objecten per landgoed.
create index on stamobject (landgoed_id, geaccordeerd);

-- ------------------------------------------------------------
-- 2. Logboek van AI-extractieruns (welke bron, hoeveel voorstellen)
-- ------------------------------------------------------------
create table extractie_run (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  bron_soort text not null,        -- 'document' | 'transacties' | 'email'
  bron_id uuid,                    -- bv. document.id (null bij transacties/email-bulk)
  model text,
  aantal_objecten int not null default 0,
  aantal_koppelingen int not null default 0,
  fout text,                       -- gevuld als de extractie mislukte
  aangemaakt_door uuid references profiel(id),
  aangemaakt_op timestamptz default now()
);
create index on extractie_run (landgoed_id, aangemaakt_op desc);

alter table extractie_run enable row level security;
create policy "extractie_run zien" on extractie_run for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "extractie_run beheren" on extractie_run for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

-- ------------------------------------------------------------
-- 3. 'stamgegevens' als basismodule bij provisioning
--    (create or replace: voegt de module-vlag toe voor nieuwe landgoederen)
-- ------------------------------------------------------------
create or replace function landgoed_aanmaken(p_naam text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  nieuw_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;
  if coalesce(trim(p_naam), '') = '' then
    raise exception 'Naam is verplicht';
  end if;

  insert into landgoed (naam) values (trim(p_naam)) returning id into nieuw_id;

  insert into lidmaatschap (landgoed_id, gebruiker_id, rol)
    values (nieuw_id, auth.uid(), 'eigenaar');

  insert into module_instelling (landgoed_id, module, actief) values
    (nieuw_id, 'dashboard',          true),
    (nieuw_id, 'stamgegevens',       true),
    (nieuw_id, 'documenten',         true),
    (nieuw_id, 'taken',              true),
    (nieuw_id, 'contacten',          true),
    (nieuw_id, 'contracten',         true),
    (nieuw_id, 'subsidieradar',      true),
    (nieuw_id, 'omgevingsradar',     true),
    (nieuw_id, 'financieel_inzicht', true),
    (nieuw_id, 'incidenten',         true),
    (nieuw_id, 'vergaderingen',      true);

  return nieuw_id;
end;
$$;

grant execute on function landgoed_aanmaken(text) to authenticated;

-- Bestaande landgoederen ook de module-vlag geven (idempotent).
insert into module_instelling (landgoed_id, module, actief)
select id, 'stamgegevens', true from landgoed
on conflict (landgoed_id, module) do nothing;
