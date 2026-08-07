-- Werkorders / Meldingen & klussen — fase 1, stap 3: meldlink zonder account.
-- Bron: "Claude plan en tech stack/Werkorders_Plan_v1_0.md" hfst 4, 7.1.
--
-- Een meldlink is per landgoed (niet per melding): elk landgoed krijgt een
-- unieke token. Een bezoeker zonder account heeft geen Supabase-sessie, dus
-- RLS (die op auth.uid() draait) kan de insert niet zelf bewaken. In plaats
-- van een publieke insert-policy op werkorder (die de tokencheck in de
-- policy-expressie zou moeten zetten, en zo de hele tabel voor de anon-rol
-- opent met de policy als enige rem) gebruiken we hetzelfde SECURITY DEFINER-
-- patroon als landgoed_aanmaken (0002): de functie valideert het token zelf
-- en insert dan pas, gecontroleerd en op één plek leesbaar.

alter table landgoed add column if not exists meld_token uuid not null default gen_random_uuid();
create unique index if not exists landgoed_meld_token_idx on landgoed (meld_token);

create or replace function meld_werkorder_publiek(
  p_token text,
  p_titel text,
  p_omschrijving text,
  p_melder_naam text,
  p_melder_email text
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  doel_landgoed uuid;
  nieuw_id uuid;
begin
  if coalesce(trim(p_titel), '') = '' then
    raise exception 'Titel is verplicht';
  end if;

  -- Vermijdt een lelijke cast-fout bij een geknoeid/onvolledig token: een
  -- niet-uuid-vormige waarde is per definitie geen geldige meldlink.
  if p_token !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Ongeldige meldlink';
  end if;

  select id into doel_landgoed from landgoed where meld_token = p_token::uuid;
  if doel_landgoed is null then
    raise exception 'Ongeldige meldlink';
  end if;

  insert into werkorder (
    landgoed_id, titel, omschrijving, status, melder_naam, melder_email
  ) values (
    doel_landgoed, trim(p_titel), nullif(trim(coalesce(p_omschrijving, '')), ''),
    'gemeld', nullif(trim(coalesce(p_melder_naam, '')), ''), nullif(trim(coalesce(p_melder_email, '')), '')
  ) returning id into nieuw_id;

  return nieuw_id;
end;
$$;

-- Geen "authenticated": deze functie moet juist bruikbaar zijn zonder sessie.
grant execute on function meld_werkorder_publiek(text, text, text, text, text) to anon, authenticated;

-- De meldpagina toont de naam van het landgoed ("Melding voor Ter Hooge"), maar
-- de landgoed-RLS staat lezen zonder lidmaatschap niet toe. Deze functie geeft
-- uitsluitend de naam terug bij een geldig token — geen andere velden, en niets
-- bij een onbekend token (zodat het token niet als landgoed-orakel bruikbaar is).
create or replace function landgoed_naam_voor_meldtoken(p_token text)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  gevonden text;
begin
  if p_token !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  select naam into gevonden from landgoed where meld_token = p_token::uuid;
  return gevonden;
end;
$$;

grant execute on function landgoed_naam_voor_meldtoken(text) to anon, authenticated;
