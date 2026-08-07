-- Werkorders: uitvoerder als échte verwijzing naar het contact.
--
-- Tot nu toe volgde de werkorder-toewijzing het taak-patroon: een contact werd
-- opgeslagen als losse tekst in toegewezen_aan_naam. Dat is genoeg om een naam
-- te tonen, maar niet om de vraag "welke klussen liggen er bij De Vries?" te
-- beantwoorden — en hernoemt iemand het contact, dan loopt de werkorder scheef.
--
-- toegewezen_aan_naam blijft bestaan: voor een uitvoerder die (nog) geen
-- contactrecord heeft, en als momentopname van de naam bij toewijzen.

alter table werkorder add column if not exists uitvoerder_relatie_id uuid
  references relatie(id) on delete set null;

create index if not exists werkorder_uitvoerder_relatie_idx
  on werkorder (uitvoerder_relatie_id);
