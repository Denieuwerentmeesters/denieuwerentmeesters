-- 0011 Object-administratie: rijkere contacten + achterstand op contracten.
-- Voor het koppelen van contact, pacht-/huurafspraak en documenten aan een
-- stamobject (perceel/gebouw) via de bestaande `verband`-laag.

-- Contacten (relatie) rijker maken: e-mail + telefoon naast het vrije veld.
alter table relatie  add column if not exists email text;
alter table relatie  add column if not exists telefoon text;

-- Contracten: handmatige achterstand (tot de financiële koppeling er is).
alter table contract add column if not exists achterstand numeric;
alter table contract add column if not exists achterstand_notitie text;
