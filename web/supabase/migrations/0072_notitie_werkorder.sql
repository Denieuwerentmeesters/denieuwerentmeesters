-- Notities op een werkorder toestaan.
--
-- De check op notitie.object_type stond nog op de twee soorten uit het
-- fundament ('taak', 'agenda_item'). De werkorder-detailpagina schrijft haar
-- tijdlijn óók naar deze tabel, dus een notitie op een melding liep tegen de
-- constraint aan: het formulier gaf "Er ging iets mis".
--
-- Stiller en vervelender: werkorderAkkoordGeven legt het akkoord op een uitgave
-- boven het drempelbedrag als notitie vast, maar controleerde de fout niet. Dat
-- akkoord werd dus nooit geschreven zonder dat iemand het merkte — precies de
-- verantwoording die je bij geld wél wilt kunnen terugvinden. De ontbrekende
-- foutafhandeling is in dezelfde wijziging rechtgezet.

alter table notitie drop constraint if exists notitie_object_type_check;
alter table notitie add constraint notitie_object_type_check
  check (object_type in ('taak', 'agenda_item', 'werkorder'));
