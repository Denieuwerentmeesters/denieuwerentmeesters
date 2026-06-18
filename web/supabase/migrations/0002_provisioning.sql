-- ============================================================
-- Fase 0: zelfservice-provisioning
-- Laat een ingelogde gebruiker een eigen landgoed aanmaken en
-- zichzelf als eigenaar koppelen. SECURITY DEFINER omzeilt de
-- landgoed-RLS (die alleen admins insert toestaat) op een
-- gecontroleerde manier.
-- ============================================================

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

  -- Basis-modules meteen aan (zie plan: nieuw landgoed begint met de basis).
  insert into module_instelling (landgoed_id, module, actief) values
    (nieuw_id, 'dashboard',          true),
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
