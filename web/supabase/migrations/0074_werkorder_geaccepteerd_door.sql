-- Vastleggen wie een melding heeft geaccepteerd.
--
-- Tot nu toe legden we alleen het geld-akkoord vast (akkoord_door/akkoord_op,
-- migratie 0073) en dat verschijnt uitsluitend boven het drempelbedrag. De
-- vraag "wie heeft dit opgepakt?" staat daar los van: die wil je bij élke
-- melding kunnen zien, ongeacht het bedrag of het onderwerp.
--
-- Let op het verschil met toegewezen_aan: toewijzen doet de beheerder ("jij
-- gaat dit doen"), accepteren doet de uitvoerder zelf ("ik pak dit op"). Beide
-- zijn interessant en kunnen verschillen.
--
-- Accepteren via de magic link gebeurt zonder ingelogde gebruiker; daar blijft
-- geaccepteerd_door leeg en vult alleen geaccepteerd_op. De naam volgt dan uit
-- de uitvoerder die aan de klus hangt.

alter table werkorder add column if not exists geaccepteerd_door uuid references profiel(id);
alter table werkorder add column if not exists geaccepteerd_op timestamptz;

-- De klus-link zet de status zonder sessie: dan alleen het moment vastleggen.
create or replace function klus_status_bijwerken(
  p_token text,
  p_status text,
  p_wacht_reden text default null   -- niet meer in gebruik; blijft in de
                                    -- signatuur zodat oude aanroepen niet breken
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
  if p_status not in ('geaccepteerd', 'afgerond') then
    raise exception 'Deze status kan niet via de klus-link gezet worden';
  end if;

  update werkorder
     set status = p_status,
         geaccepteerd_op = case
           when p_status = 'geaccepteerd' and geaccepteerd_op is null then now()
           else geaccepteerd_op
         end,
         bijgewerkt_op = now()
   where id = doel;

  return true;
end;
$$;

revoke execute on function klus_status_bijwerken(text, text, text) from public;
grant execute on function klus_status_bijwerken(text, text, text) to anon, authenticated;
