-- Werkorders / Meldingen & klussen — fase 1, stap 4: magic link externe uitvoerder.
-- Bron: "Claude plan en tech stack/Werkorders_Plan_v1_0.md" hfst 6.2.
--
-- Een externe uitvoerder (aannemer, hovenier, installateur) krijgt per klus één
-- link zonder account: hij ziet wat er moet gebeuren, zet status + opmerking,
-- en kan een nieuw punt melden. Net als bij de meldlink (0065) is er geen
-- Supabase-sessie, dus RLS kan dit niet bewaken; de SECURITY DEFINER-functies
-- hieronder valideren het token zelf. Bewust géén service-role client: die zou
-- ALLE RLS omzeilen, terwijl deze functies precies doen wat nodig is en niet meer.

create table if not exists werkorder_toegangstoken (
  id            uuid primary key default gen_random_uuid(),
  werkorder_id  uuid not null references werkorder(id) on delete cascade,
  token         uuid not null unique default gen_random_uuid(),
  verloopt_op   timestamptz not null default (now() + interval '90 days'),
  aangemaakt_op timestamptz not null default now()
);

create index if not exists werkorder_toegangstoken_werkorder_idx
  on werkorder_toegangstoken (werkorder_id);

alter table werkorder_toegangstoken enable row level security;

-- Alleen eigenaar/rentmeester mag tokens zien én aanmaken. Bewust NIET het
-- gebruikelijke "select voor elk lid": een token is geen identifier maar een
-- bearer-credential — wie 'm kan lezen, kan er (uitgelogd, via de anon-key) de
-- klus mee bijwerken. Een kijker mag werkorders niet wijzigen, dus mag de
-- tokens ook niet lezen. De "beheren"-policy hieronder is `for all` en dekt
-- select voor die rollen al af; een aparte select-policy is daarom niet nodig.
drop policy if exists "werkorder-token zien" on werkorder_toegangstoken;

drop policy if exists "werkorder-token beheren" on werkorder_toegangstoken;
create policy "werkorder-token beheren" on werkorder_toegangstoken for all
  using (exists (
    select 1 from werkorder w
    where w.id = werkorder_id
      and (rol_op(w.landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  ))
  with check (exists (
    select 1 from werkorder w
    where w.id = werkorder_id
      and (rol_op(w.landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  ));

-- ── Hulp: token → werkorder_id, of null bij ongeldig/verlopen ──
create or replace function klus_werkorder_voor_token(p_token text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  gevonden uuid;
begin
  if p_token !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  select t.werkorder_id into gevonden
    from werkorder_toegangstoken t
   where t.token = p_token::uuid
     and t.verloopt_op > now();
  return gevonden;
end;
$$;

-- ── De klus tonen: alleen wat de uitvoerder nodig heeft ──
-- Bewust NIET: kosten, melder-gegevens, AI-voorstel, of andere werkorders van
-- hetzelfde landgoed. Eén token geeft zicht op precies één klus.
create or replace function klus_ophalen(p_token text)
returns table (
  titel text,
  omschrijving text,
  status text,
  deadline date,
  prioriteit text,
  fotos_voor text[]
)
language plpgsql security definer
set search_path = public
as $$
declare
  doel uuid;
begin
  doel := klus_werkorder_voor_token(p_token);
  if doel is null then
    return;
  end if;
  return query
    select w.titel, w.omschrijving, w.status, w.deadline, w.prioriteit, w.fotos_voor
      from werkorder w where w.id = doel;
end;
$$;

-- ── Status bijwerken door de uitvoerder ──
-- Alleen de statussen die bij uitvoeren horen. Een uitvoerder mag een klus niet
-- terugzetten naar 'gemeld'/'beoordelen' of 'geannuleerd' — dat is aan de beheerder.
create or replace function klus_status_bijwerken(
  p_token text,
  p_status text,
  p_wacht_reden text
)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  doel uuid;
begin
  doel := klus_werkorder_voor_token(p_token);
  if doel is null then
    raise exception 'Ongeldige of verlopen link';
  end if;
  if p_status not in ('in_uitvoering', 'wacht_op', 'klaar') then
    raise exception 'Deze status kan niet via de klus-link gezet worden';
  end if;

  update werkorder
     set status = p_status,
         wacht_reden = case when p_status = 'wacht_op'
                            then nullif(trim(coalesce(p_wacht_reden, '')), '')
                            else null end,
         bijgewerkt_op = now()
   where id = doel;

  return true;
end;
$$;

-- ── "Nieuw punt melden" vanaf de klus-pagina ──
-- Het landgoed_id komt uit de bestaande werkorder achter het token, nooit uit
-- clientinvoer. Nieuwe melding start op 'gemeld' en gaat dus door de gewone triage.
create or replace function klus_nieuw_punt_melden(
  p_token text,
  p_titel text,
  p_omschrijving text
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  doel uuid;
  doel_landgoed uuid;
  nieuw_id uuid;
begin
  doel := klus_werkorder_voor_token(p_token);
  if doel is null then
    raise exception 'Ongeldige of verlopen link';
  end if;
  if coalesce(trim(p_titel), '') = '' then
    raise exception 'Titel is verplicht';
  end if;

  select landgoed_id into doel_landgoed from werkorder where id = doel;

  insert into werkorder (landgoed_id, titel, omschrijving, status)
  values (doel_landgoed, trim(p_titel),
          nullif(trim(coalesce(p_omschrijving, '')), ''), 'gemeld')
  returning id into nieuw_id;

  return nieuw_id;
end;
$$;

-- Postgres geeft EXECUTE op nieuwe functies standaard aan PUBLIC; daarom eerst
-- intrekken en dan gericht toekennen, anders is "niet granten" een lege belofte.
revoke execute on function klus_werkorder_voor_token(text)          from public;
revoke execute on function klus_ophalen(text)                       from public;
revoke execute on function klus_status_bijwerken(text, text, text)  from public;
revoke execute on function klus_nieuw_punt_melden(text, text, text) from public;

grant execute on function klus_ophalen(text)                        to anon, authenticated;
grant execute on function klus_status_bijwerken(text, text, text)   to anon, authenticated;
grant execute on function klus_nieuw_punt_melden(text, text, text)  to anon, authenticated;
-- klus_werkorder_voor_token blijft interne hulpfunctie: geen grant. De drie
-- functies hierboven roepen 'm aan als definer en mogen dat wél.
