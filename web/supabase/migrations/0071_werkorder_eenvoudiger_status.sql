-- Werkorders: terug naar drie statussen.
--
-- Het oorspronkelijke plan volgde Hugo's model met zes hoofdstatussen
-- (gemeld/beoordelen/toegewezen/in_uitvoering/wacht_op/klaar + geannuleerd).
-- In de praktijk bleek dat te veel: bij het testen kwam de vraag wat
-- "toewijzen" dan doet als je daarna nóg "start uitvoering" moet klikken, wat
-- "wacht op…" betekent, en waarom er een annuleerknop naast staat.
--
-- Wat er werkelijk nodig is: iemand meldt iets, degene die het oppakt
-- accepteert, en als het klaar is wordt de melding gesloten. Dus:
--
--   gemeld → geaccepteerd → afgerond
--
-- Het drempelbedrag-akkoord zat aan status 'wacht_op' vast; dat wordt een los
-- vinkje (wacht_op_akkoord). Dat is ook zuiverder: of er geld geaccordeerd moet
-- worden staat los van hoe ver het werk is.

-- 1. Nieuw vlaggetje voor het drempelbedrag-akkoord.
alter table werkorder add column if not exists wacht_op_akkoord boolean not null default false;

-- Bestaande "wacht op akkoord"-klussen behouden hun betekenis.
update werkorder set wacht_op_akkoord = true
 where status = 'wacht_op' and wacht_reden = 'akkoord vereist';

-- 2. Bestaande statussen omzetten. Eerst de constraint eraf, anders blokkeert
--    die de update zelf.
alter table werkorder drop constraint if exists werkorder_status_check;

update werkorder set status = case
  when status in ('gemeld', 'beoordelen', 'toegewezen', 'wacht_op') then 'gemeld'
  when status = 'in_uitvoering'                                     then 'geaccepteerd'
  when status in ('klaar', 'geannuleerd')                           then 'afgerond'
  else 'gemeld'
end;

alter table werkorder alter column status set default 'gemeld';
alter table werkorder add constraint werkorder_status_check
  check (status in ('gemeld', 'geaccepteerd', 'afgerond'));

-- 3. wacht_reden had alleen betekenis bij de vervallen status 'wacht_op'.
alter table werkorder drop column if exists wacht_reden;

-- 4. De externe uitvoerder werkt via de magic link: die accepteert en meldt
--    klaar. Statuslijst navenant ingekort.
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
         bijgewerkt_op = now()
   where id = doel;

  return true;
end;
$$;

revoke execute on function klus_status_bijwerken(text, text, text) from public;
grant execute on function klus_status_bijwerken(text, text, text) to anon, authenticated;
